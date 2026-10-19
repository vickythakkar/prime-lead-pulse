/**
 * LinkedIn Auto Welcome & Responder - Content Script
 * Handles DOM inspection, safe interaction, chat thread detection, and message typing.
 */

let isRunning = false;
let shouldStop = false;
let hudElement = null;

// Helpers
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(minSeconds, maxSeconds) {
  const min = Math.max(10, Number(minSeconds) || 25);
  const max = Math.max(min + 2, Number(maxSeconds) || 45);
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
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
  // Strip emojis, suffixes, prefixes, degree abbreviations
  let cleaned = fullName
    .replace(/\b(dr|mr|mrs|ms|prof|ph\.?d|m\.?d|mba|pmp|cpa|ca)\b\.?/gi, '')
    .replace(/\(.*?\)/g, '') // remove (He/Him) etc.
    .replace(/[,|/\\-].*$/, '') // remove trailing titles
    .trim();

  const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 0) return 'there';

  let first = parts[0];
  // Capitalize first letter properly
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// Floating HUD injection and updates
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

// Stop trigger
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

// Fetch all connection cards on page
function getConnectionCards() {
  // Selector targets: LinkedIn connections list items
  const cardSelectors = [
    'li.mn-connection-card',
    'div.mn-connection-card',
    '.scaffold-finite-scroll__content li',
    'ul.reusable-search__entity-result-list > li'
  ];

  let rawCards = [];
  for (const sel of cardSelectors) {
    const found = document.querySelectorAll(sel);
    if (found && found.length > 0) {
      rawCards = Array.from(found);
      break;
    }
  }

  const results = [];

  for (const card of rawCards) {
    // Look for profile link
    const linkEl = card.querySelector('a[href*="/in/"]');
    if (!linkEl) continue;

    const rawHref = linkEl.getAttribute('href') || linkEl.href;
    const profileUrl = normalizeUrl(rawHref);

    // Look for name
    let name = '';
    const nameEl = card.querySelector('.mn-connection-card__name, .artdeco-entity-lockup__title, span[aria-hidden="true"]');
    if (nameEl) {
      name = nameEl.textContent.trim();
    } else {
      name = linkEl.textContent.trim();
    }

    // Look for Message button
    const buttons = Array.from(card.querySelectorAll('button, a'));
    const messageBtn = buttons.find(b => {
      const text = (b.textContent || '').trim().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return text === 'message' || aria.startsWith('message ') || aria.startsWith('send a message to');
    });

    if (linkEl && messageBtn) {
      results.push({
        cardElement: card,
        linkElement: linkEl,
        messageButton: messageBtn,
        name: name || 'LinkedIn Member',
        profileUrl: profileUrl
      });
    }
  }

  return results;
}

// Main Automation Runner
async function runAutoWelcomeSequence() {
  if (isRunning) return;
  isRunning = true;
  shouldStop = false;

  try {
    // 1. Fetch current settings, stats & history
    const response = await chrome.runtime.sendMessage({ action: 'GET_DATA' });
    if (!response || !response.success) {
      throw new Error('Failed to retrieve extension configuration');
    }

    const { settings, stats, sentHistory } = response.data;

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
      updateHud('Please navigate to your Connections page first.');
      window.location.href = 'https://www.linkedin.com/mynetwork/invite-connect/connections/';
      isRunning = false;
      return;
    }

    updateHud('Scanning your connection list...', `Today: ${stats.todayCount}/${settings.dailyLimit}`);
    await sleep(2000);

    // Map existing messaged URLs for fast lookup
    const sentMap = new Set((sentHistory || []).map(h => normalizeUrl(h.profileUrl)));

    // Find cards on screen
    let connections = getConnectionCards();

    if (connections.length === 0) {
      // Try scrolling down slightly to trigger infinite scroll
      window.scrollBy({ top: 400, behavior: 'smooth' });
      await sleep(2500);
      connections = getConnectionCards();
    }

    const unmessaged = connections.filter(c => !sentMap.has(c.profileUrl));

    if (unmessaged.length === 0) {
      updateHud('All visible connections have already received messages! ✅', `Today: ${stats.todayCount}/${settings.dailyLimit}`);
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

      // Smooth scroll to card
      conn.cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(1200);

      if (shouldStop) break;

      // Click "Message" button
      conn.messageButton.click();
      await sleep(2500);

      if (shouldStop) break;

      // Find active message container/window
      const convoWindows = Array.from(document.querySelectorAll(
        '.msg-overlay-conversation-bubble, .msg-convo-wrapper, aside.msg-overlay-container'
      ));

      const activeConvo = convoWindows[convoWindows.length - 1]; // most recently opened

      if (!activeConvo) {
        console.warn('Could not locate conversation window for', conn.name);
        continue;
      }

      // Check if conversation history exists
      if (settings.skipExistingChats) {
        const messageItems = activeConvo.querySelectorAll(
          '.msg-s-message-list-container li, .msg-s-event-listitem, .msg-s-message-list__event'
        );

        if (messageItems && messageItems.length > 0) {
          updateHud(`Skipping ${conn.name} (prior chat history detected)...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
          // Record as skipped
          await chrome.runtime.sendMessage({
            action: 'RECORD_SENT_MESSAGE',
            payload: {
              profileUrl: conn.profileUrl,
              name: conn.name,
              firstName: firstName,
              message: '[Skipped - Existing Conversation]',
              status: 'skipped'
            }
          });
          sentMap.add(conn.profileUrl);

          // Close window
          closeConversationWindow(activeConvo);
          await sleep(1500);
          continue;
        }
      }

      // Find text box
      const textBox = activeConvo.querySelector(
        'div[role="textbox"][contenteditable="true"], .msg-form__contenteditable'
      );

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
      await sleep(500);

      // Clean paste/insert
      document.execCommand('insertText', false, personalizedMessage);
      textBox.dispatchEvent(new Event('input', { bubbles: true }));
      textBox.dispatchEvent(new Event('change', { bubbles: true }));

      await sleep(1500);

      if (shouldStop) {
        closeConversationWindow(activeConvo);
        break;
      }

      // Find send button
      const sendBtn = activeConvo.querySelector(
        'button.msg-form__send-button, button[type="submit"]'
      );

      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
        updateHud(`Sending message to ${firstName}...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
        sendBtn.click();
        await sleep(2000);

        // Record success
        currentTodayCount++;
        processedInSession++;
        sentMap.add(conn.profileUrl);

        await chrome.runtime.sendMessage({
          action: 'RECORD_SENT_MESSAGE',
          payload: {
            profileUrl: conn.profileUrl,
            name: conn.name,
            firstName: firstName,
            message: personalizedMessage,
            status: 'sent'
          }
        });

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
        console.warn('Send button was disabled or not found');
        closeConversationWindow(activeConvo);
        await sleep(1500);
      }
    }

    const finishMsg = shouldStop
      ? 'Automation stopped by user.'
      : `Session completed! Sent ${processedInSession} welcome messages.`;

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

function closeConversationWindow(convoEl) {
  if (!convoEl) return;
  const closeBtn = convoEl.querySelector(
    'button[data-control-name="overlay.close_conversation_window"], button.msg-overlay-bubble-header__control--close, button[aria-label*="Close conversation"], button[aria-label*="Close your conversation"]'
  );
  if (closeBtn) {
    closeBtn.click();
  }
}

// Runtime message listener from popup or service worker
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
