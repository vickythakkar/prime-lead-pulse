// ============================================================
// Prime Lead Pulse — Dashboard Auth Sync Content Script
// Automatically syncs Supabase auth session from the PLP Dashboard
// to the Chrome Extension so users never have to log in twice!
// ============================================================

(function() {
  const API_URL = window.location.origin;

  function findSupabaseSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const data = JSON.parse(raw);
            if (data && (data.access_token || data.session?.access_token)) {
              return data.session || data;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Prime Lead Pulse sync: Error reading localStorage', e);
    }
    return null;
  }

  let lastSyncedToken = null;

  function syncAuth() {
    const session = findSupabaseSession();
    if (session && session.access_token && session.access_token !== lastSyncedToken) {
      lastSyncedToken = session.access_token;
      chrome.runtime.sendMessage({
        action: 'DASHBOARD_LOGIN',
        apiUrl: API_URL,
        session: session
      }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('Prime Lead Pulse sync error:', chrome.runtime.lastError.message);
        } else {
          console.log('Prime Lead Pulse: Successfully synced dashboard session to extension for', session.user?.email);
          notifyPageConnected(session.user?.email);
        }
      });
    } else if (!session && lastSyncedToken) {
      // User logged out
      lastSyncedToken = null;
      chrome.runtime.sendMessage({ action: 'DASHBOARD_LOGOUT' });
    }
  }

  function notifyPageConnected(email) {
    window.postMessage({ type: 'PLP_EXTENSION_CONNECTED', email }, '*');
  }

  // 1. Initial check on page load
  syncAuth();

  // 2. Poll every 2 seconds while dashboard tab is open to catch login or token refresh
  setInterval(syncAuth, 2000);

  // 3. Listen to localStorage storage events
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('sb-')) {
      syncAuth();
    }
  });

  // 4. Listen to postMessage from web app
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'PLP_DASHBOARD_AUTH') {
      if (e.data.session) {
        lastSyncedToken = e.data.session.access_token;
        chrome.runtime.sendMessage({
          action: 'DASHBOARD_LOGIN',
          apiUrl: e.data.apiUrl || API_URL,
          session: e.data.session
        });
      } else if (e.data.action === 'LOGOUT') {
        lastSyncedToken = null;
        chrome.runtime.sendMessage({ action: 'DASHBOARD_LOGOUT' });
      }
    }
  });

  console.log('Prime Lead Pulse: Dashboard Auth Sync script loaded.');
})();
