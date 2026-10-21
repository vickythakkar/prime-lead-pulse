
const DEFAULT_API_URL = 'https://prime-lead-pulse-sigma.vercel.app';

async function processRetryQueue() {
  const { retryQueue, apiUrl } = await chrome.storage.local.get(['retryQueue', 'apiUrl']);
  const activeApiUrl = apiUrl || DEFAULT_API_URL;
  if (!retryQueue || retryQueue.length === 0) return;
  
  const base = activeApiUrl.replace(/\/$/, '');
  
  // Create a copy of the queue so we can mutate it
  let currentQueue = [...retryQueue];
  
  for (let i = currentQueue.length - 1; i >= 0; i--) {
    const payload = currentQueue[i];
    try {
      const session = await getSessionForSender(payload.sender_email);
      const headers = { 'Content-Type': 'application/json' };
      if (session && session.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      
      const res = session 
        ? await fetchWithAuth(`${base}/api/emails?t=${Date.now()}`, { cache: "no-store", 
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          }, session, apiUrl, payload.sender_email)
        : await fetch(`${base}/api/emails?t=${Date.now()}`, { cache: "no-store",
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
      
      if (res.ok) {
        // Success! Remove from queue
        currentQueue.splice(i, 1);
        await chrome.storage.local.set({ retryQueue: currentQueue });
      }
    } catch (e) {
      // Keep it in the queue for next time
    }
  }
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
          if ([400, 401, 403].includes(refreshRes.status)) {
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
  const cleanSender = (senderEmail || '').toLowerCase();
  if (sessions && cleanSender && sessions[cleanSender]) return sessions[cleanSender];
  if (session && session.user && cleanSender && session.user.email?.toLowerCase() === cleanSender) return session;
  if (session) return session; // Fallback: allow tracking into the active PLP dashboard
  if (sessions && Object.keys(sessions).length > 0) {
    return Object.values(sessions)[0];
  }
  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'DASHBOARD_LOGIN') {
    const plpEmail = request.session?.user?.email;
    const apiUrl = request.apiUrl || DEFAULT_API_URL;
    if (plpEmail) {
      chrome.storage.local.get(['sessions'], (data) => {
        const sessions = data.sessions || {};
        sessions[plpEmail.toLowerCase()] = request.session;
        chrome.storage.local.set({ sessions, apiUrl, session: request.session, lastPoll: 0 }, () => {
          connectRealtime();
          pollForNotifications();
        });
      });
    } else {
      chrome.storage.local.set({ session: request.session, apiUrl, lastPoll: 0 }, () => {
        connectRealtime();
        pollForNotifications();
      });
    }
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
        const activeApiUrl = apiUrl || DEFAULT_API_URL;
        
        const senderEmail = request.payload.sender_email;
        const session = await getSessionForSender(senderEmail);

        const base = activeApiUrl.replace(/\/$/, '');
        const headers = { 'Content-Type': 'application/json' };
        if (session && session.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = session
          ? await fetchWithAuth(`${base}/api/emails?t=${Date.now()}`, { cache: "no-store", 
              method: 'POST',
              headers,
              body: JSON.stringify(request.payload)
            }, session, activeApiUrl, senderEmail)
          : await fetch(`${base}/api/emails?t=${Date.now()}`, { cache: "no-store",
              method: 'POST',
              headers,
              body: JSON.stringify(request.payload)
            });

        let data;
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Server returned non-JSON response (Status: ${res.status}). Response snippet: ${text.substring(0, 100)}...`);
        }
        
        if (!res.ok) {
          throw new Error(`API Error: ${data?.error || res.statusText || 'Unknown server error'}`);
        }

        // Immediately update local caches so the email is known right away
        if (data?.email) {
          const parentEmail = session?.user?.email || senderEmail;
          const targetAddresses = new Set();
          if (parentEmail) targetAddresses.add(parentEmail.toLowerCase());
          if (senderEmail) targetAddresses.add(senderEmail.toLowerCase());
          for (const addr of targetAddresses) {
            const key = `cached_emails_${addr}`;
            const existingData = await chrome.storage.local.get([key]);
            const list = existingData[key] || [];
            if (!list.some(e => e.id === data.email.id)) {
              list.unshift(data.email);
              await chrome.storage.local.set({ [key]: list });
            }
          }
        }
        
        sendResponse({ success: true, data });
      } catch (err) {
        // Queue for retry
        chrome.storage.local.get(['retryQueue'], async (data) => {
          const retryQueue = data.retryQueue || [];
          retryQueue.push(request.payload);
          await chrome.storage.local.set({ retryQueue });
        });

        let errorMsg = err.message;
        if (errorMsg === "Failed to fetch") {
            errorMsg = "Failed to fetch. If you are stuck on a localhost connection, please refresh the live Vercel dashboard to sync.";
        }
        
        sendResponse({ success: false, error: errorMsg });
      }
    })();
    return true; 
  }

  if (request.action === 'FORCE_POLL') {
    pollForNotifications();
    sendResponse({ success: true });
    return;
  }
  
  if (request.action === 'GET_STATS') {
    (async () => {
      try {
        const { apiUrl } = await chrome.storage.local.get(['apiUrl']);
        const senderEmail = request.senderEmail;
        const session = await getSessionForSender(senderEmail);
        const parentEmail = session?.user?.email || senderEmail;
        
        // Prioritize active sender address first, then fallback to parent
        const keysToGet = [];
        if (senderEmail) keysToGet.push(`cached_emails_${senderEmail.toLowerCase()}`);
        if (parentEmail) keysToGet.push(`cached_emails_${parentEmail.toLowerCase()}`);
        
        const data = await chrome.storage.local.get(keysToGet);
        let cached = (senderEmail && data[`cached_emails_${senderEmail.toLowerCase()}`]) ||
                     (parentEmail && data[`cached_emails_${parentEmail.toLowerCase()}`]);
        
        // Always query server for fresh emails to ensure newly sent & replied emails are up-to-date
        const activeApiUrl = apiUrl || DEFAULT_API_URL;
        const base = activeApiUrl.replace(/\/$/, '');
        const queryUrl = senderEmail 
          ? `${base}/api/emails?sender_email=${encodeURIComponent(senderEmail)}&limit=100&t=${Date.now()}`
          : `${base}/api/emails?limit=100&t=${Date.now()}`;
        
        const headers = {};
        if (session && session.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

        try {
          const res = session 
            ? await fetchWithAuth(queryUrl, { cache: "no-store", headers }, session, activeApiUrl, senderEmail)
            : await fetch(queryUrl, { cache: "no-store", headers });

          if (res.ok) {
            const resData = await res.json();
            const freshEmails = resData.emails || [];
            if (freshEmails.length > 0) {
              cached = freshEmails;
              const cacheUpdates = {};
              if (senderEmail) cacheUpdates[`cached_emails_${senderEmail.toLowerCase()}`] = freshEmails;
              if (parentEmail) cacheUpdates[`cached_emails_${parentEmail.toLowerCase()}`] = freshEmails;
              await chrome.storage.local.set(cacheUpdates);
            }
          }
        } catch (fetchErr) {
          console.warn('GET_STATS network fetch failed, using cache:', fetchErr);
        }

        sendResponse({ success: true, data: { emails: cached || [] } });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (request.action === 'GET_TEMPLATES') {
    (async () => {
      try {
        const { apiUrl } = await chrome.storage.local.get(['apiUrl']);
        const activeApiUrl = apiUrl || DEFAULT_API_URL;

        const senderEmail = request.senderEmail;
        const session = await getSessionForSender(senderEmail);

        const base = activeApiUrl.replace(/\/$/, '');
        const res = await fetchWithAuth(`${base}/api/templates`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }, session, activeApiUrl, senderEmail);

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

// ============================================================
// Notification Trigger Helper (Deduplicated & Subject-Grouped)
// ============================================================
const TEAM_NAMES = {
  'michael.primerealops.com@gmail.com': 'Michael Ross',
  'michael.primerealops@gmail.com': 'Michael Ross',
  'tyler.primerealops@gmail.com': 'Tyler Durden',
  'shiva.primerealops@gmail.com': 'Shiva Nath',
  'taarak.primerealops@gmail.com': 'Taarak Vakil',
  'taarak.prime@diyflatfee.com': 'Taarak Vakil',
  'tony.primerealops@gmail.com': 'Tony Rydinger',
  'kisha.primerealops@gmail.com': 'Kisha Brown',
  'victor.primerealops@gmail.com': 'Victor Wiseman',
  'aisha.primerealops@gmail.com': 'Aisha Patel',
  'dan.primerealops@gmail.com': 'Dan Kenton',
  'samantha.primerealops@gmail.com': 'Samantha Wheeler',
  'nisha.primerealops@gmail.com': 'Nisha Desai',
  'dlewis@diyflatfee.com': 'Darrell Lewis',
  'vicky@diyflatfee.com': 'Vicky Thakkar'
};

function getFriendlyRecipientName(rawRecipient, contactNames) {
  if (!rawRecipient) return 'Someone';

  // If there are multiple comma-separated recipients, check how many unique
  const list = rawRecipient.split(',').map(s => s.trim()).filter(Boolean);
  if (list.length > 1) {
    const emails = new Set(list.map(r => r.replace(/.*<([^>]+)>.*/, '$1').replace(/[<>]/g, '').trim().toLowerCase()));
    if (emails.size > 1) return 'Someone';
  }

  const single = list[0] || rawRecipient;

  // 1. Check pre-seeded team names
  const cleanEmail = single.replace(/.*<([^>]+)>.*/, '$1').replace(/[<>]/g, '').trim().toLowerCase();
  if (TEAM_NAMES[cleanEmail]) {
    return TEAM_NAMES[cleanEmail];
  }

  // 2. If format is "Tyler Durden <Tyler.Primerealops@gmail.com>", extract "Tyler Durden"
  const nameMatch = single.match(/^([^<]+)<[^>]+>/);
  if (nameMatch && nameMatch[1].trim()) {
    let parsedName = nameMatch[1].trim();
    parsedName = parsedName.replace(/\s*\([^)]*@?[^)]*\)/g, '').trim();
    if (!parsedName.includes('@') && parsedName.length >= 2) return parsedName;
  }

  // 3. Check contactNames dictionary
  if (contactNames && contactNames[cleanEmail]) {
    return contactNames[cleanEmail].replace(/\s*\([^)]*@?[^)]*\)/g, '').trim();
  }

  // 4. Fallback: Parse name from email username if dotted (e.g. "tyler.durden@..." or "tyler.primerealops@...")
  const username = cleanEmail.split('@')[0];
  if (username && username.includes('.')) {
    const ignoreWords = ['primerealops', 'prime', 'diyflatfee', 'diyrealty', 'realty', 'real', 'com', 'org', 'net', 'co', 'in', 'io', 'inc', 'llc', 'ops', 'bridge', 'pulse'];
    const parts = username.split('.').filter(p => p.length > 1 && !ignoreWords.includes(p.toLowerCase()));
    if (parts.length > 0) {
      return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    }
  }

  return single.replace(/\s*\([^)]*@?[^)]*\)/g, '').trim();
}

async function triggerNotificationsForEvents(eventsWithEmail) {
  if (!eventsWithEmail || eventsWithEmail.length === 0) return;

  const { contactNames } = await chrome.storage.local.get(['contactNames']);
  const knownNames = contactNames || {};
  if (!knownNames['tyler.primerealops@gmail.com']) knownNames['tyler.primerealops@gmail.com'] = 'Tyler Durden';
  if (!knownNames['victor.primerealops@gmail.com']) knownNames['victor.primerealops@gmail.com'] = 'Victor Thakkar';
  if (!knownNames['taarak.primerealops@gmail.com']) knownNames['taarak.primerealops@gmail.com'] = 'Taarak';
  if (!knownNames['dlewis@diyflatfee.com']) knownNames['dlewis@diyflatfee.com'] = 'Darrell Lewis';

  const grouped = {};
  for (const { ev, email } of eventsWithEmail) {
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
    const friendlyName = getFriendlyRecipientName(email.recipient, knownNames);
    const recipientList = (email.recipient || '').split(',').map(s => s.trim()).filter(Boolean);
    const uniqueEmails = new Set(recipientList.map(r => r.replace(/.*<([^>]+)>.*/, '$1').replace(/[<>]/g, '').trim().toLowerCase()));
    const isMultiple = uniqueEmails.size > 1;
    
    let message;
    if (isMultiple) {
      message = isClick 
        ? `Someone clicked a link in your email with subject "${email.subject}"` 
        : `Someone opened your email with subject "${email.subject}"`;
    } else {
      message = isClick 
        ? `${friendlyName} clicked a link in your email - "${email.subject}"` 
        : `${friendlyName} opened your email - "${email.subject}"`;
    }
    if (count > 1) {
      message += ` (${count} times)`;
    }
      
    // Use a 1-minute bucket for the notification ID to debounce duplicate popups
    const timeBucket = Math.floor(Date.now() / 60000);
    const notificationId = `${key}_${timeBucket}`;
    
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: 'icon.gif',
      title,
      message,
      priority: 0
    });

    // Automatically clear the notification after 8.5 seconds (7-10s length)
    setTimeout(() => {
      chrome.notifications.clear(notificationId);
    }, 8500);
  }
}

// ============================================================
// Supabase Realtime WebSocket Client (Instant < 1s Alerts)
// ============================================================
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudnVlZnRqdGh4eGlsaXVzdnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2OTkwMDUsImV4cCI6MjEwNjI3NTAwNX0.QzQ-jALg_AdEFkwIWb4S7bW6TP31RnfeB2SxOe65wik';

let realtimeWs = null;
let realtimeHeartbeatInterval = null;
let realtimeReconnectTimeout = null;
let realtimeRefCounter = 0;
let subscribedUserIds = new Set();

function connectRealtime() {
  if (realtimeWs && (realtimeWs.readyState === WebSocket.OPEN || realtimeWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    const wsUrl = `wss://rnvueftjthxxiliusvxi.supabase.co/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;
    realtimeWs = new WebSocket(wsUrl);

    realtimeWs.onopen = async () => {
      console.log('[PLP Realtime] WebSocket connected');
      if (realtimeReconnectTimeout) {
        clearTimeout(realtimeReconnectTimeout);
        realtimeReconnectTimeout = null;
      }

      // 25-second heartbeat to keep connection alive
      clearInterval(realtimeHeartbeatInterval);
      realtimeHeartbeatInterval = setInterval(() => {
        if (realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
          realtimeWs.send(JSON.stringify({
            topic: 'phoenix',
            event: 'heartbeat',
            payload: {},
            ref: String(++realtimeRefCounter)
          }));
        }
      }, 25000);

      // Subscribe to all active account user channels
      await subscribeToActiveUserChannels();
    };

    realtimeWs.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'broadcast' && msg.payload?.event === 'tracking_event') {
          await handleIncomingRealtimeEvent(msg.payload.payload);
        }
      } catch (err) {
        console.error('[PLP Realtime] Error parsing message:', err);
      }
    };

    realtimeWs.onclose = () => {
      cleanupRealtime();
      if (!realtimeReconnectTimeout) {
        realtimeReconnectTimeout = setTimeout(connectRealtime, 5000);
      }
    };

    realtimeWs.onerror = () => {
      try { realtimeWs.close(); } catch (e) {}
    };
  } catch (err) {
    if (!realtimeReconnectTimeout) {
      realtimeReconnectTimeout = setTimeout(connectRealtime, 10000);
    }
  }
}

function cleanupRealtime() {
  clearInterval(realtimeHeartbeatInterval);
  realtimeHeartbeatInterval = null;
  subscribedUserIds.clear();
  realtimeWs = null;
}

async function subscribeToActiveUserChannels() {
  if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;

  const { session, sessions } = await chrome.storage.local.get(['session', 'sessions']);
  const userIds = new Set();
  if (session?.user?.id) userIds.add(session.user.id);
  if (sessions) {
    Object.values(sessions).forEach(s => {
      if (s?.user?.id) userIds.add(s.user.id);
    });
  }

  // Scan cached_emails keys to ensure user IDs are always discovered
  const allStorage = await chrome.storage.local.get(null);
  for (const [k, v] of Object.entries(allStorage)) {
    if (k.startsWith('cached_emails_') && Array.isArray(v)) {
      v.forEach(e => {
        if (e.user_id) userIds.add(e.user_id);
      });
    }
  }

  if (userIds.size === 0) {
    userIds.add('a279f048-8953-4205-8705-04d59b4c60ee');
  }

  for (const uid of userIds) {
    if (!subscribedUserIds.has(uid)) {
      subscribedUserIds.add(uid);
      const joinMsg = {
        topic: `realtime:user_${uid}`,
        event: 'phx_join',
        payload: { config: { broadcast: { self: false } } },
        ref: String(++realtimeRefCounter)
      };
      realtimeWs.send(JSON.stringify(joinMsg));
      console.log(`[PLP Realtime] Subscribed to realtime:user_${uid}`);
    }
  }
}

async function handleIncomingRealtimeEvent(payload) {
  if (!payload || !payload.id) return;

  // 1. Deduplicate with knownEventIds
  const { knownEventIds } = await chrome.storage.local.get(['knownEventIds']);
  const currentKnownIds = new Set(knownEventIds || []);
  if (currentKnownIds.has(payload.id)) return;
  currentKnownIds.add(payload.id);
  await chrome.storage.local.set({ knownEventIds: Array.from(currentKnownIds) });

  // 2. Trigger instant notification
  const syntheticEmail = {
    id: payload.email_id,
    subject: payload.subject,
    recipient: payload.recipient,
    sender_email: payload.sender_email
  };
  triggerNotificationsForEvents([{ ev: payload, email: syntheticEmail }]);

  // 3. Immediately update across ALL cached_emails_* lists in storage
  const allStorage = await chrome.storage.local.get(null);
  const updates = {};
  for (const [k, list] of Object.entries(allStorage)) {
    if (k.startsWith('cached_emails_') && Array.isArray(list)) {
      const idx = list.findIndex(e => e.id === payload.email_id);
      if (idx !== -1) {
        const updatedList = [...list];
        const email = { ...updatedList[idx] };
        email.tracking_events = email.tracking_events || [];
        if (!email.tracking_events.some(e => e.id === payload.id)) {
          email.tracking_events.unshift({
            id: payload.id,
            event_type: payload.event_type,
            url: payload.url,
            created_at: payload.created_at
          });
          if (payload.event_type === 'open') email.opens = (email.opens || 0) + 1;
          if (payload.event_type === 'click') email.clicks = (email.clicks || 0) + 1;
          updatedList[idx] = email;
          updates[k] = updatedList;
        }
      }
    }
  }
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  // 4. Directly notify all open Gmail tabs so the DOM badge flips in real-time
  try {
    chrome.tabs.query({}, (tabs) => {
      (tabs || []).forEach(t => {
        if (t.id) {
          chrome.tabs.sendMessage(t.id, { action: 'REALTIME_EVENT', payload }).catch(() => {});
        }
      });
    });
  } catch (err) {}

  // 5. Gently poll in the background to ensure entire mailbox stays 100% in sync
  pollForNotifications();
}

// Keep service worker connected while user has Gmail open
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'gmail-active') {
    connectRealtime();
  }
});

// ------ Notification Polling & Idle Detection ------
// 10-minute idle detection threshold (600 seconds)
chrome.idle.setDetectionInterval(600);

// When user returns from idle/locked state, immediately trigger a fresh poll
chrome.idle.onStateChanged.addListener((newState) => {
  if (newState === 'active') {
    pollForNotifications();
  }
});

// Poll every 30 seconds (0.5 minutes) while active
chrome.alarms.create("pollStats", { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "pollStats") {
    pollForNotifications();
  }
});

// Helper to check if user is currently idle or screen is locked
function checkIsUserIdle() {
  return new Promise((resolve) => {
    chrome.idle.queryState(600, (state) => {
      resolve(state !== 'active');
    });
  });
}

async function pollForNotifications() {
  // If user has been idle for >= 10 minutes or computer is locked, skip polling to save Vercel compute
  const isIdle = await checkIsUserIdle();
  if (isIdle) return;

  const { lastPoll } = await chrome.storage.local.get('lastPoll');
  if (lastPoll && Date.now() - lastPoll < 25000) return; // 25s throttle
  await chrome.storage.local.set({ lastPoll: Date.now() });

  if (isPolling) return;
  isPolling = true;

  await processRetryQueue();

  try {
    const { session, sessions, apiUrl, knownEventIds } = await chrome.storage.local.get(['session', 'sessions', 'apiUrl', 'knownEventIds']);
    const activeApiUrl = apiUrl || DEFAULT_API_URL;

    // Build array of all active sessions
    const activeSessions = [];
    if (sessions) {
      Object.values(sessions).forEach(s => activeSessions.push(s));
    } else if (session) {
      activeSessions.push(session);
    }
    
    if (activeSessions.length === 0) return;

    const base = activeApiUrl.replace(/\/$/, '');
    const currentKnownIds = new Set(knownEventIds || []);
    const newEventsToNotify = [];

    // Poll for each session
    for (const currentSession of activeSessions) {
      const res = await fetchWithAuth(`${base}/api/emails?t=${Date.now()}`, { cache: "no-store", 
        headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
      }, currentSession, apiUrl, currentSession.user?.email);
      
      if (!res.ok) continue;
      
      const { emails } = await res.json();
      
      // Save emails for content.js across both the account owner and all sending addresses
      const senders = new Set();
      if (currentSession.user?.email) senders.add(currentSession.user.email.toLowerCase());
      emails.forEach(e => {
        if (e.sender_email) senders.add(e.sender_email.toLowerCase());
      });
      const cacheUpdates = {};
      for (const s of senders) {
        cacheUpdates[`cached_emails_${s}`] = emails;
      }
      await chrome.storage.local.set(cacheUpdates);

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

    triggerNotificationsForEvents(newEventsToNotify);

  } catch (err) {
    console.error('Polling error:', err);
  } finally {
    isPolling = false;
  }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.session || changes.sessions)) {
    subscribeToActiveUserChannels();
  }
});

chrome.runtime.onStartup.addListener(() => {
  connectRealtime();
  pollForNotifications();
});

chrome.runtime.onInstalled.addListener(() => {
  connectRealtime();
  pollForNotifications();
});

// Initial startup connection
connectRealtime();
