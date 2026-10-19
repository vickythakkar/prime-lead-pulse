/**
 * LinkedIn Auto Welcome & Responder - Content Script
 * Robust DOM-invariant detection, button-driven discovery, and safe typing simulation.
 */

let isRunning = false;
let shouldStop = false;
let hudElement = null;

const DEFAULT_SETTINGS = {
  enabled: true,
  template: "Hi {firstName}, thanks for connecting! Looking forward to staying in touch.",
  dailyLimit: 15,
  minDelay: 25,
  maxDelay: 45,
  skipExistingChats: true,
  autoScanInterval: 60
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(minSeconds, maxSeconds) {
  const min = Math.max(10, Number(minSeconds) || 25);
  const max = Math.max(min + 2, Number(maxSeconds) || 45);
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch (e) {
    return url.split('?')[0].replace(/\/+$/, '').toLowerCase();
  }
}

function extractFirstName(fullName) {
  if (!fullName) return 'there';
  let cleaned = fullName
    .replace(/\b(dr|mr|mrs|ms|prof|ph\.?d|m\.?d|mba|pmp|cpa|ca)\b\.?/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[,|/\\-].*$/, '')
    .trim();

  const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 0) return 'there';

  let first = parts[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

async function getExtensionData() {
  try {
    const local = await chrome.storage.local.get(['settings', 'stats', 'sentHistory']);
    const today = getTodayString();
    const settings = { ...DEFAULT_SETTINGS, ...(local.settings || {}) };
    let stats = local.stats || { todayCount: 0, lastResetDate: today, totalSent: 0 };
    if (stats.lastResetDate !== today) {
      stats.todayCount = 0;
      stats.lastResetDate = today;
      await chrome.storage.local.set({ stats });
    }
    const sentHistory = local.sentHistory || [];
    return { settings, stats, sentHistory };
  } catch (err) {
    const response = await chrome.runtime.sendMessage({ action: 'GET_DATA' });
    return response.data;
  }
}

// In-Page HUD
function getOrCreateHud() {
  if (hudElement && document.body.contains(hudElement)) {
    return hudElement;
  }

  const existing = document.getElementById('law-floating-hud');
  if (existing) {
    hudElement = existing;
    return hudElement;
  }

  const hud = document.createElement('div');
  hud.id = 'law-floating-hud';
  hud.className = 'law-hidden';
  hud.innerHTML = `
    <div class="law-hud-header">
      <div class="law-hud-title">
        <span class="law-hud-pulse"></span>
        <span>LinkedIn Auto Welcome</span>
      </div>
    </div>
    <div class="law-hud-status" id="law-hud-status-text">Initializing...</div>
    <div class="law-hud-meta">
      <span id="law-hud-progress">Today: --/--</span>
      <span class="law-hud-countdown" id="law-hud-timer"></span>
    </div>
    <button class="law-hud-stop-btn" id="law-hud-stop-btn">Stop Automation</button>
  `;

  document.body.appendChild(hud);

  document.getElementById('law-hud-stop-btn')?.addEventListener('click', () => {
    stopAutomation('Stopped by user via on-screen HUD');
  });

  hudElement = hud;
  return hudElement;
}

function updateHud(statusText, progressText = '', countdownSeconds = 0) {
  const hud = getOrCreateHud();
  hud.classList.remove('law-hidden');

  const statusEl = document.getElementById('law-hud-status-text');
  const progressEl = document.getElementById('law-hud-progress');
  const timerEl = document.getElementById('law-hud-timer');

  if (statusEl) statusEl.textContent = statusText;
  if (progressEl && progressText) progressEl.textContent = progressText;
  if (timerEl) {
    timerEl.textContent = countdownSeconds > 0 ? `Next in: ${countdownSeconds}s` : '';
  }
}

function hideHud() {
  if (hudElement) {
    hudElement.classList.add('law-hidden');
  }
}

function stopAutomation(reason = 'Stopped') {
  shouldStop = true;
  isRunning = false;
  updateHud(reason);
  setTimeout(() => hideHud(), 4000);

  chrome.runtime.sendMessage({
    action: 'UPDATE_RUNTIME_STATE',
    state: { isProcessing: false, currentStatus: reason, lastRunTime: new Date().toISOString() }
  });
}

// ROBUST DOM-INVARIANT CONNECTION CARD FINDER
function getConnectionCards() {
  const cards = [];
  const seenUrls = new Set();

  // Find all "Message" buttons on the page
  const allButtons = Array.from(document.querySelectorAll('button, a.artdeco-button'));
  const messageButtons = allButtons.filter(btn => {
    // Ignore buttons inside top navbar or messaging overlay
    if (btn.closest('header, nav, #global-nav, .global-nav, .msg-overlay-container, #law-floating-hud')) return false;

    const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    return text === 'message' || aria.startsWith('message ') || aria.startsWith('send a message to');
  });

  for (const btn of messageButtons) {
    // Walk up to find row container (li, div.artdeco-list__item, or container)
    let card = btn.closest('li') || btn.closest('.artdeco-list__item') || btn.closest('[data-view-name]');

    if (!card) {
      let curr = btn.parentElement;
      for (let i = 0; i < 5 && curr && curr !== document.body; i++) {
        if (curr.querySelector('a[href*="/in/"]')) {
          card = curr;
          break;
        }
        curr = curr.parentElement;
      }
    }

    if (!card) continue;

    // Find profile link inside this card
    const linkEl = card.querySelector('a[href*="/in/"]');
    if (!linkEl) continue;

    const rawHref = linkEl.getAttribute('href') || linkEl.href;
    const profileUrl = normalizeUrl(rawHref);

    if (!profileUrl || seenUrls.has(profileUrl)) continue;

    // Extract name
    let name = '';
    const nameEl = card.querySelector('.mn-connection-card__name, .artdeco-entity-lockup__title, span[aria-hidden="true"], h3, strong');
    if (nameEl && nameEl.textContent.trim()) {
      name = nameEl.textContent.trim();
    } else {
      name = linkEl.textContent.trim();
    }
    name = name.split('\n')[0].trim();

    seenUrls.add(profileUrl);
    cards.push({
      cardElement: card,
      linkElement: linkEl,
      messageButton: btn,
      name: name || 'LinkedIn Member',
      profileUrl: profileUrl
    });
  }

  return cards;
}

// Conversation Window Helper
async function waitForConversationWindow() {
  for (let i = 0; i < 15; i++) {
    const bubbles = Array.from(document.querySelectorAll(
      '.msg-overlay-conversation-bubble, [data-control-name="overlay.conversation_window"], .msg-convo-wrapper'
    )).filter(el => !el.classList.contains('msg-overlay-conversation-bubble--minimized'));

    if (bubbles.length > 0) {
      return bubbles[bubbles.length - 1]; // most recently opened
    }
    await sleep(300);
  }
  return null;
}

// Close Conversation Window Helper
function closeConversationWindow(convoEl) {
  if (!convoEl) return;
  const closeBtn = convoEl.querySelector(
    'button[data-control-name="overlay.close_conversation_window"], ' +
    'button.msg-overlay-bubble-header__control--close, ' +
    'button[aria-label*="Close conversation"], ' +
    'button[aria-label*="Close your conversation"], ' +
    'button[data-test-msg-overlay-conversation-bubble-close-button]'
  );
  if (closeBtn) {
    closeBtn.click();
  }
}

// Main Automation Sequence
async function runAutoWelcomeSequence() {
  if (isRunning) return;
  isRunning = true;
  shouldStop = false;

  try {
    const { settings, stats, sentHistory } = await getExtensionData();

    if (!settings.enabled) {
      updateHud('Auto-Welcome is currently disabled in settings.');
      setTimeout(hideHud, 3000);
      isRunning = false;
      return;
    }

    if (stats.todayCount >= settings.dailyLimit) {
      updateHud(`Daily limit reached (${stats.todayCount}/${settings.dailyLimit}). Pausing until tomorrow.`);
      setTimeout(hideHud, 5000);
      isRunning = false;
      return;
    }

    // Check URL: must be on connections page
    const currentUrl = window.location.href;
    if (!currentUrl.includes('/mynetwork/invite-connect/connections')) {
      updateHud('Navigating to your Connections page...');
      window.location.href = 'https://www.linkedin.com/mynetwork/invite-connect/connections/';
      isRunning = false;
      return;
    }

    updateHud('Detecting newly added connections...', `Today: ${stats.todayCount}/${settings.dailyLimit}`);
    await sleep(1500);

    // Map existing sent history
    const sentMap = new Set((sentHistory || []).map(h => normalizeUrl(h.profileUrl)));

    // Find cards on screen
    let connections = getConnectionCards();

    if (connections.length === 0) {
      updateHud('Looking for connections... scrolling down slightly');
      window.scrollBy({ top: 350, behavior: 'smooth' });
      await sleep(2000);
      connections = getConnectionCards();
    }

    if (connections.length === 0) {
      updateHud('Could not detect connection cards on this page. Please refresh and try again.');
      setTimeout(hideHud, 5000);
      isRunning = false;
      return;
    }

    const unmessaged = connections.filter(c => !sentMap.has(c.profileUrl));

    if (unmessaged.length === 0) {
      updateHud(`All ${connections.length} visible connections have already received messages! ✅`, `Today: ${stats.todayCount}/${settings.dailyLimit}`);
      await chrome.runtime.sendMessage({
        action: 'UPDATE_RUNTIME_STATE',
        state: { isProcessing: false, currentStatus: 'All visible connections already messaged', lastRunTime: new Date().toISOString() }
      });
      setTimeout(hideHud, 5000);
      isRunning = false;
      return;
    }

    let processedInSession = 0;
    let currentTodayCount = stats.todayCount;

    for (const conn of unmessaged) {
      if (shouldStop) break;

      if (currentTodayCount >= settings.dailyLimit) {
        updateHud(`Daily safety limit reached (${currentTodayCount}/${settings.dailyLimit}). Stopping for today.`);
        break;
      }

      const firstName = extractFirstName(conn.name);
      updateHud(`Opening chat with ${conn.name}...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);

      // Scroll into view
      conn.cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(1000);

      if (shouldStop) break;

      // Click "Message" button
      conn.messageButton.click();

      // Wait for conversation window to pop up
      const activeConvo = await waitForConversationWindow();

      if (!activeConvo) {
        console.warn('Could not locate conversation window for', conn.name);
        continue;
      }

      await sleep(1500);

      // Check if conversation history exists (only check ACTUAL messages, not system banners)
      if (settings.skipExistingChats) {
        const actualMessages = activeConvo.querySelectorAll(
          '.msg-s-event-listitem__body, .msg-s-message-group__item, .msg-s-event-listitem__message-bubble'
        );

        if (actualMessages && actualMessages.length > 0) {
          updateHud(`Skipping ${conn.name} (prior chat history detected)...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
          // Record as skipped
          await chrome.storage.local.get(['sentHistory']).then(async res => {
            const history = res.sentHistory || [];
            const record = {
              id: Date.now().toString(),
              profileUrl: conn.profileUrl,
              name: conn.name,
              firstName: firstName,
              message: '[Skipped - Existing Conversation]',
              sentAt: new Date().toISOString(),
              status: 'skipped'
            };
            await chrome.storage.local.set({ sentHistory: [record, ...history].slice(0, 500) });
          });

          sentMap.add(conn.profileUrl);
          closeConversationWindow(activeConvo);
          await sleep(1500);
          continue;
        }
      }

      // Find text input
      let textBox = null;
      for (let i = 0; i < 10; i++) {
        textBox = activeConvo.querySelector(
          'div.msg-form__contenteditable[contenteditable="true"], div[role="textbox"][contenteditable="true"], div[aria-label*="Write a message"]'
        );
        if (textBox) break;
        await sleep(300);
      }

      if (!textBox) {
        console.warn('Could not find text input for', conn.name);
        closeConversationWindow(activeConvo);
        continue;
      }

      // Prepare personalized message
      const personalizedMessage = (settings.template || '')
        .replace(/\{firstName\}/gi, firstName)
        .replace(/\{fullName\}/gi, conn.name);

      updateHud(`Drafting message to ${firstName}...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);

      // Focus and enter text
      textBox.focus();
      await sleep(400);

      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, personalizedMessage);

      // Fallback
      if (!textBox.textContent || !textBox.textContent.includes(firstName)) {
        textBox.innerHTML = `<p>${personalizedMessage}</p>`;
      }

      textBox.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: personalizedMessage }));
      textBox.dispatchEvent(new Event('input', { bubbles: true }));
      textBox.dispatchEvent(new Event('change', { bubbles: true }));

      await sleep(1500);

      if (shouldStop) {
        closeConversationWindow(activeConvo);
        break;
      }

      // Find send button and wait for it to be enabled
      let sendBtn = null;
      for (let i = 0; i < 10; i++) {
        sendBtn = activeConvo.querySelector('button.msg-form__send-button, button[type="submit"]');
        if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
          break;
        }
        await sleep(300);
      }

      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
        updateHud(`Sending message to ${firstName}...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
        sendBtn.click();
        await sleep(2000);

        // Record success directly
        currentTodayCount++;
        processedInSession++;
        sentMap.add(conn.profileUrl);

        try {
          const localData = await chrome.storage.local.get(['stats', 'sentHistory']);
          const stats = localData.stats || { todayCount: 0, lastResetDate: getTodayString(), totalSent: 0 };
          const history = localData.sentHistory || [];
          const newRecord = {
            id: Date.now().toString(),
            profileUrl: conn.profileUrl,
            name: conn.name,
            firstName: firstName,
            message: personalizedMessage,
            sentAt: new Date().toISOString(),
            status: 'sent'
          };
          const updatedStats = {
            ...stats,
            todayCount: stats.todayCount + 1,
            totalSent: (stats.totalSent || 0) + 1
          };
          await chrome.storage.local.set({
            stats: updatedStats,
            sentHistory: [newRecord, ...history].slice(0, 500)
          });
        } catch (e) {
          console.error('Failed to save record:', e);
        }

        // Close conversation window
        closeConversationWindow(activeConvo);
        await sleep(1500);

        // Human randomized delay before next connection
        const delayMs = getRandomDelay(settings.minDelay, settings.maxDelay);
        const totalDelaySec = Math.round(delayMs / 1000);

        for (let s = totalDelaySec; s > 0; s--) {
          if (shouldStop) break;
          updateHud(`Sent to ${firstName}! Resting naturally...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`, s);
          await sleep(1000);
        }
      } else {
        console.warn('Send button was not active for', conn.name);
        closeConversationWindow(activeConvo);
        await sleep(1500);
      }
    }

    const finishMsg = shouldStop
      ? 'Automation stopped by user.'
      : `Done! Sent ${processedInSession} welcome messages.`;

    updateHud(finishMsg, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
    await chrome.runtime.sendMessage({
      action: 'UPDATE_RUNTIME_STATE',
      state: { isProcessing: false, currentStatus: finishMsg, lastRunTime: new Date().toISOString() }
    });

    setTimeout(hideHud, 6000);

  } catch (err) {
    console.error('Auto Welcome sequence error:', err);
    updateHud(`Error: ${err.message}`);
    setTimeout(hideHud, 5000);
  } finally {
    isRunning = false;
  }
}

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_DOM_SCAN' || message.action === 'TRIGGER_BACKGROUND_CHECK') {
    if (!isRunning) {
      runAutoWelcomeSequence();
      sendResponse({ success: true, started: true });
    } else {
      sendResponse({ success: true, alreadyRunning: true });
    }
    return true;
  }

  if (message.action === 'STOP_DOM_SCAN') {
    stopAutomation('Stopped by user');
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'CHECK_IS_RUNNING') {
    sendResponse({ isRunning });
    return true;
  }
});
