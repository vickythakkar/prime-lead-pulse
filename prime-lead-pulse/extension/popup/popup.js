document.addEventListener('DOMContentLoaded', async () => {
  const loginSection = document.getElementById('loginSection');
  const loggedInSection = document.getElementById('loggedInSection');
  const errorMsg = document.getElementById('errorMsg');
  const accountsList = document.getElementById('accountsList');
  
  const apiUrlInput = document.getElementById('apiUrl');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  
  const loginBtn = document.getElementById('loginBtn');
  const addAccountBtn = document.getElementById('addAccountBtn');
  const cancelLoginBtn = document.getElementById('cancelLoginBtn');
  const loginTitle = document.getElementById('loginTitle');

  // Load state on startup
  await refreshUI();

  async function refreshUI() {
    const { session, sessions, apiUrl } = await chrome.storage.local.get(['session', 'sessions', 'apiUrl']);
    
    let activeSessions = {};
    if (sessions && Object.keys(sessions).length > 0) {
      activeSessions = sessions;
    } else if (session) {
      activeSessions[session.user.email] = session;
    }

    if (Object.keys(activeSessions).length > 0) {
      // Show logged in UI
      loggedInSection.classList.remove('hidden');
      loginSection.classList.add('hidden');
      
      accountsList.innerHTML = '';
      for (const email of Object.keys(activeSessions)) {
        const div = document.createElement('div');
        div.className = 'account-item';
        
        const span = document.createElement('span');
        span.textContent = email;
        
        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'logout-btn';
        logoutBtn.textContent = 'Remove';
        logoutBtn.onclick = () => removeAccount(email);
        
        div.appendChild(span);
        div.appendChild(logoutBtn);
        accountsList.appendChild(div);
      }
      
      // Auto-fill API URL for adding new accounts
      if (apiUrl) apiUrlInput.value = apiUrl;
      emailInput.value = '';
      passwordInput.value = '';
    } else {
      // Show login UI only
      loggedInSection.classList.add('hidden');
      loginSection.classList.remove('hidden');
      cancelLoginBtn.classList.add('hidden');
      loginTitle.textContent = "Log in to link your Gmail tracker";
    }
  }

  addAccountBtn.addEventListener('click', () => {
    loginSection.classList.remove('hidden');
    cancelLoginBtn.classList.remove('hidden');
    loginTitle.textContent = "Log in another account";
  });

  cancelLoginBtn.addEventListener('click', () => {
    loginSection.classList.add('hidden');
    errorMsg.textContent = '';
  });

  async function removeAccount(emailToRemove) {
    const { session, sessions } = await chrome.storage.local.get(['session', 'sessions']);
    
    let activeSessions = sessions || {};
    if (!sessions && session) {
      activeSessions = { [session.user.email]: session };
    }
    
    delete activeSessions[emailToRemove];
    
    // If we removed the primary session, promote another one
    let newPrimary = session;
    if (session && session.user.email === emailToRemove) {
      const remainingEmails = Object.keys(activeSessions);
      newPrimary = remainingEmails.length > 0 ? activeSessions[remainingEmails[0]] : null;
    }

    if (Object.keys(activeSessions).length === 0) {
      await chrome.storage.local.remove(['session', 'sessions', 'apiUrl', 'lastPoll']);
    } else {
      await chrome.storage.local.set({ 
        sessions: activeSessions,
        session: newPrimary
      });
    }
    
    await refreshUI();
  }

  loginBtn.addEventListener('click', async () => {
    const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "");
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!apiUrl || !email || !password) {
      errorMsg.textContent = 'Please fill all fields.';
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    errorMsg.textContent = '';

    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      let data;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Server returned non-JSON. Status: ${res.status}. Body: ${text.substring(0, 50)}`);
      }

      if (res.ok && data.success) {
        // Merge into existing sessions
        const { session: currentPrimary, sessions: currentSessions } = await chrome.storage.local.get(['session', 'sessions']);
        
        let newSessions = currentSessions || {};
        if (!currentSessions && currentPrimary) {
          newSessions = { [currentPrimary.user.email]: currentPrimary };
        }
        
        const newSession = data.session;
        newSessions[newSession.user.email] = newSession;
        
        await chrome.storage.local.set({
          sessions: newSessions,
          session: newSession, // Update primary fallback to most recently logged in
          apiUrl: apiUrl,
          lastPoll: 0 // Force poll to load the new emails
        });
        
        await refreshUI();
      } else {
        errorMsg.textContent = data.error || `Login failed (Status: ${res.status})`;
      }
    } catch (err) {
      console.error(err);
      errorMsg.textContent = 'API Error: ' + err.message;
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Log In';
    }
  });
});
