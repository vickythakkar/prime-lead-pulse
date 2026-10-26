/**
 * LinkedIn Auto Welcome & Responder - Full Dashboard Logic
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
  autoScanInterval: 60,
  webhookUrl: "",
  followUpEnabled: false,
  followUpDays: 4,
  followUpTemplate: "Hi {firstName}, following up on my previous note. Hope you're having a productive week!",
  withdrawAgeDays: 30
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
      text, // Variant 1: The user's exact original text!
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

function initDashboard() {
  // Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.content-section');
  const pageTitle = document.getElementById('page-title');

  // Stats Elements
  const statToday = document.getElementById('stat-today');
  const statTodaySub = document.getElementById('stat-today-sub');
  const btnDashResetToday = document.getElementById('btn-dash-reset-today');
  const btnDashClearHistoryQuick = document.getElementById('btn-dash-clear-history-quick');
  const statTotal = document.getElementById('stat-total');
  const statStatus = document.getElementById('stat-status');
  const statLastRun = document.getElementById('stat-last-run');

  // Master Switch & Actions
  const dashMasterToggle = document.getElementById('dash-master-toggle');
  const btnDashScan = document.getElementById('btn-dash-scan');
  const btnDashStop = document.getElementById('btn-dash-stop');
  const btnDashWithdrawInvites = document.getElementById('btn-dash-withdraw-invites');
  const dashQuickWithdrawAge = document.getElementById('dash-quick-withdraw-age');
  const btnGotoLogs = document.getElementById('btn-goto-logs');

  // Template Form
  const dashTemplateInput = document.getElementById('dash-template-input');
  const dashTemplatePreview = document.getElementById('dash-template-preview');
  const dashDefaultVariantTabs = document.getElementById('dash-default-variant-tabs');
  const btnDashAutoGenVariants = document.getElementById('btn-dash-auto-gen-variants');
  const btnDashDeleteActiveVariant = document.getElementById('btn-dash-delete-active-variant');
  const btnDashShufflePreview = document.getElementById('btn-dash-shuffle-preview');
  const btnDashSaveTemplate = document.getElementById('btn-dash-save-template');
  const tagPills = document.querySelectorAll('.tag-pill:not(.dash-rule-tag-pill):not([data-insert-followup])');
  const dashRulesContainer = document.getElementById('dash-rules-container');
  const btnDashAddRule = document.getElementById('btn-dash-add-rule');
  let currentDashRules = [];

  let dashDefaultVariants = DEFAULT_WELCOME_VARIANTS.slice();
  let currentDashVariantIndex = 0;
  let previewDashVariantIndex = 0;

  // Safety & Integrations Form
  const dashSettingDaily = document.getElementById('dash-setting-daily');
  const dashSettingMinDelay = document.getElementById('dash-setting-min-delay');
  const dashSettingMaxDelay = document.getElementById('dash-setting-max-delay');
  const dashSettingSkipExisting = document.getElementById('dash-setting-skip-existing');
  const dashSettingInterval = document.getElementById('dash-setting-interval');
  const dashSettingWebhook = document.getElementById('dash-setting-webhook');
  const dashFollowupToggle = document.getElementById('dash-followup-toggle');
  const dashSettingFollowupDays = document.getElementById('dash-setting-followup-days');
  const dashFollowupTemplateInput = document.getElementById('dash-followup-template-input');
  const followupTagPills = document.querySelectorAll('[data-insert-followup]');
  const btnDashSaveSettings = document.getElementById('btn-dash-save-settings');

  // Tables & Logs
  const overviewTableBody = document.getElementById('overview-table-body');
  const logsTableBody = document.getElementById('logs-table-body');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnDashClearLogs = document.getElementById('btn-dash-clear-logs');
  const toast = document.getElementById('dash-toast');

  let currentHistoryData = [];
  let toastTimeout = null;

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }

  function renderDashDefaultVariantTabs() {
    if (!dashDefaultVariantTabs || !dashTemplateInput) return;
    dashDefaultVariantTabs.innerHTML = '';

    if (dashDefaultVariants.length === 0) {
      dashDefaultVariants = DEFAULT_WELCOME_VARIANTS.slice();
    }

    dashDefaultVariants.forEach((v, idx) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `variant-tab-pill ${idx === currentDashVariantIndex ? 'active' : ''}`;
      pill.textContent = `Variant ${idx + 1}`;
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        dashDefaultVariants[currentDashVariantIndex] = dashTemplateInput.value;
        currentDashVariantIndex = idx;
        renderDashDefaultVariantTabs();
      });
      dashDefaultVariantTabs.appendChild(pill);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'variant-tab-add';
    addBtn.textContent = '+ Add Variant';
    addBtn.title = 'Add another whole-message variation';
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      dashDefaultVariants[currentDashVariantIndex] = dashTemplateInput.value;
      const suggestions = generateContextPreservingVariants(dashTemplateInput.value);
      const newVar = suggestions[dashDefaultVariants.length % suggestions.length] || "Hi {firstName}, thanks for connecting! Looking forward to staying in touch.";
      dashDefaultVariants.push(newVar);
      currentDashVariantIndex = dashDefaultVariants.length - 1;
      renderDashDefaultVariantTabs();
      showToast(`Added Variant ${dashDefaultVariants.length}`);
    });
    dashDefaultVariantTabs.appendChild(addBtn);

    dashTemplateInput.value = dashDefaultVariants[currentDashVariantIndex] || '';
    if (btnDashDeleteActiveVariant) {
      btnDashDeleteActiveVariant.style.display = dashDefaultVariants.length > 1 ? 'inline-block' : 'none';
    }
    updatePreview();
  }

  function updatePreview() {
    if (!dashTemplatePreview) return;
    if (dashTemplateInput) {
      dashDefaultVariants[currentDashVariantIndex] = dashTemplateInput.value;
    }
    const targetVariant = dashDefaultVariants[previewDashVariantIndex % Math.max(1, dashDefaultVariants.length)] || dashTemplateInput?.value || '';
    const sample = targetVariant
      .replace(/\{firstName\}/gi, 'Sarah')
      .replace(/\{fullName\}/gi, 'Sarah Jenkins')
      .replace(/\{company\}/gi, 'Apex Realty')
      .replace(/\{location\}/gi, 'Dubai, UAE')
      .replace(/\{timeOfDay\}/gi, 'afternoon')
      .replace(/\{dayOfWeek\}/gi, 'Wednesday')
      .replace(/\{headline\}/gi, 'Realtor at Apex Realty');
    dashTemplatePreview.textContent = sample || '(Empty message)';
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

  function formatDate(isoStr) {
    if (!isoStr) return '--';
    const d = new Date(isoStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function renderDashRules(rules) {
    if (!dashRulesContainer) return;
    dashRulesContainer.innerHTML = '';

    if (!rules || rules.length === 0) {
      dashRulesContainer.innerHTML = '<div class="empty-cell text-center" style="padding: 24px;">No keyword rules configured. Click "+ Add Keyword Rule" above to create targeted messages for realtors, executives, Dubai investors, etc.</div>';
      return;
    }

    rules.forEach((rule, idx) => {
      const card = document.createElement('div');
      card.className = 'dash-rule-card';
      card.dataset.id = rule.id || `rule_${idx}`;

      card.innerHTML = `
        <div class="dash-rule-header">
          <input type="text" class="dash-rule-name-input" placeholder="Rule Name (e.g. Dubai Investors, US Realtors)" value="${escapeHtml(rule.name || '')}">
          <button type="button" class="dash-rule-delete-btn" data-delete-idx="${idx}" title="Delete Rule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete Rule
          </button>
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Match Keywords (headline, bio, or location):</label>
          <input type="text" class="dash-rule-keywords-input" placeholder="e.g. dubai, uae, realtor, broker, USA" value="${escapeHtml(rule.keywords || '')}">
        </div>
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
            <label style="font-size: 12px; font-weight: 600; color: #475569;">Targeted Message Template:</label>
            <div class="tags-group" style="display: flex; flex-wrap: wrap; gap: 4px;">
              <button type="button" class="tag-pill dash-rule-tag-pill" data-tag="{firstName}">+ {firstName}</button>
              <button type="button" class="tag-pill dash-rule-tag-pill" data-tag="{fullName}">+ {fullName}</button>
              <button type="button" class="tag-pill dash-rule-tag-pill" data-tag="{company}">+ {company}</button>
              <button type="button" class="tag-pill dash-rule-tag-pill" data-tag="{location}">+ {location}</button>
              <button type="button" class="tag-pill dash-rule-tag-pill" data-tag="{timeOfDay}">+ {timeOfDay}</button>
              <button type="button" class="tag-pill dash-rule-tag-pill" data-tag="{dayOfWeek}">+ {dayOfWeek}</button>
              <button type="button" class="tag-pill dash-rule-tag-pill" data-tag="{headline}">+ {headline}</button>
            </div>
          </div>
          <textarea class="code-textarea dash-rule-template-input" rows="3" placeholder="Message to send when keywords match...">${escapeHtml(rule.template || '')}</textarea>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
            <p style="font-size: 11px; color: #64748b; margin: 0;">Separate full alternative variants with <code>---OR---</code>.</p>
            <button type="button" class="btn-generate-variants dash-rule-gen-btn" data-rule-idx="${idx}">✨ Auto-Add 3 Safe Variants</button>
          </div>
        </div>
      `;

      dashRulesContainer.appendChild(card);
    });

    // Rule tag buttons
    dashRulesContainer.querySelectorAll('.dash-rule-tag-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        const tag = pill.dataset.tag;
        const card = pill.closest('.dash-rule-card');
        const textarea = card?.querySelector('.dash-rule-template-input');
        if (textarea) {
          const start = textarea.selectionStart ?? textarea.value.length;
          const end = textarea.selectionEnd ?? textarea.value.length;
          textarea.value = textarea.value.substring(0, start) + tag + textarea.value.substring(end);
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start + tag.length;
        }
      });
    });

    // Rule Auto-generate buttons
    dashRulesContainer.querySelectorAll('.dash-rule-gen-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const card = btn.closest('.dash-rule-card');
        const textarea = card?.querySelector('.dash-rule-template-input');
        const kwInput = card?.querySelector('.dash-rule-keywords-input');
        if (textarea) {
          const userMsg = textarea.value.trim();
          const variants = generateContextPreservingVariants(userMsg);
          textarea.value = variants.join('\n\n---OR---\n\n');
          showToast('✨ Preserved your message & added 3 safe variations!');
        }
      });
    });

    // Delete buttons
    dashRulesContainer.querySelectorAll('.dash-rule-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const delIdx = parseInt(btn.dataset.deleteIdx, 10);
        const current = collectDashRulesFromDom();
        current.splice(delIdx, 1);
        currentDashRules = current;
        renderDashRules(currentDashRules);
      });
    });
  }

  function collectDashRulesFromDom() {
    if (!dashRulesContainer) return currentDashRules;
    const cards = dashRulesContainer.querySelectorAll('.dash-rule-card');
    const rules = [];
    cards.forEach((card, idx) => {
      const id = card.dataset.id || `rule_${Date.now()}_${idx}`;
      const name = card.querySelector('.dash-rule-name-input')?.value.trim() || `Rule ${idx + 1}`;
      const keywords = card.querySelector('.dash-rule-keywords-input')?.value.trim() || '';
      const template = card.querySelector('.dash-rule-template-input')?.value.trim() || '';
      rules.push({ id, name, keywords, template });
    });
    return rules;
  }

  function renderTables(history) {
    currentHistoryData = history || [];

    if (!history || history.length === 0) {
      if (overviewTableBody) overviewTableBody.innerHTML = '<tr><td colspan="5" class="text-center empty-cell">No messages sent yet. Newly accepted connections will appear here.</td></tr>';
      if (logsTableBody) logsTableBody.innerHTML = '<tr><td colspan="6" class="text-center empty-cell">No history found.</td></tr>';
      return;
    }

    // Top 5 on Overview
    if (overviewTableBody) {
      overviewTableBody.innerHTML = '';
      history.slice(0, 5).forEach(item => {
        const tr = document.createElement('tr');
        const isSent = item.status === 'sent';
        const ruleName = item.ruleMatched || 'Default';
        const isRule = ruleName !== 'Default' && ruleName !== 'Skipped';

        tr.innerHTML = `
          <td><strong>${escapeHtml(item.name || 'Member')}</strong></td>
          <td>${formatDate(item.sentAt)}</td>
          <td style="max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.message)}">${escapeHtml(item.message)}</td>
          <td><span class="badge ${isRule ? 'rule-pill' : 'default-pill'}">${escapeHtml(ruleName)}</span></td>
          <td><span class="badge ${isSent ? 'sent' : 'skipped'}">${isSent ? 'Sent' : 'Skipped'}</span></td>
        `;
        overviewTableBody.appendChild(tr);
      });
    }

    // Complete Table on Logs
    if (logsTableBody) {
      logsTableBody.innerHTML = '';
      history.forEach(item => {
        const tr = document.createElement('tr');
        const isSent = item.status === 'sent';
        const ruleName = item.ruleMatched || 'Default';
        const isRule = ruleName !== 'Default' && ruleName !== 'Skipped';

        tr.innerHTML = `
          <td><strong>${escapeHtml(item.name || 'Member')}</strong></td>
          <td>${formatDate(item.sentAt)}</td>
          <td style="max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.message)}">${escapeHtml(item.message)}</td>
          <td><span class="badge ${isRule ? 'rule-pill' : 'default-pill'}">${escapeHtml(ruleName)}</span></td>
          <td><span class="badge ${isSent ? 'sent' : 'skipped'}">${isSent ? 'Sent' : 'Skipped'}</span></td>
          <td><a href="${item.profileUrl || '#'}" target="_blank" style="color: #0a66c2; font-weight: 500;">View Profile ↗</a></td>
        `;
        logsTableBody.appendChild(tr);
      });
    }
  }

  // --- 1. ATTACH ALL EVENT LISTENERS IMMEDIATELY ---

  // Navigation tabs
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = item.dataset.tab;

      navItems.forEach(i => i.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      item.classList.add('active');
      const targetSection = document.getElementById(`section-${targetTab}`);
      if (targetSection) targetSection.classList.add('active');

      const titles = {
        overview: 'Overview & Status',
        template: 'Message Template Editor',
        safety: 'Safety & Automation Settings',
        logs: 'Sent Messages History'
      };
      if (pageTitle) pageTitle.textContent = titles[targetTab] || 'Dashboard';
    });
  });

  if (btnGotoLogs) {
    btnGotoLogs.addEventListener('click', (e) => {
      e.preventDefault();
      const logsNavItem = document.querySelector('.nav-item[data-tab="logs"]');
      if (logsNavItem) logsNavItem.click();
    });
  }

  // Dynamic tags
  tagPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      const tag = pill.dataset.insert;
      const start = dashTemplateInput.selectionStart ?? dashTemplateInput.value.length;
      const end = dashTemplateInput.selectionEnd ?? dashTemplateInput.value.length;
      const text = dashTemplateInput.value;

      dashTemplateInput.value = text.substring(0, start) + tag + text.substring(end);
      dashTemplateInput.focus();
      dashTemplateInput.selectionStart = dashTemplateInput.selectionEnd = start + tag.length;
      updatePreview();
    });
  });

  if (dashTemplateInput) {
    dashTemplateInput.addEventListener('input', updatePreview);
  }

  // Master switch
  if (dashMasterToggle) {
    dashMasterToggle.addEventListener('change', async () => {
      try {
        const { settings = {} } = await chrome.storage.local.get('settings');
        const updated = { ...DEFAULT_SETTINGS, ...settings, enabled: dashMasterToggle.checked };
        await chrome.storage.local.set({ settings: updated });
        showToast(dashMasterToggle.checked ? 'Automation enabled' : 'Automation paused');
        await syncDashboard();
      } catch (err) {
        console.error('Error toggling master switch:', err);
      }
    });
  }

  // Add Keyword Rule button
  if (btnDashAddRule) {
    btnDashAddRule.addEventListener('click', (e) => {
      e.preventDefault();
      const current = collectDashRulesFromDom();
      current.push({
        id: `rule_${Date.now()}`,
        name: `Target Rule ${current.length + 1}`,
        keywords: "",
        template: "Hi {firstName}, thanks for connecting!"
      });
      currentDashRules = current;
      renderDashRules(currentDashRules);
      const lastCard = dashRulesContainer?.lastElementChild;
      lastCard?.querySelector('.dash-rule-keywords-input')?.focus();
    });
  }

  // Auto-Generate Variations button
  if (btnDashAutoGenVariants) {
    btnDashAutoGenVariants.addEventListener('click', (e) => {
      e.preventDefault();
      const base = (dashTemplateInput?.value || '').trim() || dashDefaultVariants[0] || '';
      dashDefaultVariants = generateContextPreservingVariants(base);
      currentDashVariantIndex = 0;
      renderDashDefaultVariantTabs();
      showToast('✨ 4 Safe Whole-Message Variations Ready!');
    });
  }

  // Delete Active Variant button
  if (btnDashDeleteActiveVariant) {
    btnDashDeleteActiveVariant.addEventListener('click', (e) => {
      e.preventDefault();
      if (dashDefaultVariants.length <= 1) {
        showToast('At least one variation required');
        return;
      }
      dashDefaultVariants.splice(currentDashVariantIndex, 1);
      currentDashVariantIndex = Math.max(0, currentDashVariantIndex - 1);
      renderDashDefaultVariantTabs();
      showToast('Variation removed');
    });
  }

  // Shuffle Preview button
  if (btnDashShufflePreview) {
    btnDashShufflePreview.addEventListener('click', (e) => {
      e.preventDefault();
      previewDashVariantIndex = (previewDashVariantIndex + 1) % Math.max(1, dashDefaultVariants.length);
      updatePreview();
      showToast(`Previewing Variant ${previewDashVariantIndex + 1}/${dashDefaultVariants.length}`);
    });
  }

  // Quick Clear Sent History button
  if (btnDashClearHistoryQuick) {
    btnDashClearHistoryQuick.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm("Clear your sent message history?\n\nThis will allow the extension to send welcome messages to previously messaged/skipped connections.")) {
        return;
      }
      try {
        await chrome.storage.local.set({ sentHistory: [] });
        showToast("Sent history cleared! Connections can now be messaged again.");
        await syncDashboard();
      } catch (err) {
        console.error('Failed to clear history:', err);
      }
    });
  }

  // Save Template
  if (btnDashSaveTemplate) {
    btnDashSaveTemplate.addEventListener('click', async (e) => {
      e.preventDefault();
      if (dashTemplateInput) {
        dashDefaultVariants[currentDashVariantIndex] = dashTemplateInput.value.trim();
      }
      const cleaned = dashDefaultVariants.map(v => v.trim()).filter(Boolean);
      const template = cleaned.length > 0 ? cleaned.join('\n\n---OR---\n\n') : DEFAULT_SETTINGS.template;
      const rules = collectDashRulesFromDom();

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
        currentDashRules = rules;
        showToast('All message variations & rules saved successfully!');
      } catch (err) {
        showToast('Error saving templates');
      }
    });
  }

  // Reset Today's Count button
  if (btnDashResetToday) {
    btnDashResetToday.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const today = getTodayString();
        const data = await chrome.storage.local.get(['stats', 'settings']);
        const stats = { ...(data.stats || {}), todayCount: 0, lastResetDate: today };
        await chrome.storage.local.set({ stats });

        // Immediate UI update
        if (statToday) statToday.textContent = '0';
        const limit = Number(data.settings?.dailyLimit);
        const isUnlimited = isNaN(limit) || limit <= 0;
        if (statTodaySub) statTodaySub.textContent = isUnlimited ? 'Daily limit: Unlimited' : `Daily limit: ${limit}`;
        if (statStatus) {
          statStatus.textContent = 'Ready';
          statStatus.style.color = '#10b981';
        }

        try { chrome.action.setBadgeText({ text: '' }); } catch (e) {}
        try { chrome.runtime.sendMessage({ action: 'RESET_TODAY_COUNT' }); } catch (e) {}

        showToast("Today's message counter reset to 0");
      } catch (err) {
        console.error('Reset count error:', err);
        showToast("Failed to reset count");
      }
    });
  }

  // Follow-up dynamic tags
  followupTagPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      const tag = pill.dataset.insertFollowup;
      if (!dashFollowupTemplateInput) return;
      const start = dashFollowupTemplateInput.selectionStart ?? dashFollowupTemplateInput.value.length;
      const end = dashFollowupTemplateInput.selectionEnd ?? dashFollowupTemplateInput.value.length;
      const text = dashFollowupTemplateInput.value;

      dashFollowupTemplateInput.value = text.substring(0, start) + tag + text.substring(end);
      dashFollowupTemplateInput.focus();
      dashFollowupTemplateInput.selectionStart = dashFollowupTemplateInput.selectionEnd = start + tag.length;
    });
  });

  // Resilient LinkedIn Tab Launcher
  async function launchLinkedInTask(taskType, minAgeDays = 30) {
    const isScan = taskType === 'scan';
    const targetPath = isScan ? '/mynetwork/invite-connect/connections' : '/mynetwork/invitation-manager/sent';
    const targetUrl = isScan 
      ? 'https://www.linkedin.com/mynetwork/invite-connect/connections/?law_auto=1'
      : `https://www.linkedin.com/mynetwork/invitation-manager/sent/?law_withdraw=1&min_days=${minAgeDays}`;
    const actionName = isScan ? 'START_DOM_SCAN' : 'START_WITHDRAW_INVITES';
    const actionPayload = isScan ? { action: actionName } : { action: actionName, minAgeDays };

    const allTabs = await chrome.tabs.query({});
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentActiveTab = activeTabs && activeTabs.length > 0 ? activeTabs[0] : null;

    let targetTab = null;

    if (currentActiveTab && currentActiveTab.url && currentActiveTab.url.includes('linkedin.com')) {
      targetTab = currentActiveTab;
    } else {
      targetTab = allTabs.find(t => t.url && t.url.includes(targetPath));
      if (!targetTab) {
        targetTab = allTabs.find(t => t.url && t.url.includes('linkedin.com'));
      }
    }

    if (!targetTab) {
      await chrome.tabs.create({ url: targetUrl, active: true });
      return;
    }

    await chrome.tabs.update(targetTab.id, { active: true });

    if (!targetTab.url || !targetTab.url.includes(targetPath)) {
      await chrome.tabs.update(targetTab.id, { url: targetUrl });
      return;
    }

    let isConnected = false;
    try {
      const ping = await chrome.tabs.sendMessage(targetTab.id, { action: 'CHECK_IS_RUNNING' });
      if (ping) isConnected = true;
    } catch (e) {
      isConnected = false;
    }

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
      await syncDashboard();
    } catch (err) {
      console.error('[LAW] Error stopping automation:', err);
    }
  }

  // Withdraw Invites button
  if (btnDashWithdrawInvites) {
    btnDashWithdrawInvites.addEventListener('click', async (e) => {
      e.preventDefault();
      const minDays = dashQuickWithdrawAge ? parseInt(dashQuickWithdrawAge.value, 10) : 30;
      const ageLabel = minDays === 0 ? 'all pending invites' : (minDays >= 30 ? `>${Math.round(minDays / 30)}m` : `>${Math.round(minDays / 7)}w`);
      if (!confirm(`This will open your Sent Invitations page and withdraw pending invites (${ageLabel}). Proceed?`)) {
        return;
      }
      showToast(`Opening Sent Invitations & withdrawing invites (${ageLabel})...`);
      try {
        await launchLinkedInTask('withdraw', minDays);
      } catch (err) {
        console.error('Failed to start invite cleanup:', err);
        showToast('Error opening Sent Invitations');
      }
    });
  }

  // Dash Quick withdraw age change
  if (dashQuickWithdrawAge) {
    dashQuickWithdrawAge.addEventListener('change', async () => {
      const minDays = parseInt(dashQuickWithdrawAge.value, 10);
      try {
        const { settings = {} } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...settings, withdrawAgeDays: minDays } });
        showToast(`Cleanup age set to ${dashQuickWithdrawAge.options[dashQuickWithdrawAge.selectedIndex].text}`);
      } catch (e) {}
    });
  }

  // Save Settings
  if (btnDashSaveSettings) {
    btnDashSaveSettings.addEventListener('click', async (e) => {
      e.preventDefault();
      const rawDaily = parseInt(dashSettingDaily.value, 10);
      const dailyLimit = isNaN(rawDaily) || rawDaily <= 0 ? 0 : rawDaily;
      const minDelay = parseInt(dashSettingMinDelay.value, 10) || 25;
      const maxDelay = parseInt(dashSettingMaxDelay.value, 10) || 45;
      const skipExistingChats = dashSettingSkipExisting.checked;
      const autoScanInterval = parseInt(dashSettingInterval.value, 10) || 60;
      const webhookUrl = dashSettingWebhook ? dashSettingWebhook.value.trim() : '';
      const followUpEnabled = dashFollowupToggle ? dashFollowupToggle.checked : false;
      const followUpDays = parseInt(dashSettingFollowupDays?.value, 10) || 4;
      const followUpTemplate = dashFollowupTemplateInput ? dashFollowupTemplateInput.value.trim() : '';

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
          followUpDays,
          followUpTemplate
        };
        await chrome.storage.local.set({ settings: updated });
        showToast('Safety settings & Integrations saved successfully!');
        await syncDashboard();
      } catch (err) {
        showToast('Error saving settings');
      }
    });
  }

  // Trigger Scan
  if (btnDashScan) {
    btnDashScan.addEventListener('click', async (e) => {
      e.preventDefault();
      showToast('Opening LinkedIn Connections...');
      try {
        await launchLinkedInTask('scan');
      } catch (err) {
        console.error('Failed to trigger scan:', err);
        showToast('Failed to connect to LinkedIn tab');
      }
    });
  }

  // Stop button
  if (btnDashStop) {
    btnDashStop.addEventListener('click', async (e) => {
      e.preventDefault();
      await stopAllAutomation();
    });
  }

  // Clear logs
  if (btnDashClearLogs) {
    btnDashClearLogs.addEventListener('click', async (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to clear your message activity history?')) {
        await chrome.storage.local.set({ sentHistory: [] });
        showToast('Activity history cleared');
        await syncDashboard();
      }
    });
  }

  // Export CSV
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', (e) => {
      e.preventDefault();
      if (!currentHistoryData || currentHistoryData.length === 0) {
        showToast('No history available to export');
        return;
      }

      const headers = ['Name', 'Profile URL', 'Sent At', 'Rule Applied', 'Status', 'Message'];
      const rows = currentHistoryData.map(item => [
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${(item.profileUrl || '').replace(/"/g, '""')}"`,
        `"${(item.sentAt || '').replace(/"/g, '""')}"`,
        `"${(item.ruleMatched || 'Default').replace(/"/g, '""')}"`,
        `"${(item.status || '').replace(/"/g, '""')}"`,
        `"${(item.message || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `linkedin_welcome_history_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported CSV successfully!');
    });
  }

  // --- 2. ASYNC STORAGE SYNC ---
  async function syncDashboard() {
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

      const todayCount = stats.todayCount || 0;
      const limit = Number(settings.dailyLimit);
      const isUnlimited = isNaN(limit) || limit <= 0;

      if (dashMasterToggle) dashMasterToggle.checked = Boolean(settings.enabled);

      if (statToday) statToday.textContent = todayCount;
      if (statTodaySub) statTodaySub.textContent = isUnlimited ? 'Daily limit: Unlimited' : `Daily limit: ${limit}`;
      if (statTotal) statTotal.textContent = stats.totalSent || 0;

      if (statStatus) {
        if (!settings.enabled) {
          statStatus.textContent = 'Paused';
          statStatus.style.color = '#64748b';
        } else if (runtimeState.isProcessing) {
          statStatus.textContent = runtimeState.currentStatus || 'In Progress';
          statStatus.style.color = '#f59e0b';
          if (btnDashScan) btnDashScan.classList.add('hidden');
          if (btnDashStop) btnDashStop.classList.remove('hidden');
        } else {
          const lastStatus = runtimeState.currentStatus;
          if (!isUnlimited && todayCount >= limit) {
            statStatus.textContent = 'Daily limit reached';
            statStatus.style.color = '#f59e0b';
          } else if (lastStatus && !lastStatus.toLowerCase().includes('stopped') && !lastStatus.toLowerCase().includes('processing') && !lastStatus.toLowerCase().includes('connecting')) {
            statStatus.textContent = lastStatus;
            statStatus.style.color = '#10b981';
          } else {
            statStatus.textContent = 'Ready';
            statStatus.style.color = '#10b981';
          }
          if (btnDashScan) btnDashScan.classList.remove('hidden');
          if (btnDashStop) btnDashStop.classList.add('hidden');
        }
      }

      if (statLastRun) {
        statLastRun.textContent = runtimeState.lastRunTime ? `Last run: ${formatDate(runtimeState.lastRunTime)}` : 'Last run: Never';
      }

      // Template & Variants rendering
      const isEditingTemplate = dashTemplateInput && document.activeElement === dashTemplateInput;
      if (!isEditingTemplate) {
        dashDefaultVariants = parseVariants(settings.template || DEFAULT_SETTINGS.template);
        if (currentDashVariantIndex >= dashDefaultVariants.length) {
          currentDashVariantIndex = 0;
        }
        renderDashDefaultVariantTabs();
      }

      // Render Rules if not currently editing them
      const isEditingRules = dashRulesContainer && dashRulesContainer.contains(document.activeElement);
      if (!isEditingRules) {
        let loadedRules = Array.isArray(settings.rules) ? settings.rules : DEFAULT_SETTINGS.rules;
        loadedRules = loadedRules.map(r => {
          if (r.id === 'rule_realtors' && (!r.template || r.template.includes('How is the market treating you recently in your area?'))) {
            return { ...r, template: DEFAULT_REALTOR_VARIANTS.join("\n\n---OR---\n\n") };
          }
          return r;
        });
        currentDashRules = loadedRules;
        renderDashRules(currentDashRules);
      }

      if (dashSettingDaily && document.activeElement !== dashSettingDaily) {
        dashSettingDaily.value = isUnlimited ? 0 : limit;
      }
      if (dashSettingMinDelay && document.activeElement !== dashSettingMinDelay) {
        dashSettingMinDelay.value = settings.minDelay || 25;
      }
      if (dashSettingMaxDelay && document.activeElement !== dashSettingMaxDelay) {
        dashSettingMaxDelay.value = settings.maxDelay || 45;
      }
      if (dashSettingSkipExisting) {
        dashSettingSkipExisting.checked = settings.skipExistingChats !== false;
      }
      if (dashSettingInterval) {
        dashSettingInterval.value = String(settings.autoScanInterval || 60);
      }
      if (dashSettingWebhook && document.activeElement !== dashSettingWebhook) {
        dashSettingWebhook.value = settings.webhookUrl || '';
      }
      if (dashFollowupToggle) {
        dashFollowupToggle.checked = Boolean(settings.followUpEnabled);
      }
      if (dashSettingFollowupDays && document.activeElement !== dashSettingFollowupDays) {
        dashSettingFollowupDays.value = settings.followUpDays || 4;
      }
      if (dashFollowupTemplateInput && document.activeElement !== dashFollowupTemplateInput) {
        dashFollowupTemplateInput.value = settings.followUpTemplate || DEFAULT_SETTINGS.followUpTemplate;
      }
      if (dashQuickWithdrawAge && document.activeElement !== dashQuickWithdrawAge) {
        dashQuickWithdrawAge.value = String(settings.withdrawAgeDays !== undefined ? settings.withdrawAgeDays : 30);
      }

      renderTables(sentHistory);

    } catch (e) {
      console.error('Failed to sync dashboard:', e);
    }
  }

  // Load storage immediately
  syncDashboard();

  // React to storage changes
  chrome.storage.onChanged.addListener(() => {
    syncDashboard();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
