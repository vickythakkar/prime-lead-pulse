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
  "Hi {firstName}, thanks for connecting! Always great to link up with fellow real estate professionals. How is the market treating you recently in your area?",
  "{timeOfDay} {firstName}, glad to connect with you! Great to see your work in real estate at {company}. How have buyer and seller trends been for you lately?",
  "Hey {firstName}, appreciate the connection! Always looking to network with active agents and brokers. How is inventory and activity looking on your side this {dayOfWeek}?",
  "Hello {firstName}, thanks for accepting my request! Always glad to have top real estate pros in my circle. Hope you're having a productive week—how's business treating you?"
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
  const text = (baseText || '').trim();
  const isRealtor = /realtor|real estate|broker|realty|mortgage/i.test(text);

  if (isRealtor) {
    return DEFAULT_REALTOR_VARIANTS.slice();
  }

  const usesCompany = /\{company\}/i.test(text);
  const companyPhrase = usesCompany ? " at {company}" : "";

  return [
    `Hi {firstName}, thanks for connecting! Looking forward to staying in touch and seeing what you're working on. Hope you have a wonderful {dayOfWeek}!`,
    `{timeOfDay} {firstName}, glad to link up with you here on LinkedIn! Excited to follow your journey${companyPhrase}. Wishing you a productive week ahead.`,
    `Hello {firstName}, appreciate the connection! Always looking to expand my network with fellow professionals. Hope business is going great on your end this {dayOfWeek}!`,
    `Hey {firstName}, great connecting with you! Looking forward to keeping in touch and following your updates. Have a fantastic rest of your {dayOfWeek}!`
  ];
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
          const isRealtor = /realtor|real estate|broker/i.test((kwInput?.value || '') + ' ' + (textarea.value || ''));
          const variants = isRealtor ? DEFAULT_REALTOR_VARIANTS : generateContextPreservingVariants(textarea.value);
          textarea.value = variants.join('\n\n---OR---\n\n');
          showToast('✨ Added safe whole-message variants!');
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

  // Withdraw old invites button
  if (btnWithdrawInvites) {
    btnWithdrawInvites.addEventListener('click', async (e) => {
      e.preventDefault();
      showToast('Opening Sent Invitations to withdraw invites >6m...');
      try {
        await chrome.runtime.sendMessage({ action: 'START_WITHDRAW_INVITES', minAgeMonths: 6 });
      } catch (err) {
        chrome.tabs.create({ url: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/' });
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
      if (statusText) statusText.textContent = 'Opening connections...';
      if (statusDot) statusDot.className = 'status-dot busy';

      showToast('Opening LinkedIn Connections...');

      try {
        // Query or create LinkedIn tab
        const tabs = await chrome.tabs.query({ url: 'https://*.linkedin.com/mynetwork/invite-connect/connections/*' });
        let targetTabId;

        if (tabs && tabs.length > 0) {
          targetTabId = tabs[0].id;
          await chrome.tabs.update(targetTabId, { active: true });
        } else {
          const newTab = await chrome.tabs.create({
            url: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
            active: true
          });
          targetTabId = newTab.id;
        }

        // Send start scan message to tab
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(targetTabId, { action: 'START_DOM_SCAN' });
          } catch (err) {
            console.log('Tab still initializing content script');
          }
        }, 2500);

      } catch (err) {
        console.error('Failed to trigger scan:', err);
        showToast('Failed to open LinkedIn tab');
        if (btnTriggerScan) btnTriggerScan.classList.remove('hidden');
        if (btnStop) btnStop.classList.add('hidden');
      }
    });
  }

  // Stop button
  if (btnStop) {
    btnStop.addEventListener('click', async (e) => {
      e.preventDefault();
      showToast('Stopping automation...');
      try {
        const tabs = await chrome.tabs.query({ url: 'https://*.linkedin.com/*' });
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'STOP_DOM_SCAN' });
          } catch (e) {}
        }
        await chrome.storage.local.set({
          runtimeState: {
            isProcessing: false,
            currentStatus: 'Stopped by user',
            lastRunTime: new Date().toISOString()
          }
        });
        await syncStateFromStorage();
      } catch (err) {
        console.error('Error stopping:', err);
      }
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
          statusText.textContent = (!isUnlimited && todayCount >= limit) ? 'Daily limit reached' : 'Ready';
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
        currentRules = Array.isArray(settings.rules) ? settings.rules : DEFAULT_SETTINGS.rules;
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
