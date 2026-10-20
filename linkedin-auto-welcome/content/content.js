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
  rules: [
    {
      id: "rule_realtors",
      name: "US Realtors & Real Estate",
      keywords: "realtor, real estate, broker, realty, mortgage, agent, appraisal, investment, remax, keller williams, exp",
      template: "Hi {firstName}, thanks for connecting! Always great to connect with fellow real estate professionals. How is the market treating you recently?"
    }
  ],
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
    const rawSettings = local.settings || {};
    const settings = {
      ...DEFAULT_SETTINGS,
      ...rawSettings,
      rules: Array.isArray(rawSettings.rules) ? rawSettings.rules : DEFAULT_SETTINGS.rules
    };
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
    const nameEl = card.querySelector('.mn-connection-card__name, .artdeco-entity-lockup__title span[aria-hidden="true"], h3, strong');
    if (nameEl) {
      name = nameEl.innerText || nameEl.textContent || '';
    } else {
      name = link.innerText || link.textContent || '';
    }

    // Extract occupation / headline
    let headline = '';
    const occEl = card.querySelector(
      '.mn-connection-card__occupation, .artdeco-entity-lockup__subtitle, .artdeco-entity-lockup__caption, .mn-connection-card__details'
    );
    if (occEl) {
      headline = (occEl.innerText || occEl.textContent || '').trim();
    }

    // Clean name: take first line, separate joined lowercase-uppercase words (e.g. MyersRealtor -> Myers Realtor)
    name = name.split('\n')[0].replace(/\s+/g, ' ').trim();
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
    const nameWords = name.split(' ').filter(w => w.length > 0);
    if (nameWords.length > 2) {
      // Keep only first 2 words for the clean name
      name = nameWords.slice(0, 2).join(' ');
    }
    if (!name || name.length < 2) continue;

    seenUrls.add(profileUrl);
    cards.push({
      cardElement: card,
      linkElement: link,
      messageButton: messageBtn,
      name: name,
      headline: headline,
      profileUrl: profileUrl
    });
  }

  // Backup Strategy: Search directly for Message buttons if profile links scan yielded 0
  if (cards.length === 0) {
    const allButtons = Array.from(document.querySelectorAll('button, a.artdeco-button')).filter(b => {
      return !b.closest('header, nav, #global-nav, .global-nav, .msg-overlay-container, #law-floating-hud') && isMessageButton(b);
    });

    for (const btn of allButtons) {
      const card = btn.closest('li') || btn.closest('.artdeco-list__item') || btn.parentElement?.parentElement;
      if (!card) continue;

      const link = card.querySelector('a[href*="/in/"]');
      if (!link) continue;

      const profileUrl = normalizeUrl(link.getAttribute('href') || link.href);
      if (!profileUrl || seenUrls.has(profileUrl)) continue;

      let name = (link.innerText || link.textContent || '').trim().split('\n')[0].replace(/\s+/g, ' ').trim();
      name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
      const parts = name.split(' ').filter(w => w.length > 0);
      if (parts.length > 2) name = parts.slice(0, 2).join(' ');

      let headline = '';
      const occEl = card.querySelector(
        '.mn-connection-card__occupation, .artdeco-entity-lockup__subtitle, .artdeco-entity-lockup__caption, .mn-connection-card__details'
      );
      if (occEl) {
        headline = (occEl.innerText || occEl.textContent || '').trim();
      }

      seenUrls.add(profileUrl);
      cards.push({
        cardElement: card,
        linkElement: link,
        messageButton: btn,
        name: name || 'LinkedIn Member',
        headline: headline,
        profileUrl: profileUrl
      });
    }
  }

  console.log('[LinkedIn Auto Welcome] Detected connection cards:', cards.length, cards.map(c => c.name));
  return cards;
}

// Deep DOM Traversal (pierces open Shadow DOM boundaries)
function querySelectorAllDeep(selector, root = document) {
  let results = [];
  try {
    results = Array.from(root.querySelectorAll(selector));
  } catch (e) {}

  try {
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        results = results.concat(querySelectorAllDeep(selector, el.shadowRoot));
      }
    }
  } catch (e) {}

  return results;
}

function querySelectorDeep(selector, root = document) {
  try {
    const found = root.querySelector(selector);
    if (found) return found;
  } catch (e) {}

  try {
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        const found = querySelectorDeep(selector, el.shadowRoot);
        if (found) return found;
      }
    }
  } catch (e) {}

  return null;
}

// Close all existing open chat / compose windows (deep)
function closeAllOpenChats() {
  const allButtons = querySelectorAllDeep('button');

  for (const b of allButtons) {
    // Never click buttons in top nav or HUD
    if (b.closest && b.closest('header, nav, #global-nav, .global-nav, #law-floating-hud')) continue;

    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    const title = (b.getAttribute('title') || '').toLowerCase();
    const svg = b.querySelector('svg');
    const testIcon = (svg?.getAttribute('data-test-icon') || '').toLowerCase();
    const svgContent = (svg?.innerHTML || '').toLowerCase();

    const isCloseBtn = (
      aria === 'close' ||
      aria.includes('close') ||
      aria.includes('dismiss') ||
      title === 'close' ||
      title.includes('close') ||
      testIcon.includes('close') ||
      svgContent.includes('close') ||
      b.classList.contains('msg-overlay-bubble-header__control--close')
    );

    if (isCloseBtn) {
      try { b.click(); } catch (e) {}
    }
  }

  // Also dismiss any "Discard draft?" prompt if visible
  for (const b of allButtons) {
    const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
    if (txt === 'discard') {
      try { b.click(); } catch (e) {}
    }
  }
}

// Close a specific conversation window
function closeConversationWindow(convoEl) {
  if (convoEl) {
    const buttons = querySelectorAllDeep('button', convoEl);
    for (const b of buttons) {
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const svg = b.querySelector('svg');
      const testIcon = (svg?.getAttribute('data-test-icon') || '').toLowerCase();
      if (aria.includes('close') || aria.includes('dismiss') || testIcon.includes('close')) {
        try { b.click(); } catch (e) {}
        return;
      }
    }
  }
  closeAllOpenChats();
}

// Ultra-Resilient Message Box Finder (Regular DOM + Shadow DOM)
// Strictly targets the message body and prioritizes the target person's window
async function waitForConversationWindow(targetName = '') {
  const targetSelectors = [
    'div.msg-form__contenteditable[contenteditable="true"]',
    '.msg-form__contenteditable',
    '.public-DraftEditor-content[contenteditable="true"]',
    'form.msg-form [contenteditable="true"]',
    '.msg-form [contenteditable="true"]',
    'div[aria-label*="Write a message" i]',
    'div[data-placeholder*="Write a message" i]'
  ];

  const firstName = targetName ? extractFirstName(targetName).toLowerCase() : '';

  for (let i = 0; i < 20; i++) {
    for (const sel of targetSelectors) {
      const found = querySelectorAllDeep(sel).filter(el => {
        // Exclude top navbar search input
        if (el.closest && el.closest('header, nav, #global-nav, .global-nav')) return false;
        // Exclude minimized bubbles
        if (el.closest && el.closest('.msg-overlay-conversation-bubble--minimized')) return false;
        // NEVER match the recipient typeahead / search bar
        if (el.closest && el.closest('.msg-connections-typeahead, .msg-compose-recipients, [data-test-msg-compose-typeahead], .artdeco-pill-input')) return false;
        const ph = (el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').toLowerCase();
        if (ph.includes('type a name') || ph.includes('search')) return false;

        // Verify visible
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
      });

      if (found.length > 0) {
        // If multiple windows exist, pick the one that belongs to targetName!
        let chosen = null;
        if (firstName && found.length > 1) {
          chosen = found.find(el => {
            const container = (el.closest && el.closest(
              '.msg-overlay-conversation-bubble, .msg-overlay-list-bubble, ' +
              '.msg-compose-overlay, .msg-convo-wrapper, .msg-overlay-container, ' +
              '.msg-s-message-list-container, [role="dialog"], .application-outlet'
            )) || el.parentElement?.parentElement?.parentElement;
            const text = (container?.innerText || container?.textContent || '').toLowerCase();
            return text.includes(firstName);
          });
        }

        const textbox = chosen || found[found.length - 1];
        const container = (textbox.closest && textbox.closest(
          '.msg-overlay-conversation-bubble, .msg-overlay-list-bubble, ' +
          '.msg-compose-overlay, .msg-convo-wrapper, .msg-overlay-container, ' +
          '.msg-s-message-list-container, [role="dialog"], .application-outlet'
        )) || textbox.parentElement?.parentElement?.parentElement || document.body;

        console.log('[LAW] Found message box via selector:', sel);
        return { textbox, container };
      }
    }

    // Every second, update HUD with attempt countdown
    if (i % 2 === 0 && targetName) {
      updateHud(`Locating chat with ${targetName} (${Math.round((20 - i) * 0.3)}s)...`);
    }

    await sleep(300);
  }

  console.warn('[LAW] waitForConversationWindow timed out');
  return null;
}



/**
 * Type text into LinkedIn's React / Draft.js message editor.
 */
async function typeIntoReactInput(element, text) {
  if (!element || !text) return false;

  console.log('[LAW] typeIntoReactInput starting with text length:', text.length);

  try {
    // Focus target (either element itself or inner Draft.js editor child)
    const target = (element.querySelector && element.querySelector('.public-DraftEditor-content, p')) || element;
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    target.click();
    target.focus();
    await sleep(200);

    // Draft.js native insertion: select existing content without destroying DOM
    document.execCommand('selectAll', false, null);
    await sleep(100);

    // Method 1: execCommand('insertText') — Draft.js natively intercepts this
    const execSuccess = document.execCommand('insertText', false, text);
    console.log('[LAW] Method 1 (execCommand insertText):', execSuccess);
    await sleep(250);

    // Check if text is present
    if (element.textContent && element.textContent.trim().length > 0) {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[LAW] Method 1 SUCCESS! Text:', element.textContent.trim().substring(0, 40));
      return true;
    }

    // Method 2: Synthetic Clipboard paste event
    console.log('[LAW] Trying Method 2: Synthetic paste');
    target.focus();
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvt = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      target.dispatchEvent(pasteEvt);
      await sleep(250);

      if (element.textContent && element.textContent.trim().length > 0) {
        element.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[LAW] Method 2 (paste) SUCCESS!');
        return true;
      }
    } catch (pasteErr) {
      console.warn('[LAW] Method 2 error:', pasteErr);
    }

    // Method 3: beforeinput InputEvent
    console.log('[LAW] Trying Method 3: beforeinput event');
    target.focus();
    const bi = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text
    });
    target.dispatchEvent(bi);
    await sleep(150);

    // Direct DOM insertion fallback if still empty
    if (!element.textContent || element.textContent.trim().length === 0) {
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
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(250);

    const hasText = element.textContent && element.textContent.trim().length > 0;
    console.log('[LAW] Method 3 result:', hasText, '| text:', element.textContent?.trim()?.substring(0, 40));
    return hasText;

  } catch (err) {
    console.error('[LAW] typeIntoReactInput error:', err);
    return false;
  }
}

// Find Send button by container, attributes, and text (with shadow DOM support)
function findSendButton(container, textBox) {
  const root = container || document;

  // 1. Standard LinkedIn send button selectors
  const selectors = [
    'button.msg-form__send-button',
    'button[data-test-msg-send-btn="true"]',
    'button[type="submit"].msg-form__send-btn',
    'button.msg-form__send-btn',
    'button[type="submit"]'
  ];

  for (const sel of selectors) {
    const btn = querySelectorDeep(sel, root);
    if (btn && (btn.offsetWidth > 0 || btn.offsetHeight > 0)) return btn;
  }

  // 2. Look by visible text "Send"
  const allButtons = querySelectorAllDeep('button', root);
  const textSendBtn = allButtons.find(b => {
    const text = (b.innerText || b.textContent || '').trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    return (text === 'send' || aria === 'send' || aria.includes('send message')) && (b.offsetWidth > 0 || b.offsetHeight > 0);
  });
  if (textSendBtn) return textSendBtn;

  // 3. Fallback: search entire document deep
  if (root !== document) {
    return findSendButton(document, textBox);
  }

  return null;
}

// Test if text contains a specific keyword (supports whole-word and phrase matching)
function matchKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed) return false;

  try {
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp('\\b' + escaped + '\\b', 'i');
    return reg.test(text);
  } catch (e) {
    return text.toLowerCase().includes(trimmed);
  }
}

// Select appropriate template based on keyword rules
function selectTemplate(conn, settings, convoContainer) {
  const rules = Array.isArray(settings.rules) ? settings.rules : [];

  // Gather all available context for this person: card, headline, profile, chat header
  const contextParts = [
    conn.name || '',
    conn.headline || '',
    conn.cardElement ? (conn.cardElement.innerText || conn.cardElement.textContent || '') : '',
    convoContainer ? (convoContainer.innerText || convoContainer.textContent || '') : ''
  ];
  const searchableText = contextParts.join(' ').toLowerCase();

  for (const rule of rules) {
    if (!rule.keywords || !rule.template) continue;
    const keywords = rule.keywords.split(',').map(k => k.trim()).filter(Boolean);
    for (const kw of keywords) {
      if (matchKeyword(searchableText, kw)) {
        console.log(`[LAW] Matched rule "${rule.name}" via keyword "${kw}" for ${conn.name}`);
        return {
          template: rule.template,
          ruleName: rule.name || 'Keyword Rule',
          matchedKeyword: kw
        };
      }
    }
  }

  return {
    template: settings.template || DEFAULT_SETTINGS.template,
    ruleName: 'Default',
    matchedKeyword: null
  };
}

function formatQuota(todayCount, dailyLimit) {
  const isUnlim = !dailyLimit || Number(dailyLimit) <= 0;
  return isUnlim ? `Today: ${todayCount} (Unlimited)` : `Today: ${todayCount}/${dailyLimit}`;
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

    const isUnlimited = !settings.dailyLimit || Number(settings.dailyLimit) <= 0;

    if (!isUnlimited && stats.todayCount >= Number(settings.dailyLimit)) {
      updateHud(`Daily limit reached (${stats.todayCount}/${settings.dailyLimit}). Pausing until tomorrow.`);
      setTimeout(hideHud, 5000);
      isRunning = false;
      return;
    }

    // Check URL: must be on connections page
    const currentUrl = window.location.href;
    if (!currentUrl.includes('/mynetwork/invite-connect/connections')) {
      updateHud('Navigating to your Connections page...');
      sessionStorage.setItem('law_pending_scan', '1');
      window.location.href = 'https://www.linkedin.com/mynetwork/invite-connect/connections/?law_auto=1';
      isRunning = false;
      return;
    }

    // Close any leftover chat windows from previous sessions
    closeAllOpenChats();
    await sleep(600);

    updateHud('Detecting connections on page...', formatQuota(stats.todayCount, settings.dailyLimit));
    await sleep(1000);

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

    updateHud(`Found ${connections.length} connections. Checking history...`, formatQuota(stats.todayCount, settings.dailyLimit));
    await sleep(1000);

    let processedInSession = 0;
    let currentTodayCount = stats.todayCount;
    let consecutiveEmptyScrolls = 0;

    while (!shouldStop) {
      if (!isUnlimited && currentTodayCount >= Number(settings.dailyLimit)) {
        updateHud(`Daily safety limit reached (${currentTodayCount}/${settings.dailyLimit}). Stopping for today.`);
        break;
      }

      // Check current cards in DOM
      const currentConnections = getConnectionCards();
      const unmessaged = currentConnections.filter(c => !sentMap.has(c.profileUrl));

      // If no unmessaged cards visible, scroll down to load more connections from LinkedIn
      if (unmessaged.length === 0) {
        consecutiveEmptyScrolls++;
        if (consecutiveEmptyScrolls >= 3) {
          console.log('[LAW] No more unmessaged connections found after 3 scroll attempts.');
          break;
        }

        updateHud(`Loading more connections from LinkedIn (scrolling down ${consecutiveEmptyScrolls}/3)...`, formatQuota(currentTodayCount, settings.dailyLimit));
        window.scrollBy({ top: 800, behavior: 'smooth' });
        await sleep(1500);
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        await sleep(2500);
        continue;
      }

      // Reset scroll counter when unmessaged cards are available
      consecutiveEmptyScrolls = 0;
      const conn = unmessaged[0];

      // Close any stray open chat before opening next
      closeAllOpenChats();
      await sleep(400);

      const firstName = extractFirstName(conn.name);
      updateHud(`Opening chat with ${conn.name}...`, formatQuota(currentTodayCount, settings.dailyLimit));

      // Scroll card into view
      conn.cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(700);

      if (shouldStop) break;

      // Click "Message" button (single click to prevent opening multiple compose popups)
      conn.messageButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      conn.messageButton.focus();
      conn.messageButton.click();

      // Wait for conversation/compose window to appear (with live progress on HUD)
      const convoResult = await waitForConversationWindow(conn.name);

      if (!convoResult) {
        updateHud(`⚠️ Chat window didn't open for ${conn.name}. Skipping...`, formatQuota(currentTodayCount, settings.dailyLimit));
        console.warn('[LAW] Could not locate conversation window for', conn.name);
        sentMap.add(conn.profileUrl);
        await sleep(1000);
        continue;
      }

      const { textbox: textBox, container: activeConvo } = convoResult;
      await sleep(1000);

      // Check if real conversation history exists (only inside the specific conversation container)
      if (settings.skipExistingChats && activeConvo && activeConvo !== document.body) {
        const actualMessages = activeConvo.querySelectorAll(
          '.msg-s-event-listitem__body, .msg-s-message-group__item, .msg-s-event-listitem__message-bubble'
        );

        if (actualMessages && actualMessages.length > 0) {
          updateHud(`Skipping ${conn.name} (prior chat history detected)...`, formatQuota(currentTodayCount, settings.dailyLimit));
          const local = await chrome.storage.local.get('sentHistory');
          const history = local.sentHistory || [];
          const record = {
            id: Date.now().toString(),
            profileUrl: conn.profileUrl,
            name: conn.name,
            firstName: firstName,
            message: '[Skipped - Existing Conversation]',
            ruleMatched: 'Skipped',
            sentAt: new Date().toISOString(),
            status: 'skipped'
          };
          await chrome.storage.local.set({ sentHistory: [record, ...history].slice(0, 500) });
          sentMap.add(conn.profileUrl);

          closeConversationWindow(activeConvo);
          await sleep(500);
          closeAllOpenChats();
          await sleep(1000);
          continue;
        }
      }

      // Select template (keyword rule matching or default fallback)
      const ruleResult = selectTemplate(conn, settings, activeConvo);
      const personalizedMessage = (ruleResult.template || settings.template || '')
        .replace(/\{firstName\}/gi, firstName)
        .replace(/\{fullName\}/gi, conn.name);

      if (ruleResult.ruleName !== 'Default') {
        updateHud(`🎯 Matched "${ruleResult.ruleName}" (${ruleResult.matchedKeyword})! Typing message to ${firstName}...`, formatQuota(currentTodayCount, settings.dailyLimit));
      } else {
        updateHud(`Found chat! Typing default message to ${firstName}...`, formatQuota(currentTodayCount, settings.dailyLimit));
      }

      // Type the message into the Draft.js editor
      const typed = await typeIntoReactInput(textBox, personalizedMessage);

      if (!typed) {
        updateHud(`⚠️ Could not type for ${firstName}. Skipping...`, formatQuota(currentTodayCount, settings.dailyLimit));
        console.warn('[LAW] Could not type message for', conn.name);
        sentMap.add(conn.profileUrl);
        closeConversationWindow(activeConvo);
        await sleep(500);
        closeAllOpenChats();
        await sleep(1000);
        continue;
      }

      updateHud(`✏️ Message typed for ${firstName}! Locating Send button...`, formatQuota(currentTodayCount, settings.dailyLimit));
      await sleep(1000);

      if (shouldStop) {
        closeConversationWindow(activeConvo);
        closeAllOpenChats();
        break;
      }

      // Find send button and wait for it to become enabled (up to 5 seconds)
      let sendBtn = null;
      for (let i = 0; i < 20; i++) {
        sendBtn = findSendButton(activeConvo, textBox);
        if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
          break;
        }
        sendBtn = null;
        await sleep(250);
      }

      // Force-send fallback: if button exists and text is present in the editor
      if (!sendBtn) {
        const fallbackBtn = findSendButton(activeConvo, textBox);
        const hasText = textBox.textContent && textBox.textContent.trim().length > 0;
        if (fallbackBtn && hasText) {
          console.log('[LAW] Force-enabling send button. Text present:', textBox.textContent.trim().substring(0, 40));
          updateHud(`⚡ Sending message to ${firstName}...`, formatQuota(currentTodayCount, settings.dailyLimit));
          fallbackBtn.removeAttribute('aria-disabled');
          fallbackBtn.disabled = false;
          sendBtn = fallbackBtn;
        }
      }

      if (sendBtn) {
        updateHud(`🚀 Sending message to ${firstName}...`, formatQuota(currentTodayCount, settings.dailyLimit));
        sendBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sendBtn.focus();
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
            ruleMatched: ruleResult.ruleName !== 'Default' ? `${ruleResult.ruleName} [${ruleResult.matchedKeyword}]` : 'Default',
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
          console.error('[LAW] Failed to save record:', e);
        }

        // Close conversation window cleanly
        closeConversationWindow(activeConvo);
        await sleep(800);
        closeAllOpenChats();
        await sleep(1000);

        // Human randomized delay before next connection
        const delayMs = getRandomDelay(settings.minDelay, settings.maxDelay);
        const totalDelaySec = Math.round(delayMs / 1000);

        for (let s = totalDelaySec; s > 0; s--) {
          if (shouldStop) break;
          updateHud(`Sent to ${firstName}! Resting naturally...`, formatQuota(currentTodayCount, settings.dailyLimit), s);
          await sleep(1000);
        }
      } else {
        console.warn('[LAW] Send button was not active for', conn.name);
        sentMap.add(conn.profileUrl);
        closeConversationWindow(activeConvo);
        await sleep(500);
        closeAllOpenChats();
        await sleep(1000);
      }

    }

    const finishMsg = shouldStop
      ? 'Automation stopped by user.'
      : `Done! Sent ${processedInSession} welcome messages.`;

    updateHud(finishMsg, formatQuota(currentTodayCount, settings.dailyLimit));
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

// Automatic scanner trigger on page load when navigating or flagged
function checkAutoStartOnPageLoad() {
  if (window.location.href.includes('/mynetwork/invite-connect/connections')) {
    const urlParams = new URLSearchParams(window.location.search);
    const hasParam = urlParams.get('law_auto') === '1';
    const hasSession = sessionStorage.getItem('law_pending_scan') === '1';

    if (hasParam || hasSession) {
      sessionStorage.removeItem('law_pending_scan');
      try {
        const cleanUrl = window.location.href.replace(/[?&]law_auto=1/, '');
        window.history.replaceState({}, document.title, cleanUrl);
      } catch (e) {}

      console.log('[LAW] Auto-start detected on connections page load. Starting in 3s...');
      setTimeout(() => {
        if (!isRunning) {
          runAutoWelcomeSequence();
        }
      }, 3000);
    }
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAutoStartOnPageLoad);
} else {
  checkAutoStartOnPageLoad();
}
