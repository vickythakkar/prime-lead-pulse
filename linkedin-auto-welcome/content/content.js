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

// In-Page Floating HUD
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

// Helper: check if element is a "Message" button
function isMessageButton(el) {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag !== 'button' && tag !== 'a') return false;

  // Check classes
  if (el.classList.contains('message-anywhere-button')) return true;

  // Check aria-label
  const aria = (el.getAttribute('aria-label') || '').toLowerCase();
  if (aria.includes('message')) return true;

  // Check inner text or span (e.g. .artdeco-button__text)
  const textSpan = el.querySelector('.artdeco-button__text, span');
  if (textSpan && textSpan.textContent.trim().toLowerCase() === 'message') return true;

  // Check raw text content
  const text = (el.innerText || el.textContent || '').trim().toLowerCase();
  if (text.includes('message') && !text.includes('more')) return true;

  return false;
}

// ROBUST DOM-INVARIANT CONNECTION CARD FINDER
function getConnectionCards() {
  const cards = [];
  const seenUrls = new Set();

  // Find all profile links on page (excluding top navbar, ads, and HUD)
  const allProfileLinks = Array.from(document.querySelectorAll('a[href*="/in/"]')).filter(link => {
    return !link.closest('header, nav, #global-nav, .global-nav, aside.scaffold-layout__aside, #law-floating-hud');
  });

  for (const link of allProfileLinks) {
    const rawHref = link.getAttribute('href') || link.href || '';
    const profileUrl = normalizeUrl(rawHref);

    if (!profileUrl || seenUrls.has(profileUrl) || profileUrl.includes('/in/unavailable')) continue;

    // Walk up to find the row container (li, div.artdeco-list__item, or row element)
    let card = link.closest('li') || link.closest('.artdeco-list__item') || link.closest('[data-view-name]');

    if (!card) {
      let curr = link.parentElement;
      for (let i = 0; i < 6 && curr && curr !== document.body; i++) {
        if (curr.querySelector('button, a.artdeco-button')) {
          card = curr;
          break;
        }
        curr = curr.parentElement;
      }
    }

    if (!card) continue;

    // Find the Message button inside this card
    const buttons = Array.from(card.querySelectorAll('button, a'));
    const messageBtn = buttons.find(b => b !== link && !b.contains(link) && isMessageButton(b));

    if (!messageBtn) continue;

    // Extract name
    let name = '';
    const titleEl = card.querySelector('.mn-connection-card__name, .artdeco-entity-lockup__title, span[aria-hidden="true"], h3, strong');
    if (titleEl && titleEl.textContent.trim()) {
      name = titleEl.textContent.trim();
    } else {
      name = link.textContent.trim();
    }

    name = name.split('\n')[0].replace(/\s+/g, ' ').trim();
    if (!name || name.length < 2) continue;

    seenUrls.add(profileUrl);
    cards.push({
      cardElement: card,
      linkElement: link,
      messageButton: messageBtn,
      name: name,
      profileUrl: profileUrl
    });
  }

  // Backup Strategy: Search directly for Message buttons if profile links scan yielded 0
  if (cards.length === 0) {
    const allButtons = Array.from(document.querySelectorAll('button, a.artdeco-button')).filter(b => {
      return !b.closest('header, nav, #global-nav, .global-nav, .msg-overlay-container, #law-floating-hud') && isMessageButton(b);
    });

    for (const btn of allButtons) {
      const card = btn.closest('li') || btn.closest('.artdeco-list__item') || btn.parentElement.parentElement;
      if (!card) continue;

      const link = card.querySelector('a[href*="/in/"]');
      if (!link) continue;

      const profileUrl = normalizeUrl(link.getAttribute('href') || link.href);
      if (!profileUrl || seenUrls.has(profileUrl)) continue;

      let name = link.textContent.trim().split('\n')[0].replace(/\s+/g, ' ').trim();
      seenUrls.add(profileUrl);
      cards.push({
        cardElement: card,
        linkElement: link,
        messageButton: btn,
        name: name || 'LinkedIn Member',
        profileUrl: profileUrl
      });
    }
  }

  console.log('[LinkedIn Auto Welcome] Detected connection cards:', cards.length, cards.map(c => c.name));
  return cards;
}

// Conversation Window Helper
async function waitForConversationWindow() {
  for (let i = 0; i < 20; i++) {
    const bubbles = Array.from(document.querySelectorAll(
      '.msg-overlay-conversation-bubble, [data-control-name="overlay.conversation_window"], .msg-convo-wrapper, aside.msg-overlay-container > div'
    )).filter(el => {
      return el.querySelector('.msg-form__contenteditable, div[role="textbox"], .msg-form') &&
             !el.classList.contains('msg-overlay-conversation-bubble--minimized');
    });

    if (bubbles.length > 0) {
      return bubbles[bubbles.length - 1];
    }
    await sleep(250);
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

/**
 * Type text into a React-controlled contenteditable div.
 *
 * LinkedIn uses React 18 which fully ignores:
 *   - execCommand (deprecated, React bypasses it)
 *   - innerHTML / textContent mutations
 *   - ClipboardEvent with DataTransfer (clipboardData is read-only in real paste handlers)
 *
 * The ONLY reliable method is:
 *   1. `beforeinput` InputEvent with inputType='insertText' — React's actual handler
 *   2. Character-by-character `beforeinput` as the gold-standard fallback
 *   3. React Fiber internal __reactFiber onChange trigger as last resort
 */
async function typeIntoReactInput(element, text) {
  if (!element || !text) return false;

  console.log('[LAW] typeIntoReactInput called, text length:', text.length);

  try {
    // Step 1: Focus the element
    element.focus();
    await sleep(300);

    // Step 2: Select all & delete existing content via keyboard events
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a', code: 'KeyA', ctrlKey: true, metaKey: false }));
    await sleep(50);
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete', code: 'Delete' }));
    element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' }));
    element.textContent = '';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await sleep(200);

    // ── METHOD 1: Single `beforeinput` with full text (fastest) ──────────────
    console.log('[LAW] Trying Method 1: beforeinput insertText (full string)');
    element.focus();
    await sleep(100);

    const beforeInputEvent = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text,
    });
    const notCancelled = element.dispatchEvent(beforeInputEvent);

    if (notCancelled) {
      // React may handle beforeinput but not mutate DOM — also set manually
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
      } else {
        element.textContent = text;
      }
    }

    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    await sleep(400);

    if (element.textContent && element.textContent.trim().length > 0) {
      console.log('[LAW] Method 1 SUCCESS. Text:', element.textContent.trim().substring(0, 40));
      return true;
    }

    // ── METHOD 2: Character-by-character beforeinput (gold standard) ─────────
    console.log('[LAW] Method 1 failed. Trying Method 2: char-by-char beforeinput');
    element.focus();
    await sleep(100);
    // Clear again
    element.textContent = '';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await sleep(100);

    for (const char of text) {
      element.focus();
      const bi = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: char,
      });
      element.dispatchEvent(bi);

      // Manually append the character too (React may not mutate DOM itself)
      element.textContent = (element.textContent || '') + char;

      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: char,
      }));
      await sleep(15);
    }

    await sleep(400);

    if (element.textContent && element.textContent.trim().length > 0) {
      console.log('[LAW] Method 2 SUCCESS. Text:', element.textContent.trim().substring(0, 40));
      return true;
    }

    // ── METHOD 3: React Fiber internal onChange + execCommand ─────────────────
    console.log('[LAW] Method 2 failed. Trying Method 3: React Fiber + execCommand');
    element.focus();
    await sleep(100);

    // Use execCommand (may still work in some Chrome versions for contenteditable)
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
    await sleep(200);

    if (element.textContent && element.textContent.trim().length > 0) {
      console.log('[LAW] Method 3a execCommand SUCCESS');
      return true;
    }

    // React Fiber: walk up to find onChange handler
    element.innerHTML = `<p>${text}</p>`;
    const reactFiberKey = Object.keys(element).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance') || k.startsWith('__reactProps')
    );

    if (reactFiberKey) {
      let fiber = element[reactFiberKey];
      // If it's a props key, just call onChange directly
      if (reactFiberKey.startsWith('__reactProps')) {
        const props = element[reactFiberKey];
        if (props && props.onChange) {
          props.onChange({ target: element, currentTarget: element, nativeEvent: { data: text }, bubbles: true });
          console.log('[LAW] Method 3b reactProps.onChange called');
        }
      } else {
        while (fiber) {
          const onChange = fiber.pendingProps?.onChange || fiber.memoizedProps?.onChange;
          if (onChange) {
            onChange({ target: element, currentTarget: element, nativeEvent: { data: text }, bubbles: true });
            console.log('[LAW] Method 3b React Fiber onChange called');
            break;
          }
          fiber = fiber.return;
        }
      }
    }

    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    await sleep(400);

    const finalCheck = element.textContent && element.textContent.trim().length > 0;
    console.log('[LAW] Method 3 result:', finalCheck, '| content:', element.textContent?.trim()?.substring(0, 40));
    return finalCheck;

  } catch (err) {
    console.error('[LAW] typeIntoReactInput error:', err);
    return false;
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

    updateHud('Detecting connections on page...', `Today: ${stats.todayCount}/${settings.dailyLimit}`);
    await sleep(1200);

    // Map existing sent history
    const sentMap = new Set((sentHistory || []).map(h => normalizeUrl(h.profileUrl)));

    // Find cards on screen
    let connections = getConnectionCards();

    if (connections.length === 0) {
      updateHud('Scanning connections list (scrolling down)...');
      window.scrollBy({ top: 350, behavior: 'smooth' });
      await sleep(1500);
      window.scrollBy({ top: -100, behavior: 'smooth' });
      await sleep(1000);
      connections = getConnectionCards();
    }

    if (connections.length === 0) {
      updateHud('Could not detect connection cards on this page. Please refresh and try again.');
      setTimeout(hideHud, 6000);
      isRunning = false;
      return;
    }

    updateHud(`Found ${connections.length} connections. Checking history...`, `Today: ${stats.todayCount}/${settings.dailyLimit}`);
    await sleep(1200);

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

    updateHud(`Ready to message ${unmessaged.length} newly accepted connection(s)...`, `Today: ${stats.todayCount}/${settings.dailyLimit}`);
    await sleep(1500);

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

      // Scroll card into view
      conn.cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(1000);

      if (shouldStop) break;

      // Click "Message" button
      conn.messageButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      conn.messageButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      conn.messageButton.click();

      // Wait for conversation window to pop up
      const activeConvo = await waitForConversationWindow();

      if (!activeConvo) {
        console.warn('Could not locate conversation window for', conn.name);
        continue;
      }

      await sleep(1500);

      // Check if real conversation history exists (not system connection banner)
      if (settings.skipExistingChats) {
        const actualMessages = activeConvo.querySelectorAll(
          '.msg-s-event-listitem__body, .msg-s-message-group__item, .msg-s-event-listitem__message-bubble'
        );

        if (actualMessages && actualMessages.length > 0) {
          updateHud(`Skipping ${conn.name} (prior chat history detected)...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
          // Record as skipped in storage
          const local = await chrome.storage.local.get('sentHistory');
          const history = local.sentHistory || [];
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
          sentMap.add(conn.profileUrl);

          closeConversationWindow(activeConvo);
          await sleep(1500);
          continue;
        }
      }

      // Find text input
      let textBox = null;
      for (let i = 0; i < 15; i++) {
        textBox = activeConvo.querySelector(
          'div.msg-form__contenteditable[contenteditable="true"], div[role="textbox"][contenteditable="true"], div[aria-label*="Write a message"], div[aria-label*="message"]'
        );
        if (textBox) break;
        await sleep(250);
      }

      if (!textBox) {
        updateHud(`⚠️ Couldn't find text box for ${firstName}. Skipping...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
        console.warn('Could not find text input for', conn.name);
        closeConversationWindow(activeConvo);
        await sleep(1000);
        continue;
      }

      // Prepare personalized message
      const personalizedMessage = (settings.template || '')
        .replace(/\{firstName\}/gi, firstName)
        .replace(/\{fullName\}/gi, conn.name);

      updateHud(`Found text box! Typing message to ${firstName}...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);

      // Focus the textbox
      textBox.focus();
      await sleep(400);

      // --- REACT-COMPATIBLE TEXT INJECTION ---
      const typed = await typeIntoReactInput(textBox, personalizedMessage);

      if (!typed) {
        updateHud(`⚠️ Could not type for ${firstName}. Skipping...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
        console.warn('Could not type message for', conn.name);
        closeConversationWindow(activeConvo);
        await sleep(1000);
        continue;
      }

      updateHud(`✏️ Message typed for ${firstName}! Finding send button...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
      await sleep(1200);

      if (shouldStop) {
        closeConversationWindow(activeConvo);
        break;
      }

      // Find send button and wait for it to become enabled (up to 5 seconds)
      let sendBtn = null;
      for (let i = 0; i < 20; i++) {
        sendBtn = activeConvo.querySelector(
          'button.msg-form__send-button, button[data-test-msg-send-btn="true"], button[type="submit"]'
        );
        if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
          break;
        }
        if (sendBtn && i === 10) {
          console.log('[LAW] Send button still disabled at 2.5s. aria-disabled:', sendBtn.getAttribute('aria-disabled'));
          console.log('[LAW] textBox content:', textBox.textContent?.trim()?.substring(0, 60));
          updateHud(`⏳ Waiting for send button to activate...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
        }
        sendBtn = null;
        await sleep(250);
      }

      // If button is still disabled but text IS present, force-enable and click anyway
      if (!sendBtn) {
        const possibleBtn = activeConvo.querySelector(
          'button.msg-form__send-button, button[data-test-msg-send-btn="true"], button[type="submit"]'
        );
        const hasText = textBox.textContent && textBox.textContent.trim().length > 0;
        if (possibleBtn && hasText) {
          console.log('[LAW] Force-enabling send button. Text present:', textBox.textContent.trim().substring(0, 40));
          updateHud(`⚡ Forcing send for ${firstName}...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
          possibleBtn.removeAttribute('aria-disabled');
          possibleBtn.disabled = false;
          sendBtn = possibleBtn;
        }
      }

      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
        updateHud(`Sending message to ${firstName}...`, `Today: ${currentTodayCount}/${settings.dailyLimit}`);
        sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        sendBtn.click();
        await sleep(2000);

        // Record success
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
