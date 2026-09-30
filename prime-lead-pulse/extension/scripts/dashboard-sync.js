// This script runs on the Prime Lead Pulse dashboard to automatically sync authentication to the extension
let lastTokenStr = null;

function syncAuth() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
      const tokenStr = localStorage.getItem(key);
      if (tokenStr !== lastTokenStr) {
        lastTokenStr = tokenStr;
        try {
          const tokenObj = JSON.parse(tokenStr);
          if (tokenObj && tokenObj.access_token) {
            chrome.runtime.sendMessage({
              action: 'DASHBOARD_LOGIN',
              session: tokenObj,
              apiUrl: window.location.origin
            });
          }
        } catch(e) {}
      }
      return; // found it
    }
  }
  
  // If we get here, no token was found
  if (lastTokenStr !== null) {
    lastTokenStr = null;
    chrome.runtime.sendMessage({ action: 'DASHBOARD_LOGOUT' });
  }
}

// Poll every 2 seconds to catch React state changes since 'storage' event doesn't fire in the same tab
setInterval(syncAuth, 2000);
syncAuth();
