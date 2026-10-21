/**
 * LinkedIn Auto Welcome & Responder - Popup Logic
 * Robust, synchronous event binding with direct storage access.
 */

const DEFAULT_WELCOME_VARIANTS = [
  "Hi {firstName}, thanks for connecting! Looking forward to staying in touch and seeing what you're working on. Hope you have a wonderful {dayOfWeek}!",
  "{timeOfDay} {firstName}, glad to link up with you here on LinkedIn! Excited to follow your journey at {company}. Wishing you a productive week ahead.",
  "Hello {firstName}, appreciate the connection! Always looking to expand my network with fellow professionals. Hope business is going great on your end this {dayOfWeek}!",
  "Hey {firstName}, great connecting with you! Looking forward to keeping in touch and following your updates. Have a fantastic rest of your {dayOfWeek}!"
];

const DEFAULT_REALTOR_VARIANTS = [
  "Hi {firstName}, thanks for connecting! It is always good to connect and know people in the industry.\n\nYou can check about how my company can help you grow on the below link:\nhttps://www.linkedin.com/company/prime-real-ops/",
  "{timeOfDay} {firstName}, glad to link up! Always great to connect and expand my network with fellow professionals in the industry.\n\nFeel free to see how our team helps businesses scale and grow right here:\nhttps://www.linkedin.com/company/prime-real-ops/",
  "Hello {firstName}, appreciate the connection! Always valuable to meet and stay in touch with active people in this space.\n\nHere is a quick look at how my company can support your growth:\nhttps://www.linkedin.com/company/prime-real-ops/",
  "Hey {firstName}, great connecting with you! It's always a pleasure knowing fellow leaders across the industry.\n\nCheck out how we can help you grow your business at the link below:\nhttps://www.linkedin.com/company/prime-real-ops/"
];

const DEFAULT_SETTINGS = {
  enabled: true,
  template: DEFAULT_WELCOME_VARIANTS.join("\n\n---OR---\n\n"),
  rules: [
    {
      id: "rule_realtors",
      name: "US Realtors & Real Estate",
      keywords: "realtor, real estate, broker, realty, mortgage, agent, appraisal, investment, remax, keller williams, exp",
      template: DEFAULT_REALTOR_VARIANTS.join("\n\n---OR---\n\n")
    }
  ],
  dailyLimit: 15,
  minDelay: 25,
  maxDelay: 45,
  skipExistingChats: true,
  autoScanInterval: 60
};

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generateContextPreservingVariants(baseText) {
  let text = (baseText || '').trim();
  if (!text) {
    return DEFAULT_WELCOME_VARIANTS.slice();
  }

  // If user passed existing variants separated by ---OR---, take the first variant as the base
  if (text.includes('---OR---')) {
    text = text.split(/(?:\r?\n\s*---OR---\s*\r?\n)/i)[0].trim();
  }

  // 1. Replace hardcoded recipient name in greeting (e.g. "Hi Ryan," -> "Hi {firstName},")
  text = text.replace(/^(hi|hello|hey|dear)\s+[a-z0-9_-]+([,!]|\s+thanks|\s+thank)/i, '$1 {firstName}$2');

  // Ensure {firstName} is present if greeting starts without tag
  if (/^(hi|hello|hey)\s*[,!]/i.test(text)) {
    text = text.replace(/^(hi|hello|hey)\s*[,!]/i, '$1 {firstName},');
  }

  // 2. Extract URLs
  const urlMatches = text.match(/https?:\/\/[^\s]+/gi) || [];
  const primaryUrl = urlMatches[0] || '';

  // Check if this is the Prime Real Ops / Company growth message
  const isPrimeOps = /prime-real-ops/i.test(text) || (/company/i.test(text) && /grow/i.test(text) && primaryUrl);

  if (isPrimeOps || primaryUrl) {
    const url = primaryUrl || 'https://www.linkedin.com/company/prime-real-ops/';
    return [
      text, // Variant 1: The user's exact original message!
      `{timeOfDay} {firstName}, glad to link up! Always great to connect and expand my network with fellow professionals in the industry.\n\nFeel free to see how our team helps businesses scale and grow right here:\n${url}`,
      `Hello {firstName}, appreciate the connection! Always valuable to meet and stay in touch with active people in this space.\n\nHere is a quick look at how my company can support your growth:\n${url}`,
      `Hey {firstName}, great connecting with you! It's always a pleasure knowing fellow leaders across the industry.\n\nCheck out how we can help you grow your business at the link below:\n${url}`
    ];
  }

  // 3. For any other custom message:
  // Variant 1 is ALWAYS the user's original text!
  const lines = text.split(/\r?\n+/).filter(l => l.trim().length > 0);
  const firstLine = lines[0] || text;
  const remainingBody = lines.length > 1 ? lines.slice(1).join('\n\n') : '';

  const greetings = [
    `{timeOfDay} {firstName}, glad to link up with you here on LinkedIn!`,
    `Hello {firstName}, appreciate the connection! Always great connecting with fellow professionals.`,
    `Hey {firstName}, great connecting with you!`
  ];

  const variants = [text]; // Always keep user's original text as Variant 1!

  greetings.forEach((greet) => {
    if (remainingBody) {
      variants.push(`${greet}\n\n${remainingBody}`);
    } else {
      const cleanedFirst = firstLine.replace(/^(hi|hello|hey|dear)\s+(\{firstName\}|[a-z0-9_-]+)[,!.]?\s*/i, '').trim();
      variants.push(`${greet} ${cleanedFirst}`);
    }
  });

  return variants;
}

function parseVariants(rawTemplate, fallbackList) {
  if (!rawTemplate || typeof rawTemplate !== 'string' || !rawTemplate.trim()) {
    return (fallbackList || DEFAULT_WELCOME_VARIANTS).slice();
  }
  const parts = rawTemplate
    .split(/(?:\r?\n\s*---OR---\s*\r?\n|\r?\n\s*===VARIANT===\s*\r?\n|\r?\n\s*---\s*\r?\n)/i)
    .map(v => v.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [rawTemplate.trim()];
}

function initPopup() {
  // Elements
  const masterToggle = document.getElementById('master-toggle');
  const btnOpenFullDashboard = document.getElementById('btn-open-full-dashboard');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const quotaBadge = document.getElementById('quota-badge');
  const btnResetToday = document.getElementById('btn-reset-today');
  const btnClearHistoryQuick = document.getElementById('btn-clear-history-quick');
  const quotaProgressFill = document.getElementById('quota-progress-fill');
  const btnTriggerScan = document.getElementById('btn-trigger-scan');
  const btnWithdrawInvites = document.getElementById('btn-withdraw-invites');
  const btnStop = document.getElementById('btn-stop');

  // Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Template tab
  const templateInput = document.getElementById('template-input');
  const templatePreview = document.getElementById('template-preview');
  const defaultVariantTabs = document.getElementById('default-variant-tabs');
  const btnAutoGenVariants = document.getElementById('btn-auto-gen-variants');
  const btnDeleteActiveVariant = document.getElementById('btn-delete-active-variant');
  const btnShufflePreview = document.getElementById('btn-shuffle-preview');
  const btnSaveTemplate = document.getElementById('btn-save-template');
  const tagButtons = document.querySelectorAll('.tag-btn:not(.rule-tag-btn)');
  const popupRulesContainer = document.getElementById('popup-rules-container');
  const btnAddRule = document.getElementById('btn-add-rule');
  let currentRules = [];

  let defaultVariants = DEFAULT_WELCOME_VARIANTS.slice();
  let currentDefaultVariantIndex = 0;
  let previewVariantIndex = 0;

  // Settings tab
  const settingDailyLimit = document.getElementById('setting-daily-limit');
  const settingMinDelay = document.getElementById('setting-min-delay');
  const settingMaxDelay = document.getElementById('setting-max-delay');
  const settingSkipExisting = document.getElementById('setting-skip-existing');
  const settingScanInterval = document.getElementById('setting-scan-interval');
  const settingWebhookUrl = document.getElementById('setting-webhook-url');
  const settingFollowupEnabled = document.getElementById('setting-followup-enabled');
  const settingFollowupDays = document.getElementById('setting-followup-days');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  // Logs tab
  const logsCount = document.getElementById('logs-count');
  const logsList = document.getElementById('logs-list');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const toast = document.getElementById('toast');

  let toastTimeout = null;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2200);
  }

  function renderDefaultVariantTabs() {
    if (!defaultVariantTabs || !templateInput) return;
    defaultVariantTabs.innerHTML = '';

    if (defaultVariants.length === 0) {
      defaultVariants = DEFAULT_WELCOME_VARIANTS.slice();
    }

    defaultVariants.forEach((v, idx) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `variant-tab-pill ${idx === currentDefaultVariantIndex ? 'active' : ''}`;
      pill.textContent = `Variant ${idx + 1}`;
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        defaultVariants[currentDefaultVariantIndex] = templateInput.value;
        currentDefaultVariantIndex = idx;
        renderDefaultVariantTabs();
      });
      defaultVariantTabs.appendChild(pill);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'variant-tab-add';
    addBtn.textContent = '+ Add Variant';
    addBtn.title = 'Add another whole-message variation';
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      defaultVariants[currentDefaultVariantIndex] = templateInput.value;
      const suggestions = generateContextPreservingVariants(templateInput.value);
      const newVar = suggestions[defaultVariants.length % suggestions.length] || "Hi {firstName}, thanks for connecting! Looking forward to staying in touch.";
      defaultVariants.push(newVar);
      currentDefaultVariantIndex = defaultVariants.length - 1;
      renderDefaultVariantTabs();
      showToast(`Added Variant ${defaultVariants.length}`);
    });
    defaultVariantTabs.appendChild(addBtn);

    templateInput.value = defaultVariants[currentDefaultVariantIndex] || '';
    if (btnDeleteActiveVariant) {
      btnDeleteActiveVariant.style.display = defaultVariants.length > 1 ? 'inline-block' : 'none';
    }
    updatePreview();
  }

  function updatePreview() {
    if (!templatePreview) return;
    if (templateInput) {
      defaultVariants[currentDefaultVariantIndex] = templateInput.value;
    }
    const targetVariant = defaultVariants[previewVariantIndex % Math.max(1, defaultVariants.length)] || templateInput?.value || '';
    const sample = targetVariant
      .replace(/\{firstName\}/gi, 'Sarah')
      .replace(/\{fullName\}/gi, 'Sarah Jenkins')
      .replace(/\{company\}/gi, 'Compass Realty')
      .replace(/\{timeOfDay\}/gi, 'Good morning')
      .replace(/\{dayOfWeek\}/gi, 'Wednesday')
      .replace(/\{headline\}/gi, 'Associate Broker');
    templatePreview.textContent = sample || '(Empty message)';
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }

  function renderRules(rules) {
    if (!popupRulesContainer) return;
    popupRulesContainer.innerHTML = '';

    if (!rules || rules.length === 0) {
      popupRulesContainer.innerHTML = '<div class="empty-state" style="padding: 10px;">No targeted rules yet. Add a rule to send custom messages to Realtors, CEOs, etc.</div>';
      return;
    }

    rules.forEach((rule, idx) => {
      const card = document.createElement('div');
      card.className = 'rule-card';
      card.dataset.id = rule.id || `rule_${idx}`;

      card.innerHTML = `
        <div class="rule-card-header">
          <input type="text" class="rule-name-input" placeholder="Rule Name (e.g. US Realtors)" value="${escapeHtml(rule.name || '')}">
          <button type="button" class="rule-delete-btn" title="Delete Rule" data-delete-idx="${idx}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
        <div>
          <div class="sub-label">Keywords (comma-separated):</div>
          <input type="text" class="rule-keywords-input" placeholder="e.g. realtor, real estate, broker, USA" value="${escapeHtml(rule.keywords || '')}">
        </div>
        <div>
          <div class="form-header" style="margin-bottom: 4px;">
            <div class="sub-label">Message Template:</div>
            <div class="variable-tags" style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end;">
              <button type="button" class="tag-btn rule-tag-btn" data-tag="{firstName}">+ {firstName}</button>
              <button type="button" class="tag-btn rule-tag-btn" data-tag="{fullName}">+ {fullName}</button>
              <button type="button" class="tag-btn rule-tag-btn" data-tag="{company}">+ {company}</button>
              <button type="button" class="tag-btn rule-tag-btn" data-tag="{timeOfDay}">+ {timeOfDay}</button>
              <button type="button" class="tag-btn rule-tag-btn" data-tag="{dayOfWeek}">+ {dayOfWeek}</button>
              <button type="button" class="tag-btn rule-tag-btn" data-tag="{headline}">+ {headline}</button>
            </div>
          </div>
          <textarea class="rule-template-input" rows="4" placeholder="Message template for this rule">${escapeHtml(rule.template || '')}</textarea>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <span style="font-size: 10.5px; color: #64748b;">Separate variants with <code>---OR---</code></span>
            <button type="button" class="rule-gen-btn btn-generate-variants" style="padding: 2px 6px; font-size: 10px;">✨ Auto-Add Variants</button>
          </div>
        </div>
      `;

      popupRulesContainer.appendChild(card);
    });

    // Wire up rule-specific tag buttons
    popupRulesContainer.querySelectorAll('.rule-tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tag = btn.dataset.tag;
        const card = btn.closest('.rule-card');
        const textarea = card?.querySelector('.rule-template-input');
        if (textarea) {
          const start = textarea.selectionStart ?? textarea.value.length;
          const end = textarea.selectionEnd ?? textarea.value.length;
          textarea.value = textarea.value.substring(0, start) + tag + textarea.value.substring(end);
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start + tag.length;
        }
      });
    });

    // Wire up rule auto-generate variants
    popupRulesContainer.querySelectorAll('.rule-gen-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const card = btn.closest('.rule-card');
        const textarea = card?.querySelector('.rule-template-input');
        const kwInput = card?.querySelector('.rule-keywords-input');
        if (textarea) {
          const userMsg = textarea.value.trim();
          const variants = generateContextPreservingVariants(userMsg);
          textarea.value = variants.join('\n\n---OR---\n\n');
          showToast('✨ Preserved your message & added 3 safe variations!');
        }
      });
    });

    // Wire up delete buttons
    popupRulesContainer.querySelectorAll('.rule-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const delIdx = parseInt(btn.dataset.deleteIdx, 10);
        const current = collectRulesFromDom();
        current.splice(delIdx, 1);
        currentRules = current;
        renderRules(currentRules);
      });
    });
  }

  function collectRulesFromDom() {
    if (!popupRulesContainer) return currentRules;
    const cards = popupRulesContainer.querySelectorAll('.rule-card');
    const rules = [];
    cards.forEach((card, idx) => {
      const id = card.dataset.id || `rule_${Date.now()}_${idx}`;
      const name = card.querySelector('.rule-name-input')?.value.trim() || `Rule ${idx + 1}`;
      const keywords = card.querySelector('.rule-keywords-input')?.value.trim() || '';
      const template = card.querySelector('.rule-template-input')?.value.trim() || '';
      rules.push({ id, name, keywords, template });
    });
    return rules;
  }

  function renderLogs(history) {
    if (!logsList || !logsCount) return;
    if (!history || history.length === 0) {
      logsCount.textContent = '0 sent recently';
      logsList.innerHTML = '<div class="empty-state">No messages sent yet. Newly accepted connections will appear here.</div>';
      return;
    }

    logsCount.textContent = `${history.length} recorded`;
    logsList.innerHTML = '';

    history.slice(0, 50).forEach(item => {
      const row = document.createElement('div');
      row.className = 'log-item';

      const timeStr = item.sentAt ? new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const isSent = item.status === 'sent';
      const ruleText = item.ruleMatched ? ` • ${escapeHtml(item.ruleMatched)}` : '';

      row.innerHTML = `
        <div style="overflow: hidden; max-width: 220px;">
          <a href="${item.profileUrl || '#'}" target="_blank" class="log-name">${escapeHtml(item.name || 'Member')}</a>
          <div class="log-time">${timeStr}${ruleText}</div>
        </div>
        <span class="log-badge ${isSent ? 'sent' : 'skipped'}">${isSent ? 'Sent' : 'Skipped'}</span>
      `;
      logsList.appendChild(row);
    });
  }

  // --- 1. ATTACH ALL EVENT LISTENERS IMMEDIATELY (SYNCHRONOUS) ---

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = btn.dataset.tab;

      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(`pane-${tabName}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Dynamic tags insertion
  tagButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tag = btn.dataset.insert;
      const start = templateInput.selectionStart ?? templateInput.value.length;
      const end = templateInput.selectionEnd ?? templateInput.value.length;
      const text = templateInput.value;

      templateInput.value = text.substring(0, start) + tag + text.substring(end);
      templateInput.focus();
      templateInput.selectionStart = templateInput.selectionEnd = start + tag.length;
      updatePreview();
    });
  });

  if (templateInput) {
    templateInput.addEventListener('input', updatePreview);
  }

  // Master switch toggle
  if (masterToggle) {
    masterToggle.addEventListener('change', async () => {
      try {
        const { settings = {} } = await chrome.storage.local.get('settings');
        const updated = { ...DEFAULT_SETTINGS, ...settings, enabled: masterToggle.checked };
        await chrome.storage.local.set({ settings: updated });
        showToast(masterToggle.checked ? 'Automation enabled' : 'Automation paused');
        await syncStateFromStorage();
      } catch (err) {
        console.error('Error updating master switch:', err);
      }
    });
  }

  // Add Rule button
  if (btnAddRule) {
    btnAddRule.addEventListener('click', (e) => {
      e.preventDefault();
      const current = collectRulesFromDom();
      current.push({
        id: `rule_${Date.now()}`,
        name: `Target Rule ${current.length + 1}`,
        keywords: "",
        template: "Hi {firstName}, thanks for connecting!"
      });
      currentRules = current;
      renderRules(currentRules);
      const lastCard = popupRulesContainer?.lastElementChild;
      lastCard?.querySelector('.rule-keywords-input')?.focus();
    });
  }

  // Auto-Generate Variations button
  if (btnAutoGenVariants) {
    btnAutoGenVariants.addEventListener('click', (e) => {
      e.preventDefault();
      const base = (templateInput?.value || '').trim() || defaultVariants[0] || '';
      defaultVariants = generateContextPreservingVariants(base);
      currentDefaultVariantIndex = 0;
      renderDefaultVariantTabs();
      showToast('✨ 4 Safe Whole-Message Variations Ready!');
    });
  }

  // Delete Active Variant button
  if (btnDeleteActiveVariant) {
    btnDeleteActiveVariant.addEventListener('click', (e) => {
      e.preventDefault();
      if (defaultVariants.length <= 1) {
        showToast('At least one variation required');
        return;
      }
      defaultVariants.splice(currentDefaultVariantIndex, 1);
      currentDefaultVariantIndex = Math.max(0, currentDefaultVariantIndex - 1);
      renderDefaultVariantTabs();
      showToast('Variation removed');
    });
  }

  // Shuffle Preview button
  if (btnShufflePreview) {
    btnShufflePreview.addEventListener('click', (e) => {
      e.preventDefault();
      previewVariantIndex = (previewVariantIndex + 1) % Math.max(1, defaultVariants.length);
      updatePreview();
      showToast(`Previewing Variant ${previewVariantIndex + 1}/${defaultVariants.length}`);
    });
  }

  // Quick Clear Sent History button
  if (btnClearHistoryQuick) {
    btnClearHistoryQuick.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm("Clear your sent message history?\n\nThis will allow the extension to send welcome messages to previously messaged/skipped connections.")) {
        return;
      }
      try {
        await chrome.storage.local.set({ sentHistory: [] });
        showToast("Sent history cleared! Connections can now be messaged again.");
        await syncStateFromStorage();
      } catch (err) {
        console.error('Failed to clear history:', err);
      }
    });
  }

  // Save Template button
  if (btnSaveTemplate) {
    btnSaveTemplate.addEventListener('click', async (e) => {
      e.preventDefault();
      if (templateInput) {
        defaultVariants[currentDefaultVariantIndex] = templateInput.value.trim();
      }
      const cleaned = defaultVariants.map(v => v.trim()).filter(Boolean);
      const template = cleaned.length > 0 ? cleaned.join('\n\n---OR---\n\n') : DEFAULT_SETTINGS.template;
      const rules = collectRulesFromDom();

      // Validate rules
      for (const r of rules) {
        if (!r.keywords && !r.template) continue;
        if (r.keywords && !r.template) {
          showToast(`Please enter a message for rule: ${r.name}`);
          return;
        }
        if (!r.keywords && r.template) {
          showToast(`Please enter keywords for rule: ${r.name}`);
          return;
        }
      }

      try {
        const { settings = {} } = await chrome.storage.local.get('settings');
        const updated = { ...DEFAULT_SETTINGS, ...settings, template, rules };
        await chrome.storage.local.set({ settings: updated });
        currentRules = rules;
        showToast('All message variations & rules saved!');
      } catch (err) {
        showToast('Error saving templates');
      }
    });
  }

  // Reset Today's Count button
  if (btnResetToday) {
    btnResetToday.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const today = getTodayString();
        const data = await chrome.storage.local.get(['stats', 'settings']);
        const stats = { ...(data.stats || {}), todayCount: 0, lastResetDate: today };
        await chrome.storage.local.set({ stats });

        // Immediate UI update
        const limit = Number(data.settings?.dailyLimit) || 15;
        const isUnlimited = isNaN(limit) || limit <= 0;
        if (quotaBadge) quotaBadge.textContent = isUnlimited ? 'Today: 0 (Unlimited)' : `Today: 0 / ${limit}`;
        if (quotaProgressFill) quotaProgressFill.style.width = '0%';
        if (statusText) statusText.textContent = 'Ready';

        try { chrome.action.setBadgeText({ text: '' }); } catch (e) {}
        try { chrome.runtime.sendMessage({ action: 'RESET_TODAY_COUNT' }); } catch (e) {}

        showToast("Today's message count reset to 0!");
      } catch (err) {
        console.error('Failed to reset count:', err);
        showToast("Failed to reset count");
      }
    });
  }

  // Resilient LinkedIn Tab Launcher
  async function launchLinkedInTask(taskType) {
    const isScan = taskType === 'scan';
    const targetPath = isScan ? '/mynetwork/invite-connect/connections' : '/mynetwork/invitation-manager/sent';
    const targetUrl = isScan 
      ? 'https://www.linkedin.com/mynetwork/invite-connect/connections/?law_auto=1'
      : 'https://www.linkedin.com/mynetwork/invitation-manager/sent/?law_withdraw=1';
    const actionName = isScan ? 'START_DOM_SCAN' : 'START_WITHDRAW_INVITES';
    const actionPayload = isScan ? { action: actionName } : { action: actionName, minAgeMonths: 6 };

    const allTabs = await chrome.tabs.query({});
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentActiveTab = activeTabs && activeTabs.length > 0 ? activeTabs[0] : null;

    let targetTab = null;

    // 1. If currently viewing a LinkedIn tab, prioritize it
    if (currentActiveTab && currentActiveTab.url && currentActiveTab.url.includes('linkedin.com')) {
      targetTab = currentActiveTab;
    } else {
      // 2. Look for tab matching target path
      targetTab = allTabs.find(t => t.url && t.url.includes(targetPath));
      if (!targetTab) {
        // 3. Look for any LinkedIn tab
        targetTab = allTabs.find(t => t.url && t.url.includes('linkedin.com'));
      }
    }

    // If no LinkedIn tab exists, open one with auto-start query parameter
    if (!targetTab) {
      await chrome.tabs.create({ url: targetUrl, active: true });
      return;
    }

    // Bring tab into focus
    await chrome.tabs.update(targetTab.id, { active: true });

    // If tab is on another LinkedIn page, navigate directly with auto-start query parameter
    if (!targetTab.url || !targetTab.url.includes(targetPath)) {
      await chrome.tabs.update(targetTab.id, { url: targetUrl });
      return;
    }

    // Tab is on target page. Test if content script is active
    let isConnected = false;
    try {
      const ping = await chrome.tabs.sendMessage(targetTab.id, { action: 'CHECK_IS_RUNNING' });
      if (ping) isConnected = true;
    } catch (e) {
      isConnected = false;
    }

    // If content script was invalidated by extension reload, dynamically re-inject
    if (!isConnected && chrome.scripting) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          files: ['content/content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId: targetTab.id },
          files: ['content/content.css']
        });
        await new Promise(r => setTimeout(r, 700));
        isConnected = true;
      } catch (injectErr) {
        console.warn('[LAW] Script injection failed, falling back to URL navigation:', injectErr);
      }
    }

    // If connected, dispatch action
    if (isConnected) {
      try {
        const res = await chrome.tabs.sendMessage(targetTab.id, actionPayload);
        if (res && (res.started || res.success || res.alreadyRunning)) {
          return;
        }
      } catch (e) {
        console.warn('[LAW] Direct message failed, navigating tab:', e);
      }
    }

    // Final fallback: reload/navigate with auto-trigger URL
    await chrome.tabs.update(targetTab.id, { url: targetUrl });
  }

  // Stop All Automation
  async function stopAllAutomation() {
    showToast('Stopping automation...');
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && tab.url.includes('linkedin.com')) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'STOP_DOM_SCAN' });
          } catch (e) {}
        }
      }
      await chrome.storage.local.set({
        runtimeState: {
          isProcessing: false,
          currentStatus: 'Stopped by user',
          progressText: '',
          countdown: 0,
          lastRunTime: new Date().toISOString()
        }
      });
      await syncStateFromStorage();
    } catch (err) {
      console.error('[LAW] Error stopping automation:', err);
    }
  }

  // Withdraw old invites button
  if (btnWithdrawInvites) {
    btnWithdrawInvites.addEventListener('click', async (e) => {
      e.preventDefault();
      showToast('Opening Sent Invitations to withdraw invites >6m...');
      try {
        await launchLinkedInTask('withdraw');
      } catch (err) {
        console.error('Failed to trigger withdraw:', err);
        showToast('Error opening Sent Invitations');
      }
    });
  }

  // Save Settings button
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async (e) => {
      e.preventDefault();
      const rawDaily = parseInt(settingDailyLimit.value, 10);
      const dailyLimit = isNaN(rawDaily) || rawDaily <= 0 ? 0 : rawDaily;
      const minDelay = parseInt(settingMinDelay.value, 10) || 25;
      const maxDelay = parseInt(settingMaxDelay.value, 10) || 45;
      const skipExistingChats = settingSkipExisting.checked;
      const autoScanInterval = parseInt(settingScanInterval.value, 10) || 60;
      const webhookUrl = settingWebhookUrl ? settingWebhookUrl.value.trim() : '';
      const followUpEnabled = settingFollowupEnabled ? settingFollowupEnabled.checked : false;
      const followUpDays = parseInt(settingFollowupDays?.value, 10) || 4;

      if (minDelay >= maxDelay) {
        showToast('Min delay must be less than Max delay');
        return;
      }

      try {
        const { settings = {} } = await chrome.storage.local.get('settings');
        const updated = {
          ...DEFAULT_SETTINGS,
          ...settings,
          dailyLimit,
          minDelay,
          maxDelay,
          skipExistingChats,
          autoScanInterval,
          webhookUrl,
          followUpEnabled,
          followUpDays
        };
        await chrome.storage.local.set({ settings: updated });
        showToast('Settings saved successfully!');
        await syncStateFromStorage();
      } catch (err) {
        showToast('Error saving settings');
      }
    });
  }

  // Trigger scan button
  if (btnTriggerScan) {
    btnTriggerScan.addEventListener('click', async (e) => {
      e.preventDefault();
      btnTriggerScan.classList.add('hidden');
      if (btnStop) btnStop.classList.remove('hidden');
      if (statusText) statusText.textContent = 'Connecting to LinkedIn...';
      if (statusDot) statusDot.className = 'status-dot busy';

      showToast('Opening LinkedIn Connections...');

      try {
        await launchLinkedInTask('scan');
      } catch (err) {
        console.error('Failed to trigger scan:', err);
        showToast('Failed to connect to LinkedIn tab');
        if (btnTriggerScan) btnTriggerScan.classList.remove('hidden');
        if (btnStop) btnStop.classList.add('hidden');
      }
    });
  }

  // Stop button
  if (btnStop) {
    btnStop.addEventListener('click', async (e) => {
      e.preventDefault();
      await stopAllAutomation();
    });
  }

  // Clear logs button
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', async (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to clear your message activity history?')) {
        await chrome.storage.local.set({ sentHistory: [] });
        showToast('Activity log cleared');
        await syncStateFromStorage();
      }
    });
  }

  // Open Full Dashboard button
  if (btnOpenFullDashboard) {
    btnOpenFullDashboard.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    });
  }

  // --- 2. ASYNC STORAGE SYNC (DIRECT FROM CHROME.STORAGE.LOCAL) ---
  async function syncStateFromStorage() {
    try {
      const data = await chrome.storage.local.get([
        'settings',
        'stats',
        'sentHistory',
        'runtimeState'
      ]);

      const today = getTodayString();
      const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      let stats = data.stats || { todayCount: 0, lastResetDate: today, totalSent: 0 };

      if (stats.lastResetDate !== today) {
        stats.todayCount = 0;
        stats.lastResetDate = today;
        await chrome.storage.local.set({ stats });
      }

      const sentHistory = data.sentHistory || [];
      const runtimeState = data.runtimeState || {
        isProcessing: false,
        currentStatus: 'Ready',
        lastRunTime: null
      };

      // Master switch
      if (masterToggle) masterToggle.checked = Boolean(settings.enabled);

      // Status Indicator & Quota
      const todayCount = stats.todayCount || 0;
      const limit = Number(settings.dailyLimit);
      const isUnlimited = isNaN(limit) || limit <= 0;

      if (statusDot && statusText) {
        if (!settings.enabled) {
          statusDot.className = 'status-dot paused';
          statusText.textContent = 'Paused (Disabled)';
        } else if (runtimeState.isProcessing) {
          statusDot.className = 'status-dot busy';
          statusText.textContent = runtimeState.currentStatus || 'Processing...';
          if (btnTriggerScan) btnTriggerScan.classList.add('hidden');
          if (btnStop) btnStop.classList.remove('hidden');
        } else {
          statusDot.className = 'status-dot';
          const lastStatus = runtimeState.currentStatus;
          if (!isUnlimited && todayCount >= limit) {
            statusText.textContent = 'Daily limit reached';
          } else if (lastStatus && !lastStatus.toLowerCase().includes('stopped') && !lastStatus.toLowerCase().includes('processing') && !lastStatus.toLowerCase().includes('connecting')) {
            statusText.textContent = lastStatus;
          } else {
            statusText.textContent = 'Ready';
          }
          if (btnTriggerScan) btnTriggerScan.classList.remove('hidden');
          if (btnStop) btnStop.classList.add('hidden');
        }
      }

      // Quota Counter & Fill
      if (quotaBadge) {
        quotaBadge.textContent = isUnlimited ? `Today: ${todayCount} (Unlimited)` : `Today: ${todayCount} / ${limit}`;
      }
      if (quotaProgressFill) {
        const pct = isUnlimited ? 100 : Math.min(100, Math.round((todayCount / limit) * 100));
        quotaProgressFill.style.width = `${pct}%`;
      }

      // Template & Variants rendering
      const isEditingTemplate = templateInput && document.activeElement === templateInput;
      if (!isEditingTemplate) {
        defaultVariants = parseVariants(settings.template || DEFAULT_SETTINGS.template);
        if (currentDefaultVariantIndex >= defaultVariants.length) {
          currentDefaultVariantIndex = 0;
        }
        renderDefaultVariantTabs();
      }

      // Rules rendering
      const isEditingRules = popupRulesContainer && popupRulesContainer.contains(document.activeElement);
      if (!isEditingRules) {
        let loadedRules = Array.isArray(settings.rules) ? settings.rules : DEFAULT_SETTINGS.rules;
        loadedRules = loadedRules.map(r => {
          if (r.id === 'rule_realtors' && (!r.template || r.template.includes('How is the market treating you recently in your area?'))) {
            return { ...r, template: DEFAULT_REALTOR_VARIANTS.join("\n\n---OR---\n\n") };
          }
          return r;
        });
        currentRules = loadedRules;
        renderRules(currentRules);
      }

      if (settingDailyLimit && document.activeElement !== settingDailyLimit) {
        settingDailyLimit.value = isUnlimited ? 0 : limit;
      }
      if (settingMinDelay && document.activeElement !== settingMinDelay) {
        settingMinDelay.value = settings.minDelay || 25;
      }
      if (settingMaxDelay && document.activeElement !== settingMaxDelay) {
        settingMaxDelay.value = settings.maxDelay || 45;
      }
      if (settingSkipExisting) {
        settingSkipExisting.checked = settings.skipExistingChats !== false;
      }
      if (settingScanInterval) {
        settingScanInterval.value = String(settings.autoScanInterval || 60);
      }
      if (settingWebhookUrl && document.activeElement !== settingWebhookUrl) {
        settingWebhookUrl.value = settings.webhookUrl || '';
      }
      if (settingFollowupEnabled) {
        settingFollowupEnabled.checked = Boolean(settings.followUpEnabled);
      }
      if (settingFollowupDays && document.activeElement !== settingFollowupDays) {
        settingFollowupDays.value = settings.followUpDays || 4;
      }

      // Render Logs
      renderLogs(sentHistory);

    } catch (err) {
      console.error('Error syncing popup state:', err);
    }
  }

  // Load storage immediately
  syncStateFromStorage();

  // Storage listener for live reactivity
  chrome.storage.onChanged.addListener(() => {
    syncStateFromStorage();
  });
}

// Run immediately if DOM already loaded, or on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}
