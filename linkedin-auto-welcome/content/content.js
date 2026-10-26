/**
 * LinkedIn Auto Welcome & Responder - Content Script
 * Robust DOM-invariant detection, button-driven discovery, and safe typing simulation.
 */

let isRunning = false;
let shouldStop = false;
let hudElement = null;

const DEFAULT_WELCOME_TEMPLATE = [
  "Hi {firstName}, thanks for connecting! Looking forward to staying in touch and seeing what you're working on. Hope you have a wonderful {dayOfWeek}!",
  "{timeOfDay} {firstName}, glad to link up with you here on LinkedIn! Excited to follow your journey at {company}. Wishing you a productive week ahead.",
  "Hello {firstName}, appreciate the connection! Always looking to expand my network with fellow professionals. Hope business is going great on your end this {dayOfWeek}!",
  "Hey {firstName}, great connecting with you! Looking forward to keeping in touch and following your updates. Have a fantastic rest of your {dayOfWeek}!"
].join("\n\n---OR---\n\n");

const DEFAULT_REALTOR_TEMPLATE = [
  "Hi {firstName}, thanks for connecting! It is always good to connect and know people in the industry.\n\nYou can check about how my company can help you grow on the below link:\nhttps://www.linkedin.com/company/prime-real-ops/",
  "{timeOfDay} {firstName}, glad to link up! Always great to connect and expand my network with fellow professionals in the industry.\n\nFeel free to see how our team helps businesses scale and grow right here:\nhttps://www.linkedin.com/company/prime-real-ops/",
  "Hello {firstName}, appreciate the connection! Always valuable to meet and stay in touch with active people in this space.\n\nHere is a quick look at how my company can support your growth:\nhttps://www.linkedin.com/company/prime-real-ops/",
  "Hey {firstName}, great connecting with you! It's always a pleasure knowing fellow leaders across the industry.\n\nCheck out how we can help you grow your business at the link below:\nhttps://www.linkedin.com/company/prime-real-ops/"
].join("\n\n---OR---\n\n");

const DEFAULT_SETTINGS = {
  enabled: true,
  template: DEFAULT_WELCOME_TEMPLATE,
  rules: [
    {
      id: "rule_realtors",
      name: "US Realtors & Real Estate",
      keywords: "realtor, real estate, broker, realty, mortgage, agent, appraisal, investment, remax, keller williams, exp",
      template: DEFAULT_REALTOR_TEMPLATE
    }
  ],
  dailyLimit: 15,
  minDelay: 25,
  maxDelay: 45,
  skipExistingChats: true,
  autoScanInterval: 60,
  withdrawAgeDays: 30
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Universal DOM click simulation triggering pointer, mouse, and click event chains
function simulateClick(el) {
  if (!el) return;
  try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (e) {}
  try { el.focus(); } catch (e) {}
  try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window })); } catch (e) {}
  try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1 })); } catch (e) {}
  try { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window })); } catch (e) {}
  try { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })); } catch (e) {}
  try { el.click(); } catch (e) {}
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
    const rawRules = Array.isArray(rawSettings.rules) ? rawSettings.rules : DEFAULT_SETTINGS.rules;
    const migratedRules = rawRules.map(r => {
      if (r.id === 'rule_realtors' && (!r.template || r.template.includes('How is the market treating you recently'))) {
        return { ...r, template: DEFAULT_REALTOR_TEMPLATE };
      }
      return r;
    });
    const settings = {
      ...DEFAULT_SETTINGS,
      ...rawSettings,
      rules: migratedRules
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

  // Real-time synchronization to storage for popup and dashboard
  try {
    chrome.storage.local.set({
      runtimeState: {
        isProcessing: isRunning,
        currentStatus: statusText,
        progressText: progressText || '',
        countdown: countdownSeconds || 0,
        lastRunTime: new Date().toISOString()
      }
    });
  } catch (e) {}
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

  try {
    chrome.storage.local.set({
      runtimeState: {
        isProcessing: false,
        currentStatus: reason,
        progressText: '',
        countdown: 0,
        lastRunTime: new Date().toISOString()
      }
    });
  } catch (e) {}
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

  // Find all Message buttons on page (each connection card has exactly one Message button)
  const allMessageButtons = Array.from(document.querySelectorAll('button, a.artdeco-button')).filter(b => {
    return !b.closest('header, nav, #global-nav, .global-nav, .msg-overlay-container, #law-floating-hud') && isMessageButton(b);
  });

  for (const btn of allMessageButtons) {
    // 1. Identify row / card container
    const card = btn.closest('li') || btn.closest('.artdeco-list__item') || btn.closest('[data-view-name]') || btn.parentElement?.parentElement;
    if (!card) continue;

    // 2. CRITICAL: Find the person's profile link while STRICTLY IGNORING any mutual connection links
    // Mutual connection links are inside .member-insights, [class*="mutual"], [class*="insight"], .mn-connection-card__details, dl
    const candidateLinks = Array.from(card.querySelectorAll('a[href*="/in/"]')).filter(link => {
      return !link.closest('.member-insights, [class*="mutual"], [class*="insight"], .mn-connection-card__details, dl');
    });

    if (candidateLinks.length === 0) continue;

    // The primary profile link is candidateLinks[0] (or one with an image or title)
    const primaryLink = candidateLinks.find(l => l.querySelector('img') || l.querySelector('.mn-connection-card__name, span')) || candidateLinks[0];
    const rawHref = primaryLink.getAttribute('href') || primaryLink.href || '';
    const profileUrl = normalizeUrl(rawHref);

    if (!profileUrl || seenUrls.has(profileUrl) || profileUrl.includes('/in/unavailable')) continue;

    // 3. Extract Name:
    // A) First priority: LinkedIn's official button aria-label (e.g. "Message Tyler Smith" or "Send message to Tyler Smith")
    let name = '';
    const aria = btn.getAttribute('aria-label') || '';
    const ariaMatch = aria.match(/(?:send\s+(?:a\s+)?message\s+to|message\s+to|message)\s+([^.,\n\r]+)/i);
    if (ariaMatch && ariaMatch[1].trim().length > 1) {
      name = ariaMatch[1].trim();
    }

    // B) Second priority: Card's primary name element (strictly excluding mutual connection text)
    if (!name) {
      const nameEl = card.querySelector('.mn-connection-card__name, .artdeco-entity-lockup__title span[aria-hidden="true"], h3');
      if (nameEl && !nameEl.closest('.member-insights, [class*="mutual"], [class*="insight"], .mn-connection-card__details')) {
        name = nameEl.innerText || nameEl.textContent || '';
      }
    }

    // C) Fallback: text of the primary non-mutual link
    if (!name) {
      name = primaryLink.innerText || primaryLink.textContent || '';
    }

    // Clean name: take first line, separate joined lowercase-uppercase words (e.g. MyersRealtor -> Myers Realtor)
    name = name.split('\n')[0].replace(/\s+/g, ' ').trim();
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
    const nameWords = name.split(' ').filter(w => w.length > 0);
    if (nameWords.length > 2) {
      name = nameWords.slice(0, 2).join(' ');
    }
    if (!name || name.length < 2) continue;

    // 4. Extract occupation / headline
    let headline = '';
    const occEl = card.querySelector(
      '.mn-connection-card__occupation, .artdeco-entity-lockup__subtitle'
    );
    if (occEl && !occEl.closest('.member-insights, [class*="mutual"], [class*="insight"]')) {
      headline = (occEl.innerText || occEl.textContent || '').trim();
    }

    // 5. Extract location directly from card if present
    let location = '';
    const locEl = card.querySelector(
      '.mn-connection-card__location, [data-anonymize="location"], .artdeco-entity-lockup__caption'
    );
    if (locEl && !locEl.closest('.member-insights, [class*="mutual"], [class*="insight"]')) {
      const locText = (locEl.innerText || locEl.textContent || '').trim();
      if (!locText.match(/connected|ago|mutual|shared/i)) {
        location = locText;
      }
    }

    seenUrls.add(profileUrl);
    cards.push({
      cardElement: card,
      linkElement: primaryLink,
      messageButton: btn,
      name: name,
      headline: headline,
      location: location,
      profileUrl: profileUrl
    });
  }

  // Backup Strategy if no message buttons matched (e.g. non-standard DOM)
  if (cards.length === 0) {
    const allProfileLinks = Array.from(document.querySelectorAll('a[href*="/in/"]')).filter(link => {
      return !link.closest('header, nav, #global-nav, .global-nav, aside.scaffold-layout__aside, #law-floating-hud, .member-insights, [class*="mutual"], [class*="insight"], .mn-connection-card__details, dl');
    });

    for (const link of allProfileLinks) {
      const rawHref = link.getAttribute('href') || link.href || '';
      const profileUrl = normalizeUrl(rawHref);
      if (!profileUrl || seenUrls.has(profileUrl) || profileUrl.includes('/in/unavailable')) continue;

      const card = link.closest('li') || link.closest('.artdeco-list__item') || link.closest('[data-view-name]');
      if (!card) continue;

      const buttons = Array.from(card.querySelectorAll('button, a'));
      const messageBtn = buttons.find(b => b !== link && !b.contains(link) && isMessageButton(b));
      if (!messageBtn) continue;

      let name = '';
      const aria = messageBtn.getAttribute('aria-label') || '';
      const ariaMatch = aria.match(/(?:send\s+(?:a\s+)?message\s+to|message\s+to|message)\s+([^.,\n\r]+)/i);
      if (ariaMatch && ariaMatch[1].trim().length > 1) {
        name = ariaMatch[1].trim();
      } else {
        const nameEl = card.querySelector('.mn-connection-card__name, .artdeco-entity-lockup__title span[aria-hidden="true"], h3');
        name = nameEl ? (nameEl.innerText || nameEl.textContent || '') : (link.innerText || link.textContent || '');
      }

      name = name.split('\n')[0].replace(/\s+/g, ' ').trim().replace(/([a-z])([A-Z])/g, '$1 $2');
      const parts = name.split(' ').filter(w => w.length > 0);
      if (parts.length > 2) name = parts.slice(0, 2).join(' ');
      if (!name || name.length < 2) continue;

      let headline = '';
      const occEl = card.querySelector('.mn-connection-card__occupation, .artdeco-entity-lockup__subtitle');
      if (occEl && !occEl.closest('.member-insights, [class*="mutual"], [class*="insight"]')) {
        headline = (occEl.innerText || occEl.textContent || '').trim();
      }

      let location = '';
      const locEl = card.querySelector('.mn-connection-card__location, [data-anonymize="location"], .artdeco-entity-lockup__caption');
      if (locEl && !locEl.closest('.member-insights, [class*="mutual"], [class*="insight"]')) {
        const locText = (locEl.innerText || locEl.textContent || '').trim();
        if (!locText.match(/connected|ago|mutual|shared/i)) location = locText;
      }

      seenUrls.add(profileUrl);
      cards.push({
        cardElement: card,
        linkElement: link,
        messageButton: messageBtn,
        name: name,
        headline: headline,
        location: location,
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

// UNIVERSAL CHAT & COMPOSE BUBBLE LOCATOR
// Accurately finds both existing conversation bubbles AND "New message" compose bubbles
function getAllOpenBubbles() {
  const bubbles = new Set();

  // 1. Direct overlay bubble selectors (covers both conversation threads AND compose bubbles)
  const directSelectors = [
    '.msg-overlay-conversation-bubble',
    '.msg-overlay-compose-bubble',
    '[class*="msg-overlay-"][class*="-bubble"]',
    '[data-view-name*="msg-overlay"]',
    '.msg-convo-wrapper'
  ];
  for (const sel of directSelectors) {
    try {
      document.querySelectorAll(sel).forEach(el => bubbles.add(el));
    } catch (e) {}
  }

  // 2. Discover bubbles via their header elements
  try {
    const headers = document.querySelectorAll(
      '.msg-overlay-bubble-header, header[class*="msg-overlay"], [class*="msg-overlay-bubble-header"], header'
    );
    for (const h of headers) {
      const bubble = h.closest(
        '.msg-overlay-conversation-bubble, ' +
        '.msg-overlay-compose-bubble, ' +
        '[class*="msg-overlay-"][class*="-bubble"], ' +
        '[data-view-name*="msg-overlay"], ' +
        '.msg-convo-wrapper'
      ) || h.parentElement;
      if (bubble && bubble !== document.body && bubble !== document.documentElement) {
        bubbles.add(bubble);
      }
    }
  } catch (e) {}

  // 3. Children of any msg-overlay-container
  try {
    const containers = document.querySelectorAll(
      '.msg-overlay-container, aside[class*="msg-overlay"], div[class*="msg-overlay-container"]'
    );
    for (const c of containers) {
      for (const child of c.children) {
        if (child.querySelector('header, .msg-overlay-bubble-header, form.msg-form, textarea, [contenteditable="true"]')) {
          bubbles.add(child);
        }
      }
    }
  } catch (e) {}

  // Filter for visible, active, expanded chat/compose overlays
  return Array.from(bubbles).filter(b => {
    if (!b || b === document.body || b === document.documentElement) return false;
    if (b.closest && b.closest('#law-floating-hud, #global-nav, .global-nav, nav')) return false;
    if (b.id === 'law-floating-hud') return false;

    // Filter out minimized inbox tray (e.g. bottom-right "Messaging" bar) unless it has an active editor
    if (b.classList.contains('msg-overlay-list-bubble') &&
        !b.classList.contains('msg-overlay-conversation-bubble') &&
        !b.classList.contains('msg-overlay-compose-bubble')) {
      if (!b.querySelector('form.msg-form, textarea, [contenteditable="true"], div[role="textbox"]')) {
        return false;
      }
    }

    // Must be expanded
    const rect = b.getBoundingClientRect();
    const w = rect.width || b.offsetWidth || 0;
    const h = rect.height || b.offsetHeight || 0;
    return w > 120 && h > 120;
  });
}

// Find any text input / message editor inside a conversation or compose bubble
function findTextBoxInBubble(bubble) {
  if (!bubble) return null;
  const selectors = [
    'div.msg-form__contenteditable[contenteditable="true"]',
    '.msg-form__contenteditable',
    '.public-DraftEditor-content[contenteditable="true"]',
    'form.msg-form [contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'div[role="textbox"]',
    'textarea[name="message"]',
    'textarea.msg-form__textarea',
    'textarea',
    'div[aria-label*="Write a message" i]',
    'div[data-placeholder*="Write a message" i]',
    '[contenteditable="true"]'
  ];
  for (const sel of selectors) {
    try {
      const el = bubble.querySelector(sel);
      if (el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)) {
        return el;
      }
    } catch (e) {}
  }
  return null;
}

// Close all existing open chat / compose windows cleanly
async function closeAllOpenChats() {
  for (let pass = 0; pass < 3; pass++) {
    const bubbles = getAllOpenBubbles();

    // 1. Close each open bubble found
    for (const bubble of bubbles) {
      let closeBtn = null;

      // Check specific close button attributes
      try {
        closeBtn = bubble.querySelector(
          'button[data-control-name*="close"], ' +
          'button[data-control-name*="dismiss"], ' +
          'button[aria-label*="Close" i], ' +
          'button[aria-label*="Dismiss" i]'
        );
      } catch (e) {}

      // Header controls: the top-right "X" button is always the last button in the header
      if (!closeBtn) {
        try {
          const headerBtns = Array.from(bubble.querySelectorAll(
            '.msg-overlay-bubble-header button, header button'
          ));
          if (headerBtns.length > 0) {
            closeBtn = headerBtns[headerBtns.length - 1];
          }
        } catch (e) {}
      }

      // Check for button with close/cancel SVG icon
      if (!closeBtn) {
        try {
          const svg = bubble.querySelector(
            'svg[data-test-icon*="close"], svg[data-test-icon*="cancel"], li-icon[type*="cancel"]'
          );
          if (svg) closeBtn = svg.closest('button');
        } catch (e) {}
      }

      if (closeBtn) {
        simulateClick(closeBtn);
      }
    }

    // 2. Also close any global close buttons across overlay containers
    try {
      const overlayCloseBtns = Array.from(document.querySelectorAll(
        '.msg-overlay-container button[aria-label*="Close" i], ' +
        '.msg-overlay-bubble-header button[aria-label*="Close" i], ' +
        'button[data-control-name="overlay.close_conversation_window"], ' +
        'button[data-control-name*="close_conversation"]'
      )).filter(b => !b.closest('#law-floating-hud, #global-nav, .global-nav, nav'));

      for (const btn of overlayCloseBtns) {
        simulateClick(btn);
      }
    } catch (e) {}

    // 3. Confirm any "Discard draft?" modal prompts
    await sleep(200);
    try {
      const discardBtns = Array.from(document.querySelectorAll('button, .artdeco-modal button')).filter(b => {
        if (b.closest('#law-floating-hud, #global-nav, .global-nav, nav')) return false;
        const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
        return txt === 'discard' || txt === 'discard draft';
      });
      for (const b of discardBtns) {
        simulateClick(b);
      }
    } catch (e) {}

    await sleep(250);

    // If no expanded bubbles remain, all clear!
    if (getAllOpenBubbles().length === 0) break;
  }
}

// Close a specific conversation window
async function closeConversationWindow(convoEl) {
  if (convoEl) {
    let closeBtn = null;
    try {
      closeBtn = convoEl.querySelector(
        'button[data-control-name*="close"], ' +
        'button[data-control-name*="dismiss"], ' +
        'button[aria-label*="Close" i], ' +
        'button[aria-label*="Dismiss" i]'
      );
    } catch (e) {}

    if (!closeBtn) {
      try {
        const headerBtns = Array.from(convoEl.querySelectorAll(
          '.msg-overlay-bubble-header button, header button'
        ));
        if (headerBtns.length > 0) {
          closeBtn = headerBtns[headerBtns.length - 1];
        }
      } catch (e) {}
    }

    if (closeBtn) {
      simulateClick(closeBtn);
    }

    await sleep(200);
    try {
      const discard = Array.from(document.querySelectorAll('button, .artdeco-modal button')).find(b => {
        if (b.closest('#law-floating-hud, #global-nav, .global-nav, nav')) return false;
        const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
        return txt === 'discard' || txt === 'discard draft';
      });
      if (discard) simulateClick(discard);
    } catch (e) {}
  }

  await closeAllOpenChats();
}

// Strict Recipient Verifier across both "New message" compose windows and regular chat bubbles
function verifyConversationRecipient(activeConvo, targetName) {
  if (!activeConvo || !targetName) return { match: true, recipient: '' };
  const targetFirst = extractFirstName(targetName).toLowerCase();
  const targetFull = targetName.trim().toLowerCase();

  // 1. Check pills (in "New message" compose windows, e.g. "Saeed Ahmad X")
  const pills = Array.from(activeConvo.querySelectorAll(
    '.artdeco-pill, [data-test-pill-text], .artdeco-pill__text, .msg-connections-typeahead__recipients, .msg-connections-typeahead, [class*="pill"]'
  ));
  for (const pill of pills) {
    const text = (pill.innerText || pill.textContent || '').toLowerCase();
    if (text.includes(targetFirst) || (targetFull && text.includes(targetFull))) {
      return { match: true, recipient: text.trim(), source: 'pill' };
    }
  }

  // 2. Check recipient lockup card (below typeahead, e.g. "Saeed Ahmad · 1st")
  const lockups = Array.from(activeConvo.querySelectorAll(
    '.msg-entity-lockup__entity-title, .artdeco-entity-lockup__title, .msg-thread__link-to-profile, .msg-entity-lockup, a[href*="/in/"]'
  ));
  for (const el of lockups) {
    const text = (el.innerText || el.textContent || '').toLowerCase();
    if (text.includes(targetFirst) || (targetFull && text.includes(targetFull))) {
      return { match: true, recipient: text.trim(), source: 'lockup' };
    }
  }

  // 3. Check header title (in existing conversation threads)
  const header = activeConvo.querySelector('.msg-overlay-bubble-header, header');
  if (header) {
    const headerText = (header.innerText || header.textContent || '').toLowerCase();
    if (headerText.includes(targetFirst) || (targetFull && headerText.includes(targetFull))) {
      return { match: true, recipient: headerText.trim(), source: 'header' };
    }
    // If header says "New message", check if the body of this bubble contains the target
    if (headerText.includes('new message') || headerText.includes('compose')) {
      const bubbleText = (activeConvo.innerText || activeConvo.textContent || '').toLowerCase();
      if (bubbleText.includes(targetFirst) || (targetFull && bubbleText.includes(targetFull))) {
        return { match: true, recipient: 'New message recipient', source: 'compose-body' };
      }
    }
  }

  // 4. Fallback check: Entire bubble container
  const bubbleText = (activeConvo.innerText || activeConvo.textContent || '').toLowerCase();
  if (bubbleText.includes(targetFirst)) {
    return { match: true, recipient: targetFirst, source: 'bubble' };
  }

  return { match: false, recipient: '' };
}

// Ultra-Resilient Message Box Finder strictly isolated to target recipient
async function waitForConversationWindow(targetName = '') {
  const targetFirst = targetName ? extractFirstName(targetName).toLowerCase() : '';
  const targetFull = (targetName || '').trim().toLowerCase();

  for (let i = 0; i < 30; i++) {
    // 1. Find all active expanded bubbles on the page
    const bubbles = getAllOpenBubbles();

    // 2. Locate the bubble that matches targetName
    let matchedBubble = null;
    if (bubbles.length > 0) {
      // Priority 2a: Explicit match on recipient
      for (const bubble of bubbles) {
        const check = verifyConversationRecipient(bubble, targetName);
        if (check.match) {
          matchedBubble = bubble;
          break;
        }
      }

      // Priority 2b: If only 1 bubble is open and we just clicked Message on targetName
      if (!matchedBubble && bubbles.length === 1) {
        const b = bubbles[0];
        // After 4 iterations (~1.2s), if compose window editor is ready and matches
        if (i >= 4) {
          const tb = findTextBoxInBubble(b);
          if (tb) {
            matchedBubble = b;
          }
        }
      }
    }

    if (matchedBubble) {
      // Find the textbox strictly INSIDE this matched bubble
      const textbox = findTextBoxInBubble(matchedBubble);
      if (textbox) {
        // CLEANUP: If any OTHER bubbles are open that aren't the matched one, close them now
        for (const other of bubbles) {
          if (other !== matchedBubble) {
            try {
              const closeBtn = other.querySelector(
                'button[aria-label*="Close" i], button[data-control-name*="close"], .msg-overlay-bubble-header button:last-child'
              );
              if (closeBtn) simulateClick(closeBtn);
            } catch (e) {}
          }
        }

        console.log(`[LAW] Successfully locked conversation window for ${targetName}`);
        return { textbox, container: matchedBubble };
      }
    }

    if (i % 2 === 0 && targetName) {
      updateHud(`Opening chat with ${targetName} (${Math.round((30 - i) * 0.3)}s)...`);
    }

    await sleep(300);
  }

  console.warn(`[LAW] Could not reliably locate conversation window for ${targetName}`);
  return null;
}

/**
 * Type text into LinkedIn's React / Draft.js message editor or textarea.
 */
async function typeIntoReactInput(element, text) {
  if (!element || !text) return false;

  console.log('[LAW] typeIntoReactInput starting with text length:', text.length);

  try {
    // Handle native TEXTAREA or INPUT
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      try { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      element.focus();
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

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

// Find Send button strictly within the active conversation bubble / form
function findSendButton(container, textBox) {
  // Priority 1: Check the form element enclosing the textbox
  const form = textBox ? (textBox.closest('form, .msg-form') || textBox.parentElement?.parentElement) : null;
  if (form) {
    const formSendBtn = form.querySelector(
      'button[type="submit"], ' +
      'button.msg-form__send-button, ' +
      'button.msg-form__send-btn, ' +
      'button[data-test-msg-send-btn="true"], ' +
      'button[data-control-name="send"]'
    );
    if (formSendBtn && (formSendBtn.offsetWidth > 0 || formSendBtn.offsetHeight > 0)) {
      return formSendBtn;
    }

    // Look for button with text "Send" within the form
    const formBtns = Array.from(form.querySelectorAll('button'));
    const formTextBtn = formBtns.find(b => {
      const text = (b.innerText || b.textContent || '').trim().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return (text === 'send' || aria === 'send' || aria.includes('send message')) && (b.offsetWidth > 0 || b.offsetHeight > 0);
    });
    if (formTextBtn) return formTextBtn;
  }

  // Priority 2: Check inside the container bubble
  const root = container || form;
  if (root) {
    const selectors = [
      'button.msg-form__send-button',
      'button[data-test-msg-send-btn="true"]',
      'button[type="submit"].msg-form__send-btn',
      'button.msg-form__send-btn',
      'button[type="submit"], ' +
      'button[data-control-name="send"]'
    ];

    for (const sel of selectors) {
      const btn = root.querySelector(sel);
      if (btn && (btn.offsetWidth > 0 || btn.offsetHeight > 0)) return btn;
    }

    const allButtons = Array.from(root.querySelectorAll('button'));
    const textSendBtn = allButtons.find(b => {
      const text = (b.innerText || b.textContent || '').trim().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return (text === 'send' || aria === 'send' || aria.includes('send message')) && (b.offsetWidth > 0 || b.offsetHeight > 0);
    });
    if (textSendBtn) return textSendBtn;
  }

  // NEVER search outside the container to avoid clicking Send on someone else's chat!
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

// Smart Company Extractor from LinkedIn Headline
function extractCompany(headline) {
  if (!headline) return '';
  // Check for common patterns: " at Company", " @ Company", " with Company"
  const atMatch = headline.match(/(?:at|@|with)\s+([A-Za-z0-9&.,'’\s\-]+?)(?=[|•—,]|$)/i);
  if (atMatch && atMatch[1].trim().length > 1) {
    return atMatch[1].trim();
  }
  // Check comma separation e.g. "Realtor-Associate, Vylla Home"
  const commaParts = headline.split(',').map(p => p.trim());
  if (commaParts.length > 1 && commaParts[1].length > 2 && commaParts[1].length < 40 && !commaParts[1].toLowerCase().includes('helping')) {
    return commaParts[1];
  }
  // Check pipe or bullet separation
  const parts = headline.split(/[|•—]/).map(p => p.trim());
  if (parts.length > 1) {
    for (let i = parts.length - 1; i >= 1; i--) {
      if (parts[i].length > 2 && parts[i].length < 40 && !parts[i].toLowerCase().includes('helping') && !parts[i].toLowerCase().includes('buyer')) {
        return parts[i];
      }
    }
  }
  return '';
}

// Profile location cache to avoid redundant network lookups
const profileLocationCache = new Map();

// Parse geographic location from LinkedIn Profile HTML (Schema.org, Ember SSR, or DOM)
function parseLocationFromProfileHtml(html) {
  if (!html) return '';

  // 1. Schema.org JSON-LD (most reliable & clean across LinkedIn updates)
  try {
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const person = data['@type'] === 'Person'
          ? data
          : (Array.isArray(data['@graph']) ? data['@graph'].find(x => x && x['@type'] === 'Person') : null);
        if (person && person.address) {
          const parts = [
            person.address.addressLocality,
            person.address.addressRegion,
            person.address.addressCountry
          ].filter(Boolean);
          if (parts.length > 0) return parts.join(', ');
        }
      } catch (e) {}
    }
  } catch (e) {}

  // 2. Embedded Ember SSR JSON code blocks
  try {
    const locMatch = html.match(/"defaultLocalizedName"\s*:\s*"([^"]+)"/i) 
                  || html.match(/"locationName"\s*:\s*"([^"]+)"/i)
                  || html.match(/"formattedLocation"\s*:\s*"([^"]+)"/i);
    if (locMatch && locMatch[1]) {
      return locMatch[1].trim();
    }
  } catch (e) {}

  // 3. Fallback regex on HTML elements
  try {
    const spanMatch = html.match(/(?:class=["'][^"']*(?:text-body-small|t-black--light)[^"']*["'][^>]*>\s*)([A-Za-z0-9\s,.-]+(?:Emirates|Dubai|USA|Area|City|Kingdom|States|Canada|Australia|UK|County|Region|District)[A-Za-z0-9\s,.-]*)(?:\s*<\/span>)/i);
    if (spanMatch && spanMatch[1]) {
      return spanMatch[1].trim();
    }
  } catch (e) {}

  return '';
}

// Fetch and cache location from LinkedIn profile page
async function getOrFetchLocation(conn) {
  if (conn.location && conn.location.length > 1) {
    return conn.location;
  }
  if (!conn.profileUrl) return '';

  if (profileLocationCache.has(conn.profileUrl)) {
    const cached = profileLocationCache.get(conn.profileUrl);
    if (cached) conn.location = cached;
    return cached;
  }

  try {
    const res = await fetch(conn.profileUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      }
    });

    if (res.ok) {
      const html = await res.text();
      const loc = parseLocationFromProfileHtml(html);
      if (loc) {
        console.log(`[LAW] Detected profile location for ${conn.name}: "${loc}"`);
        profileLocationCache.set(conn.profileUrl, loc);
        conn.location = loc;
        return loc;
      }
    }
  } catch (err) {
    console.warn('[LAW] Could not fetch profile location for', conn.name, err);
  }

  profileLocationCache.set(conn.profileUrl, '');
  return '';
}

// Multi-Variant & Spintax Message Resolver
function resolveMessageTemplate(rawTemplate, conn) {
  if (!rawTemplate) return '';

  // 1. Full Message Variations (split by ---OR--- or ===VARIANT=== or \n---\n)
  const variants = rawTemplate
    .split(/(?:\r?\n\s*---OR---\s*\r?\n|\r?\n\s*===VARIANT===\s*\r?\n|\r?\n\s*---\s*\r?\n)/i)
    .map(v => v.trim())
    .filter(v => v.length > 0);

  // Randomly pick one full message variant
  let selected = variants.length > 1
    ? variants[Math.floor(Math.random() * variants.length)]
    : (variants[0] || rawTemplate);

  const variantIndex = variants.indexOf(selected);
  if (variants.length > 1) {
    console.log(`[LAW] Selected full message variant #${variantIndex + 1} of ${variants.length} for ${conn.name}`);
  }

  // 2. Resolve Spintax: {option 1|option 2|option 3}
  let spintaxRegex = /\{([^{}]+?\|[^{}]+?)\}/g;
  let safetyLimit = 10;
  while (spintaxRegex.test(selected) && safetyLimit-- > 0) {
    selected = selected.replace(spintaxRegex, (match, choices) => {
      const options = choices.split('|');
      return options[Math.floor(Math.random() * options.length)].trim();
    });
  }

  // 3. Dynamic Tag Interpolation
  const firstName = extractFirstName(conn.name);
  const fullName = conn.name || '';
  const headline = conn.headline || '';
  const company = extractCompany(headline);
  const location = conn.location || '';

  // Time of Day
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Day of Week
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[new Date().getDay()];

  let personalized = selected
    .replace(/\{firstName\}/gi, firstName)
    .replace(/\{fullName\}/gi, fullName)
    .replace(/\{headline\}/gi, headline)
    .replace(/\{company\}/gi, company || 'your firm')
    .replace(/\{location\}/gi, location || 'your area')
    .replace(/\{timeOfDay\}/gi, timeOfDay)
    .replace(/\{dayOfWeek\}/gi, dayOfWeek);

  return personalized.trim();
}

// Robust Infinite Scroller for LinkedIn Lists
async function triggerLinkedInInfiniteScroll() {
  const cards = getConnectionCards();
  if (cards.length > 0) {
    const lastCard = cards[cards.length - 1]?.cardElement;
    if (lastCard) {
      lastCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  // Scroll window and document
  window.scrollTo({ top: document.body.scrollHeight || document.documentElement.scrollHeight, behavior: 'smooth' });
  if (document.scrollingElement) {
    document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
  }

  // Scroll any scrollable parent containers on LinkedIn
  const containers = document.querySelectorAll('main, .scaffold-layout__main, .scaffold-layout__list, .mn-connections, .artdeco-list');
  for (const c of containers) {
    if (c.scrollHeight > c.clientHeight) {
      c.scrollTop = c.scrollHeight;
    }
  }

  // Click any "Show more results" button if present
  const allButtons = Array.from(document.querySelectorAll('button, a.artdeco-button'));
  for (const b of allButtons) {
    const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
    if (txt === 'show more results' || txt === 'show more' || txt === 'load more' || txt === 'see more') {
      try { b.click(); } catch (e) {}
    }
  }

  // Small scroll bounce to trigger IntersectionObserver
  await sleep(1000);
  window.scrollBy({ top: -300, behavior: 'smooth' });
  await sleep(600);
  window.scrollTo({ top: document.body.scrollHeight || document.documentElement.scrollHeight, behavior: 'smooth' });

  window.dispatchEvent(new Event('scroll'));
  document.dispatchEvent(new Event('scroll'));
}

// Select appropriate template based on keyword rules
function selectTemplate(conn, settings, convoContainer) {
  const rules = Array.isArray(settings.rules) ? settings.rules : [];

  // Gather all available context for this person: card, headline, location, profile, chat header
  const contextParts = [
    conn.name || '',
    conn.headline || '',
    conn.location || '',
    conn.cardElement ? (conn.cardElement.innerText || conn.cardElement.textContent || '') : '',
    convoContainer ? (convoContainer.innerText || convoContainer.textContent || '') : ''
  ];
  const searchableText = contextParts.join(' ').toLowerCase();

  for (const rule of rules) {
    if (!rule.keywords || !rule.template) continue;
    const keywords = rule.keywords.split(',').map(k => k.trim()).filter(Boolean);
    for (const kw of keywords) {
      if (matchKeyword(searchableText, kw)) {
        console.log(`[LAW] Matched rule "${rule.name}" via keyword "${kw}" for ${conn.name} (Location: ${conn.location || 'N/A'})`);
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
    chrome.storage.local.set({
      runtimeState: {
        isProcessing: true,
        currentStatus: 'Starting Auto-Welcome...',
        progressText: '',
        countdown: 0,
        lastRunTime: new Date().toISOString()
      }
    });
  } catch (e) {}

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
    await closeAllOpenChats();
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
      // Re-read storage stats so if user clicked Reset Today Count, it reflects immediately
      try {
        const fresh = await getExtensionData();
        currentTodayCount = fresh.stats.todayCount;
      } catch (e) {}

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
        if (consecutiveEmptyScrolls > 5) {
          console.log('[LAW] No more unmessaged connections found after 5 scroll attempts.');
          break;
        }

        updateHud(`Loading more connections from LinkedIn (scroll check ${consecutiveEmptyScrolls}/5)...`, formatQuota(currentTodayCount, settings.dailyLimit));
        await triggerLinkedInInfiniteScroll();
        await sleep(2500);
        continue;
      }

      // Reset scroll counter when unmessaged cards are available
      consecutiveEmptyScrolls = 0;
      const conn = unmessaged[0];

      // Ensure all stray open chats are closed before opening the next one
      await closeAllOpenChats();
      await sleep(500);

      const firstName = extractFirstName(conn.name);
      updateHud(`Opening chat with ${conn.name}...`, formatQuota(currentTodayCount, settings.dailyLimit));

      // Scroll card into view
      conn.cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(700);

      if (shouldStop) break;

      // Click "Message" button (single click using full simulation to prevent multiple compose popups)
      simulateClick(conn.messageButton);

      // Wait for conversation/compose window to appear (with live progress on HUD)
      const convoResult = await waitForConversationWindow(conn.name);

      if (!convoResult) {
        updateHud(`⚠️ Chat window didn't open for ${conn.name}. Skipping...`, formatQuota(currentTodayCount, settings.dailyLimit));
        console.warn('[LAW] Could not locate conversation window for', conn.name);
        sentMap.add(conn.profileUrl);
        await closeAllOpenChats();
        await sleep(1000);
        continue;
      }

      const { textbox: textBox, container: activeConvo } = convoResult;
      await sleep(600);

      // SAFETY GUARD: Verify that activeConvo belongs specifically to conn.name (with 3-attempt grace for async pill render)
      let recipientCheck = verifyConversationRecipient(activeConvo, conn.name);
      if (!recipientCheck.match) {
        for (let r = 0; r < 3; r++) {
          await sleep(400);
          recipientCheck = verifyConversationRecipient(activeConvo, conn.name);
          if (recipientCheck.match) break;
        }
      }
      if (!recipientCheck.match) {
        console.error(`[LAW] SAFETY GUARD: Active chat does NOT match "${conn.name}". Aborting to prevent wrong-recipient send.`);
        updateHud(`⚠️ Chat mismatch for ${firstName}. Resetting...`, formatQuota(currentTodayCount, settings.dailyLimit));
        await closeConversationWindow(activeConvo);
        await closeAllOpenChats();
        await sleep(1000);
        continue;
      }

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

          await closeConversationWindow(activeConvo);
          await sleep(500);
          await closeAllOpenChats();
          await sleep(1000);
          continue;
        }
      }

      // Resolve location: from connection card or fetch from profile in background
      if (!conn.location) {
        conn.location = await getOrFetchLocation(conn);
      }

      // Select template (keyword rule matching or default fallback) with Spintax & Full Message Variations
      const ruleResult = selectTemplate(conn, settings, activeConvo);
      const personalizedMessage = resolveMessageTemplate(ruleResult.template || settings.template, conn);

      const locSuffix = conn.location ? ` [${conn.location}]` : '';
      if (ruleResult.ruleName !== 'Default') {
        updateHud(`🎯 Matched "${ruleResult.ruleName}" (${ruleResult.matchedKeyword})${locSuffix}! Typing message to ${firstName}...`, formatQuota(currentTodayCount, settings.dailyLimit));
      } else {
        updateHud(`Found chat! Typing default message to ${firstName}...`, formatQuota(currentTodayCount, settings.dailyLimit));
      }

      // Type the message into the Draft.js editor
      const typed = await typeIntoReactInput(textBox, personalizedMessage);

      if (!typed) {
        updateHud(`⚠️ Could not type for ${firstName}. Skipping...`, formatQuota(currentTodayCount, settings.dailyLimit));
        console.warn('[LAW] Could not type message for', conn.name);
        sentMap.add(conn.profileUrl);
        await closeConversationWindow(activeConvo);
        await sleep(500);
        await closeAllOpenChats();
        await sleep(1000);
        continue;
      }

      updateHud(`✏️ Message typed for ${firstName}! Locating Send button...`, formatQuota(currentTodayCount, settings.dailyLimit));
      await sleep(1000);

      if (shouldStop) {
        await closeConversationWindow(activeConvo);
        await closeAllOpenChats();
        break;
      }

      // Find send button strictly within the active conversation window
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
            headline: conn.headline,
            location: conn.location || '',
            company: extractCompany(conn.headline),
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

          // Trigger free Webhook if configured
          if (settings.webhookUrl && typeof settings.webhookUrl === 'string' && settings.webhookUrl.trim().startsWith('http')) {
            try {
              fetch(settings.webhookUrl.trim(), {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: conn.name,
                  firstName: firstName,
                  headline: conn.headline,
                  location: conn.location || '',
                  company: extractCompany(conn.headline),
                  profileUrl: conn.profileUrl,
                  message: personalizedMessage,
                  ruleMatched: ruleResult.ruleName !== 'Default' ? `${ruleResult.ruleName} [${ruleResult.matchedKeyword}]` : 'Default',
                  sentAt: new Date().toISOString()
                })
              }).catch(err => console.warn('[LAW] Webhook delivery note:', err));
            } catch (e) {}
          }
        } catch (e) {
          console.error('[LAW] Failed to save record:', e);
        }

        // Close conversation window cleanly
        await closeConversationWindow(activeConvo);
        await sleep(800);
        await closeAllOpenChats();
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
        await closeConversationWindow(activeConvo);
        await sleep(500);
        await closeAllOpenChats();
        await sleep(1000);
      }

    }

    let finishMsg = '';
    if (shouldStop) {
      finishMsg = 'Automation stopped by user.';
    } else if (processedInSession > 0) {
      finishMsg = `Done! Sent ${processedInSession} welcome messages.`;
    } else {
      finishMsg = 'All visible connections were already messaged previously. Click "Clear History" in extension if you want to re-message them.';
    }

    isRunning = false;
    updateHud(finishMsg, formatQuota(currentTodayCount, settings.dailyLimit));
    try {
      await chrome.storage.local.set({
        runtimeState: {
          isProcessing: false,
          currentStatus: finishMsg,
          progressText: '',
          countdown: 0,
          lastRunTime: new Date().toISOString()
        }
      });
    } catch (e) {}

    setTimeout(hideHud, 6000);

  } catch (err) {
    console.error('Auto Welcome sequence error:', err);
    updateHud(`Error: ${err.message}`);
    try {
      await chrome.storage.local.set({
        runtimeState: {
          isProcessing: false,
          currentStatus: `Error: ${err.message}`,
          progressText: '',
          countdown: 0,
          lastRunTime: new Date().toISOString()
        }
      });
    } catch (e) {}
    setTimeout(hideHud, 5000);
  } finally {
    isRunning = false;
  }
}


// --- ROBUST SENT INVITATIONS DISCOVERY & ACTIONS ---
function getSentInvitationCards() {
  const cards = [];
  const seenButtons = new Set();
  const seenCards = new Set();

  // Find all elements containing the text "Withdraw" (case-insensitive)
  const candidateElements = Array.from(document.querySelectorAll('button, a, [role="button"], span, div.invitation-card__action-container'));

  for (const el of candidateElements) {
    if (el.closest('#law-floating-hud, header, #global-nav, .global-nav, .artdeco-modal, [role="dialog"]')) continue;

    const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();

    const isWithdraw = text === 'withdraw' || aria === 'withdraw' || aria.includes('withdraw invitation') || text.includes('withdraw invitation');
    if (!isWithdraw) continue;

    // Filter out top-level parent wrappers that happen to contain the word
    if (el.children.length > 2) continue;

    // Find the interactive button/link
    const btn = el.closest('button, a, [role="button"]') || el;
    if (seenButtons.has(btn)) continue;
    seenButtons.add(btn);

    // Find card container
    let card = btn.closest('li, .invitation-card, .artdeco-list__item, [data-view-name*="invitation"], [data-chameleon-item], .mn-invitation-card');
    if (!card) {
      let curr = btn.parentElement;
      for (let i = 0; i < 8 && curr && curr !== document.body; i++) {
        if (curr.querySelector('a[href*="/in/"]') || curr.querySelector('time') || curr.querySelector('h3, strong')) {
          card = curr;
          break;
        }
        curr = curr.parentElement;
      }
    }
    if (!card) card = btn.parentElement?.parentElement || btn.parentElement;
    if (!card || seenCards.has(card)) continue;
    seenCards.add(card);

    // Recipient Name
    const nameEl = card.querySelector('.invitation-card__title, a[href*="/in/"], h3, strong, [aria-hidden="true"], [class*="title"], [class*="name"]');
    const name = nameEl ? (nameEl.innerText || nameEl.textContent || '').trim().split('\n')[0] : 'Member';

    // Age in days
    const ageDays = getInvitationAgeDays(card);

    cards.push({
      cardElement: card,
      withdrawButton: btn,
      name,
      ageDays
    });
  }

  return cards;
}

function getInvitationAgeDays(card) {
  if (!card) return null;
  // First look for time element or element containing 'Sent'
  let targetText = '';
  const timeEl = card.querySelector('time, .time-ago, .invitation-card__time-sent, .invitation-card__meta, [class*="time"]');
  if (timeEl) {
    targetText = (timeEl.innerText || timeEl.textContent || '').trim();
  }

  if (!targetText || !targetText.toLowerCase().includes('sent')) {
    const allEls = Array.from(card.querySelectorAll('span, p, div, time'));
    const sentEl = allEls.find(el => {
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      return t.startsWith('sent ') || t.includes(' sent ') || t.includes('sent yesterday');
    });
    if (sentEl) {
      targetText = (sentEl.innerText || sentEl.textContent || '').trim();
    }
  }

  if (!targetText) {
    targetText = (card.innerText || card.textContent || '').trim();
  }

  const text = targetText.toLowerCase();

  // Sent yesterday
  if (text.includes('yesterday')) return 1;

  // Sent X hours / minutes ago
  if (text.match(/sent\s+\d+\s*(?:hour|minute|min|hr)/i) || text.match(/\b\d+\s*(?:hour|minute|min|hr)s?\s*ago/i)) {
    return 0;
  }

  // Years: "Sent 1 year ago", "1y ago", "1 yr ago"
  const yr = text.match(/(?:sent\s+)?(\d+)\s*(?:years?|yrs?|y)\b(?:\s*ago)?/i);
  if (yr) return parseInt(yr[1], 10) * 365;

  // Months: "Sent 2 months ago", "2mo ago", "1 month ago"
  const mo = text.match(/(?:sent\s+)?(\d+)\s*(?:months?|mos?|m)\b(?:\s*ago)?/i);
  if (mo) return parseInt(mo[1], 10) * 30;

  // Weeks: "Sent 3 weeks ago", "3w ago", "2 weeks ago"
  const wk = text.match(/(?:sent\s+)?(\d+)\s*(?:weeks?|wks?|w)\b(?:\s*ago)?/i);
  if (wk) return parseInt(wk[1], 10) * 7;

  // Days: "Sent 4 days ago", "4d ago", "5 days ago"
  const dy = text.match(/(?:sent\s+)?(\d+)\s*(?:days?|d)\b(?:\s*ago)?/i);
  if (dy) return parseInt(dy[1], 10);

  return null;
}

function formatAgeDays(days) {
  if (days === null || days === undefined) return 'recent';
  if (days >= 365) return `${Math.round(days / 365)} year(s) ago`;
  if (days >= 30) return `${Math.round(days / 30)} month(s) ago`;
  if (days >= 7) return `${Math.round(days / 7)} week(s) ago`;
  return `${days} day(s) ago`;
}

// Dedicated multi-strategy scroller for LinkedIn's Sent Invitations list
async function triggerInvitationsInfiniteScroll(cards = []) {
  // 1. Scroll the very last card and its withdraw button into view (forces browser to scroll container & triggers IntersectionObserver)
  if (cards.length > 0) {
    const last = cards[cards.length - 1];
    if (last && last.cardElement) {
      try {
        last.cardElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } catch (e) {}
    }
    if (last && last.withdrawButton) {
      try {
        last.withdrawButton.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } catch (e) {}
    }
  }

  // 2. Scroll window and document
  try {
    window.scrollTo({ top: document.body.scrollHeight || document.documentElement.scrollHeight, behavior: 'smooth' });
    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
    }
  } catch (e) {}

  // 3. Scroll all candidate scrollable containers in LinkedIn's layout
  const scrollContainers = Array.from(document.querySelectorAll(
    'main, .scaffold-layout__main, .scaffold-layout__content, .scaffold-layout__list, .scaffold-finite-scroll, .mn-invitation-manager, .artdeco-list, ul, div[tabindex="-1"]'
  ));
  for (const c of scrollContainers) {
    try {
      if (c.scrollHeight > c.clientHeight) {
        c.scrollTop = c.scrollHeight;
      }
    } catch (e) {}
  }

  // 4. Click any "Show more results", "Load more" or "See more" buttons if LinkedIn has one at the bottom
  const buttons = Array.from(document.querySelectorAll('button, a.artdeco-button'));
  for (const b of buttons) {
    if (b.closest('#law-floating-hud')) continue;
    const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
    if (txt === 'show more results' || txt === 'show more' || txt === 'load more' || txt === 'see more') {
      try { b.click(); } catch (e) {}
    }
  }

  // 5. Small bounce to nudge LinkedIn's infinite scroll listener
  await sleep(600);
  try { window.scrollBy({ top: -150, behavior: 'smooth' }); } catch (e) {}
  await sleep(400);
  try { window.scrollBy({ top: 300, behavior: 'smooth' }); } catch (e) {}

  // 6. Dispatch scroll events
  try {
    window.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('scroll'));
  } catch (e) {}
}

// Auto-Withdraw Sent Invitations (supports configurable cutoff: e.g. 14 days, 30 days, 60 days, 180 days, or 0 = all)
async function runWithdrawOldInvitesSequence(minAgeDays = 30) {
  if (isRunning) return;
  isRunning = true;
  shouldStop = false;

  const ageLabel = minAgeDays === 0 ? 'all pending invites' : (minAgeDays >= 30 ? `> ${Math.round(minAgeDays / 30)} month(s)` : `> ${Math.round(minAgeDays / 7)} week(s)`);

  try {
    chrome.storage.local.set({
      runtimeState: {
        isProcessing: true,
        currentStatus: `Starting invitation cleanup (${ageLabel})...`,
        progressText: '',
        countdown: 0,
        lastRunTime: new Date().toISOString()
      }
    });
  } catch (e) {}

  updateHud(`Starting invitation cleanup (${ageLabel})...`);
  await sleep(1000);

  // 1. If not on invitation-manager, navigate there
  if (!window.location.href.includes('/mynetwork/invitation-manager')) {
    updateHud('Navigating to Sent Invitations page...');
    sessionStorage.setItem('law_pending_withdraw', String(minAgeDays));
    window.location.href = `https://www.linkedin.com/mynetwork/invitation-manager/sent/?law_withdraw=1&min_days=${minAgeDays}`;
    isRunning = false;
    return;
  }

  // 2. Ensure "Sent" tab is active on the page (only if not already on /sent)
  if (!window.location.href.includes('/sent')) {
    updateHud('Opening Sent invitations tab...');
    await sleep(600);
    const sentTabLink = Array.from(document.querySelectorAll('a, button, [role="tab"]')).find(el => {
      const href = el.getAttribute('href') || '';
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();
      return (href.includes('/invitation-manager/sent') || text === 'sent' || text.startsWith('sent ('));
    });
    if (sentTabLink) {
      sentTabLink.click();
      await sleep(2000);
    }
  }

  // 3. Wait for invitation cards to render from LinkedIn's API (up to 15 seconds)
  updateHud('Waiting for sent invitations to load...', 'Checking DOM');
  let initialCards = [];
  for (let w = 0; w < 30; w++) {
    if (shouldStop) break;
    initialCards = getSentInvitationCards();
    if (initialCards.length > 0) break;
    await sleep(500);
  }

  let withdrawnCount = 0;
  let stuckScrolls = 0;
  let totalScrollCount = 0;
  const maxTotalScrolls = 200; // Allows auto-scrolling through up to 2,000+ invites
  let seenOldestDays = 0;
  let totalCardsSeen = initialCards.length;
  let lastCardsCount = 0;

  try {
    while (!shouldStop && stuckScrolls < 4 && totalScrollCount < maxTotalScrolls) {
      const currentCards = getSentInvitationCards();
      totalCardsSeen = Math.max(totalCardsSeen, currentCards.length);

      let foundQualifying = false;

      for (const item of currentCards) {
        if (shouldStop) break;

        if (item.ageDays !== null && item.ageDays > seenOldestDays) {
          seenOldestDays = item.ageDays;
        }

        const isOld = minAgeDays === 0 || (item.ageDays !== null && item.ageDays >= minAgeDays);

        if (isOld) {
          foundQualifying = true;
          const ageDisplay = item.ageDays !== null ? formatAgeDays(item.ageDays) : 'pending';
          updateHud(`Withdrawing invite to ${item.name} (${ageDisplay})...`, `Withdrawn: ${withdrawnCount}`);

          item.withdrawButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(600);
          item.withdrawButton.click();
          await sleep(800);

          // Confirm in dialog if modal appears (with retry up to 2.5s)
          for (let m = 0; m < 7; m++) {
            const modal = document.querySelector('.artdeco-modal, [role="dialog"], [data-test-modal-container]');
            if (modal) {
              const modalBtns = Array.from(modal.querySelectorAll('button, a, [role="button"]'));
              const confirmBtn = modalBtns.find(b => {
                const t = (b.innerText || b.textContent || b.getAttribute('aria-label') || '').trim().toLowerCase();
                return t === 'withdraw' || b.classList.contains('artdeco-button--primary') || b.getAttribute('data-test-dialog-primary-btn') !== null;
              });
              if (confirmBtn) {
                confirmBtn.click();
                await sleep(1000);
                break;
              }
            }
            await sleep(300);
          }

          withdrawnCount++;
          updateHud(`Withdrawn ${withdrawnCount} invite(s)...`, `Withdrawn: ${withdrawnCount}`);
          await sleep(1200);
        }
      }

      if (!foundQualifying) {
        totalScrollCount++;
        if (currentCards.length === lastCardsCount) {
          stuckScrolls++;
        } else {
          stuckScrolls = 0;
        }
        lastCardsCount = currentCards.length;

        const oldestDisplay = seenOldestDays > 0 ? formatAgeDays(seenOldestDays) : 'today';
        updateHud(
          `Auto-scrolling to invites ${ageLabel}... (${totalCardsSeen} scanned, oldest: ${oldestDisplay})`,
          `Scan #${totalScrollCount}`
        );
        await triggerInvitationsInfiniteScroll(currentCards);
        await sleep(1800);
      } else {
        stuckScrolls = 0;
        window.scrollBy({ top: 500, behavior: 'smooth' });
        await sleep(1500);
      }
    }

    let msg = '';
    if (shouldStop) {
      msg = 'Withdrawal stopped by user.';
    } else if (withdrawnCount > 0) {
      msg = `Done! Successfully withdrawn ${withdrawnCount} invitations (${ageLabel}).`;
    } else if (totalCardsSeen > 0) {
      const oldestText = seenOldestDays > 0 ? formatAgeDays(seenOldestDays) : 'less than 1 day ago';
      msg = `Scanned ${totalCardsSeen} pending invitations (oldest: ${oldestText}), but none reached ${ageLabel}. To withdraw more recent invites, select "All Pending Invites" or "1 Month".`;
    } else {
      msg = 'No pending sent invitations found on this account.';
    }

    isRunning = false;
    updateHud(msg, `Withdrawn: ${withdrawnCount}`);
    try {
      await chrome.storage.local.set({
        runtimeState: {
          isProcessing: false,
          currentStatus: msg,
          progressText: '',
          countdown: 0,
          lastRunTime: new Date().toISOString()
        }
      });
    } catch (e) {}
    setTimeout(hideHud, 7000);

  } catch (err) {
    console.error('Withdraw invites error:', err);
    updateHud(`Error: ${err.message}`);
    isRunning = false;
    try {
      await chrome.storage.local.set({
        runtimeState: {
          isProcessing: false,
          currentStatus: `Error: ${err.message}`,
          progressText: '',
          countdown: 0,
          lastRunTime: new Date().toISOString()
        }
      });
    } catch (e) {}
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

  if (message.action === 'START_WITHDRAW_INVITES') {
    if (!isRunning) {
      const minDays = typeof message.minAgeDays === 'number' 
        ? message.minAgeDays 
        : (typeof message.minAgeMonths === 'number' ? message.minAgeMonths * 30 : 30);
      runWithdrawOldInvitesSequence(minDays);
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
  const currentUrl = window.location.href;
  const urlParams = new URLSearchParams(window.location.search);

  if (currentUrl.includes('/mynetwork/invite-connect/connections')) {
    const hasParam = urlParams.get('law_auto') === '1';
    const hasSession = sessionStorage.getItem('law_pending_scan') === '1';

    if (hasParam || hasSession) {
      sessionStorage.removeItem('law_pending_scan');
      try {
        const cleanUrl = window.location.href.replace(/[?&]law_auto=1/, '');
        window.history.replaceState({}, document.title, cleanUrl);
      } catch (e) {}

      console.log('[LAW] Auto-start detected on connections page load. Starting in 1.8s...');
      setTimeout(() => {
        if (!isRunning) {
          runAutoWelcomeSequence();
        }
      }, 1800);
    }
  } else if (currentUrl.includes('/mynetwork/invitation-manager')) {
    const hasParam = urlParams.get('law_withdraw') === '1';
    const hasSession = sessionStorage.getItem('law_pending_withdraw');

    if (hasParam || hasSession) {
      sessionStorage.removeItem('law_pending_withdraw');
      const minDays = urlParams.get('min_days') 
        ? parseInt(urlParams.get('min_days'), 10) 
        : (hasSession ? parseInt(hasSession, 10) : 30);

      try {
        const cleanUrl = window.location.href.replace(/[?&]law_withdraw=1(&min_days=\d+)?/, '');
        window.history.replaceState({}, document.title, cleanUrl);
      } catch (e) {}

      console.log(`[LAW] Auto-withdraw detected on sent invitations page load (minDays=${minDays}). Starting in 1.8s...`);
      setTimeout(() => {
        if (!isRunning) {
          runWithdrawOldInvitesSequence(minDays);
        }
      }, 1800);
    }
  }
}

// Watch for single-page application (SPA) client-side navigation
window.addEventListener('popstate', () => {
  setTimeout(checkAutoStartOnPageLoad, 600);
});

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAutoStartOnPageLoad);
  window.addEventListener('load', checkAutoStartOnPageLoad);
} else {
  checkAutoStartOnPageLoad();
}
