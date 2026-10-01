
async function processRetryQueue() {
  const { retryQueue, apiUrl } = await chrome.storage.local.get(['retryQueue', 'apiUrl']);
  if (!retryQueue || retryQueue.length === 0 || !apiUrl) return;
  
  const base = apiUrl.replace(/\/$/, '');
  
  // Create a copy of the queue so we can mutate it
  let currentQueue = [...retryQueue];
  
  for (let i = currentQueue.length - 1; i >= 0; i--) {
    const payload = currentQueue[i];
    try {
      const session = await getSessionForSender(payload.sender_email);
      const res = await fetchWithAuth(`${base}/api/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      }, session, apiUrl, payload.sender_email);
      
      if (res.ok) {
        // Success! Remove from queue
        currentQueue.splice(i, 1);
      }
    } catch (e) {
      // Keep it in the queue for next time
    }
  }
  
  await chrome.storage.local.set({ retryQueue: currentQueue });
}

// ============================================================
// Prime Lead Pulse — Background Service Worker (v3)
// Fixes:
//  - Mutex lock on pollForNotifications prevents race-condition notification spam
//  - Reduced alarm frequency
//  - Smarter notification deduplication
// ============================================================

let isPolling = false; // Mutex lock to prevent concurrent polls

let refreshTokenPromise = null;

// Helper to fetch with automatic token refresh
async function fetchWithAuth(url, options, session, apiUrl, senderEmail) {
  let res = await fetch(url, options);
  
  if (res.status === 401 && session.refresh_token) {
    // 1. Check if another request ALREADY refreshed the token while we were in-flight
    const { session: currentSession, sessions: currentSessions } = await chrome.storage.local.get(['session', 'sessions']);
    let latestSession = session;
    
    if (senderEmail && currentSessions && currentSessions[senderEmail]) {
      latestSession = currentSessions[senderEmail];
    } else if (currentSession) {
      latestSession = currentSession;
    }
    
    // If the token in storage has a different access_token, it means someone else refreshed it!
    // We should NOT refresh again with our old token (which causes token reuse revocation).
    // We should just instantly retry the request with the new token.
    if (latestSession && latestSession.access_token !== session.access_token) {
      options.headers['Authorization'] = `Bearer ${latestSession.access_token}`;
      return await fetch(url, options);
    }

    if (!refreshTokenPromise) {
      refreshTokenPromise = (async () => {
        try {
          const base = apiUrl.replace(/\/$/, '');
          const refreshRes = await fetch(`${base}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: session.refresh_token })
          });
          
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData.success) {
              const newSession = refreshData.session;
              if (senderEmail) {
                const { sessions } = await chrome.storage.local.get(['sessions']);
                const newSessions = sessions || {};
                newSessions[senderEmail] = newSession;
                await chrome.storage.local.set({ sessions: newSessions, session: newSession });
              } else {
                await chrome.storage.local.set({ session: newSession });
              }
              return newSession;
            }
          }
          
          // ONLY delete the session if the refresh token was actively rejected by Supabase (400, 401, 403).
          // If it's a 5xx error (Vercel cold start timeout) or network error, KEEP the session so it can retry later!
          if (refreshRes.status >= 400 && refreshRes.status < 500) {
            if (senderEmail) {
              const { sessions } = await chrome.storage.local.get(['sessions']);
              if (sessions && sessions[senderEmail]) {
                delete sessions[senderEmail];
                await chrome.storage.local.set({ sessions });
              }
            }
            
            const { session: fallbackSession } = await chrome.storage.local.get(['session']);
            if (fallbackSession && fallbackSession.access_token === session.access_token) {
              await chrome.storage.local.remove('session');
            }
          }
          
          return null;
        } finally {
          // Clear the promise after it's done so future expirations can trigger a new refresh
          refreshTokenPromise = null;
        }
      })();
    }
    
    const newSession = await refreshTokenPromise;
    
    if (newSession) {
      options.headers['Authorization'] = `Bearer ${newSession.access_token}`;
      res = await fetch(url, options);
    }
  }
  return res;
}

async function getSessionForSender(senderEmail) {
  const { session, sessions } = await chrome.storage.local.get(['session', 'sessions']);
  if (sessions && sessions[senderEmail]) return sessions[senderEmail];
  if (session && session.user && session.user.email === senderEmail) return session;
  if (session) return session; // Fallback: allow tracking into the active PLP dashboard
  throw new Error(`Please open the Prime Lead Pulse dashboard and log in to link this account.`);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'DASHBOARD_LOGIN') {
    const plpEmail = request.session?.user?.email;
    if (plpEmail) {
      chrome.storage.local.get(['sessions'], (data) => {
        const sessions = data.sessions || {};
        sessions[plpEmail] = request.session;
        chrome.storage.local.set({ sessions, apiUrl: request.apiUrl });
      });
    }
    // Also save legacy session
    chrome.storage.local.set({ session: request.session, apiUrl: request.apiUrl });
    sendResponse({ success: true });
    return;
  }
  
  if (request.action === 'DASHBOARD_LOGOUT') {
    // We do not clear ALL sessions in the multi-tenant map, 
    // but we SHOULD clear the fallback session so it stops using a dead token.
    chrome.storage.local.remove('session');
    sendResponse({ success: true });
    return;
  }

  if (request.action === 'CREATE_EMAIL') {
    (async () => {
      try {
        const { apiUrl } = await chrome.storage.local.get(['apiUrl']);
        if (!apiUrl) throw new Error('API URL not set');
        
        const senderEmail = request.payload.sender_email;
        const session = await getSessionForSender(senderEmail);

        const base = apiUrl.replace(/\/$/, '');
        const res = await fetchWithAuth(`${base}/api/emails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(request.payload)
        }, session, apiUrl, senderEmail);

                let data;
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Server returned non-JSON response (Status: ${res.status}). This usually means the server is down, timed out, or the API URL is incorrect. Response snippet: ${text.substring(0, 100)}...`);
        }
        sendResponse({ success: res.ok, data });
      } catch (err) {
        let errorMsg = err.message;
        if (errorMsg === "Failed to fetch") {
            errorMsg = "Failed to fetch. If you are stuck on a localhost connection, please refresh the live Vercel dashboard to sync.";
        }
        sendResponse({ success: false, error: errorMsg });
      }
    })();
    return true; 
  }

  if (request.action === 'GET_STATS') {
    (async () => {
      try {
        // Attempt to flush any pending created emails
        await processRetryQueue().catch(e => console.error("Retry queue flush failed:", e));
        const { apiUrl } = await chrome.storage.local.get(['apiUrl']);
        if (!apiUrl) throw new Error('API URL not set');

        const senderEmail = request.senderEmail;
        const session = await getSessionForSender(senderEmail);

        const base = apiUrl.replace(/\/$/, '');
        const res = await fetchWithAuth(`${base}/api/emails`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }, session, apiUrl, senderEmail);

                let data;
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Server returned non-JSON response (Status: ${res.status}). This usually means the server is down, timed out, or the API URL is incorrect. Response snippet: ${text.substring(0, 100)}...`);
        }
        sendResponse({ success: res.ok, data });
      } catch (err) {
        let errorMsg = err.message;
        if (errorMsg === "Failed to fetch") {
            errorMsg = "Failed to fetch. If you are stuck on a localhost connection, please refresh the live Vercel dashboard to sync.";
        }
        sendResponse({ success: false, error: errorMsg });
      }
    })();
    return true;
  }

  if (request.action === 'GET_TEMPLATES') {
    (async () => {
      try {
        const { apiUrl } = await chrome.storage.local.get(['apiUrl']);
        if (!apiUrl) throw new Error('API URL not set');

        const senderEmail = request.senderEmail;
        const session = await getSessionForSender(senderEmail);

        const base = apiUrl.replace(/\/$/, '');
        const res = await fetchWithAuth(`${base}/api/templates`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }, session, apiUrl, senderEmail);

                let data;
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Server returned non-JSON response (Status: ${res.status}). This usually means the server is down, timed out, or the API URL is incorrect. Response snippet: ${text.substring(0, 100)}...`);
        }
        sendResponse({ success: res.ok, data });
      } catch (err) {
        let errorMsg = err.message;
        if (errorMsg === "Failed to fetch") {
            errorMsg = "Failed to fetch. If you are stuck on a localhost connection, please refresh the live Vercel dashboard to sync.";
        }
        sendResponse({ success: false, error: errorMsg });
      }
    })();
    return true;
  }
});

// ------ Notification Polling ------
// Poll every 15 seconds
chrome.alarms.create("pollStats", { periodInMinutes: 0.25 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "pollStats") {
    pollForNotifications();
  }
});

pollForNotifications(); // Initial cache population

async function pollForNotifications() {
  if (isPolling) return;
  isPolling = true;

  try {
    const { session, sessions, apiUrl, knownEventIds } = await chrome.storage.local.get(['session', 'sessions', 'apiUrl', 'knownEventIds']);
    if (!apiUrl) return;

    // Build array of all active sessions
    const activeSessions = [];
    if (sessions) {
      Object.values(sessions).forEach(s => activeSessions.push(s));
    } else if (session) {
      activeSessions.push(session);
    }
    
    if (activeSessions.length === 0) return;

    const base = apiUrl.replace(/\/$/, '');
    const currentKnownIds = new Set(knownEventIds || []);
    const newEventsToNotify = [];

    // Poll for each session
    for (const currentSession of activeSessions) {
      const res = await fetchWithAuth(`${base}/api/emails`, {
        headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
      }, currentSession, apiUrl, currentSession.user?.email);
      
      if (!res.ok) continue;
      
      const { emails } = await res.json();
      
      // Save emails for content.js so it doesn't have to poll the API
      if (currentSession.user?.email) {
        await chrome.storage.local.set({ [`cached_emails_${currentSession.user.email}`]: emails });
      }

      for (const email of emails) {
        if (!email.tracking_events) continue;
        for (const ev of email.tracking_events) {
          if (!currentKnownIds.has(ev.id)) {
            currentKnownIds.add(ev.id);
            if (knownEventIds && knownEventIds.length > 0) {
              newEventsToNotify.push({ ev, email });
            }
          }
        }
      }
    }

    const MAX_EVENTS = 1000;
    let knownArray = Array.from(currentKnownIds);
    if (knownArray.length > MAX_EVENTS) {
      knownArray = knownArray.slice(knownArray.length - MAX_EVENTS);
    }
    await chrome.storage.local.set({ knownEventIds: knownArray });

    const grouped = {};
    for (const { ev, email } of newEventsToNotify) {
      const eventTime = new Date(ev.created_at).getTime();
      if (Date.now() - eventTime > 10 * 60 * 1000) continue; 

      // Group by normalized subject instead of email.id so that multiple opens in the same thread
      // (e.g., "Subject" and "Re: Subject") are bundled into a single notification.
      const cleanSubject = (email.subject || '').replace(/^((Re|Fwd|Fw|Aw|Wg|Tr|Rv|Sv|Vs|Vl|Res|Enc):\s*)+/ig, '').trim().toLowerCase();
      const key = `${cleanSubject}_${ev.event_type}`;
      if (!grouped[key]) {
        grouped[key] = { email, eventType: ev.event_type, count: 0, url: ev.url };
      }
      grouped[key].count++;
    }

    for (const key of Object.keys(grouped)) {
      const { email, eventType, count, url } = grouped[key];
      const isClick = eventType === 'click';
      const title = isClick ? 'Link Clicked' : 'Email Opened';
      const recipient = email.recipient || 'Unknown Recipient';
      const isMultiple = recipient.includes(',');
      
      let message;
      if (isMultiple) {
        message = isClick 
          ? `Someone clicked a link in your email to ${recipient} - "${email.subject}"` 
          : `Someone opened your email to ${recipient} - "${email.subject}"`;
      } else {
        message = isClick 
          ? `${recipient} clicked a link in your email - "${email.subject}"` 
          : `${recipient} opened your email - "${email.subject}"`;
      }
      if (count > 1) {
        message += ` (${count} times)`;
      }
        
      // Use a 1-minute bucket for the notification ID.
      // This ensures that if 3 pixels fire within 60 seconds of each other across different polling cycles,
      // they simply update the ONE existing notification on the screen rather than stacking 3 popups.
      const timeBucket = Math.floor(Date.now() / 60000);
      chrome.notifications.create(`${key}_${timeBucket}`, {
        type: 'basic',
        iconUrl: 'icon.gif',
        title,
        message,
        priority: 2
      });
    }

  } catch (err) {
    console.error('Polling error:', err);
  } finally {
    isPolling = false;
  }
}
