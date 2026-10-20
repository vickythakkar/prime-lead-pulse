/**
 * LinkedIn Auto Welcome & Responder - Full Dashboard Logic
 * Robust, synchronous event binding with direct storage access.
 */

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

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const statTotal = document.getElementById('stat-total');
  const statStatus = document.getElementById('stat-status');
  const statLastRun = document.getElementById('stat-last-run');

  // Master Switch & Actions
  const dashMasterToggle = document.getElementById('dash-master-toggle');
  const btnDashScan = document.getElementById('btn-dash-scan');
  const btnDashStop = document.getElementById('btn-dash-stop');
  const btnGotoLogs = document.getElementById('btn-goto-logs');

  // Template Form
  const dashTemplateInput = document.getElementById('dash-template-input');
  const dashTemplatePreview = document.getElementById('dash-template-preview');
  const btnDashSaveTemplate = document.getElementById('btn-dash-save-template');
  const tagPills = document.querySelectorAll('.tag-pill:not(.dash-rule-tag-pill)');
  const dashRulesContainer = document.getElementById('dash-rules-container');
  const btnDashAddRule = document.getElementById('btn-dash-add-rule');
  let currentDashRules = [];

  // Safety Settings Form
  const dashSettingDaily = document.getElementById('dash-setting-daily');
  const dashSettingMinDelay = document.getElementById('dash-setting-min-delay');
  const dashSettingMaxDelay = document.getElementById('dash-setting-max-delay');
  const dashSettingSkipExisting = document.getElementById('dash-setting-skip-existing');
  const dashSettingInterval = document.getElementById('dash-setting-interval');
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

  function updatePreview() {
    if (!dashTemplateInput || !dashTemplatePreview) return;
    const raw = dashTemplateInput.value || '';
    const sample = raw
      .replace(/\{firstName\}/gi, 'Sarah')
      .replace(/\{fullName\}/gi, 'Sarah Jenkins');
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
      dashRulesContainer.innerHTML = '<div class="empty-cell text-center" style="padding: 24px;">No keyword rules configured. Click "+ Add Keyword Rule" above to create targeted messages for realtors, executives, etc.</div>';
      return;
    }

    rules.forEach((rule, idx) => {
      const card = document.createElement('div');
      card.className = 'dash-rule-card';
      card.dataset.id = rule.id || `rule_${idx}`;

      card.innerHTML = `
        <div class="dash-rule-header">
          <input type="text" class="dash-rule-name-input" placeholder="Rule Name (e.g. US Realtors & Real Estate)" value="${escapeHtml(rule.name || '')}">
          <button type="button" class="dash-rule-delete-btn" data-delete-idx="${idx}" title="Delete Rule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete Rule
          </button>
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Match Keywords (comma-separated, case-insensitive):</label>
          <input type="text" class="dash-rule-keywords-input" placeholder="e.g. realtor, real estate, broker, realty, mortgage, USA" value="${escapeHtml(rule.keywords || '')}">
        </div>
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <label style="font-size: 12px; font-weight: 600; color: #475569;">Targeted Message Template:</label>
            <div class="tags-group">
              <button type="button" class="tag-pill dash-rule-tag-pill" data-tag="{firstName}">+ {firstName}</button>
              <button type="button" class="tag-pill dash-rule-tag-pill" data-tag="{fullName}">+ {fullName}</button>
            </div>
          </div>
          <textarea class="code-textarea dash-rule-template-input" rows="3" placeholder="Message to send when keywords match...">${escapeHtml(rule.template || '')}</textarea>
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

  // Save Template
  if (btnDashSaveTemplate) {
    btnDashSaveTemplate.addEventListener('click', async (e) => {
      e.preventDefault();
      const template = dashTemplateInput.value.trim();
      if (!template) {
        showToast('Default template cannot be empty');
        return;
      }
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
        showToast('Templates & rules saved successfully!');
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
        await chrome.runtime.sendMessage({ action: 'RESET_TODAY_COUNT' });
        showToast("Today's message counter reset to 0");
        await syncDashboard();
      } catch (err) {
        const today = getTodayString();
        const { stats = {} } = await chrome.storage.local.get('stats');
        stats.todayCount = 0;
        stats.lastResetDate = today;
        await chrome.storage.local.set({ stats });
        showToast("Today's message counter reset to 0");
        await syncDashboard();
      }
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
          autoScanInterval
        };
        await chrome.storage.local.set({ settings: updated });
        showToast('Safety settings saved successfully!');
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

        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(targetTabId, { action: 'START_DOM_SCAN' });
          } catch (err) {}
        }, 2500);

      } catch (err) {
        console.error('Failed to trigger scan:', err);
      }
    });
  }

  // Stop button
  if (btnDashStop) {
    btnDashStop.addEventListener('click', async (e) => {
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
        await syncDashboard();
      } catch (err) {
        console.error('Error stopping:', err);
      }
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
          statStatus.textContent = 'In Progress';
          statStatus.style.color = '#f59e0b';
          if (btnDashScan) btnDashScan.classList.add('hidden');
          if (btnDashStop) btnDashStop.classList.remove('hidden');
        } else {
          statStatus.textContent = 'Ready';
          statStatus.style.color = '#10b981';
          if (btnDashScan) btnDashScan.classList.remove('hidden');
          if (btnDashStop) btnDashStop.classList.add('hidden');
        }
      }

      if (statLastRun) {
        statLastRun.textContent = runtimeState.lastRunTime ? `Last run: ${formatDate(runtimeState.lastRunTime)}` : 'Last run: Never';
      }

      if (dashTemplateInput && document.activeElement !== dashTemplateInput) {
        dashTemplateInput.value = settings.template || DEFAULT_SETTINGS.template;
        updatePreview();
      }

      // Render Rules if not currently editing them
      const isEditingRules = dashRulesContainer && dashRulesContainer.contains(document.activeElement);
      if (!isEditingRules) {
        currentDashRules = Array.isArray(settings.rules) ? settings.rules : DEFAULT_SETTINGS.rules;
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
