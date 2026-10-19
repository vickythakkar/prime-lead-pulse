/**
 * LinkedIn Auto Welcome & Responder - Full Dashboard Logic
 * Robust, synchronous event binding with direct storage access.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  template: "Hi {firstName}, thanks for connecting! Looking forward to staying in touch.",
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
  const tagPills = document.querySelectorAll('.tag-pill');

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

  function renderTables(history) {
    currentHistoryData = history || [];

    if (!history || history.length === 0) {
      if (overviewTableBody) overviewTableBody.innerHTML = '<tr><td colspan="4" class="text-center empty-cell">No messages sent yet. Newly accepted connections will appear here.</td></tr>';
      if (logsTableBody) logsTableBody.innerHTML = '<tr><td colspan="5" class="text-center empty-cell">No history found.</td></tr>';
      return;
    }

    // Top 5 on Overview
    if (overviewTableBody) {
      overviewTableBody.innerHTML = '';
      history.slice(0, 5).forEach(item => {
        const tr = document.createElement('tr');
        const isSent = item.status === 'sent';
        tr.innerHTML = `
          <td><strong>${escapeHtml(item.name || 'Member')}</strong></td>
          <td>${formatDate(item.sentAt)}</td>
          <td style="max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.message)}</td>
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
        tr.innerHTML = `
          <td><strong>${escapeHtml(item.name || 'Member')}</strong></td>
          <td>${formatDate(item.sentAt)}</td>
          <td style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.message)}">${escapeHtml(item.message)}</td>
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

  // Save Template
  if (btnDashSaveTemplate) {
    btnDashSaveTemplate.addEventListener('click', async (e) => {
      e.preventDefault();
      const template = dashTemplateInput.value.trim();
      if (!template) {
        showToast('Template cannot be empty');
        return;
      }
      try {
        const { settings = {} } = await chrome.storage.local.get('settings');
        const updated = { ...DEFAULT_SETTINGS, ...settings, template };
        await chrome.storage.local.set({ settings: updated });
        showToast('Template saved successfully!');
      } catch (err) {
        showToast('Error saving template');
      }
    });
  }

  // Save Settings
  if (btnDashSaveSettings) {
    btnDashSaveSettings.addEventListener('click', async (e) => {
      e.preventDefault();
      const dailyLimit = parseInt(dashSettingDaily.value, 10) || 15;
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

      const headers = ['Name', 'Profile URL', 'Sent At', 'Status', 'Message'];
      const rows = currentHistoryData.map(item => [
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${(item.profileUrl || '').replace(/"/g, '""')}"`,
        `"${(item.sentAt || '').replace(/"/g, '""')}"`,
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

      if (dashMasterToggle) dashMasterToggle.checked = Boolean(settings.enabled);

      if (statToday) statToday.textContent = stats.todayCount || 0;
      if (statTodaySub) statTodaySub.textContent = `Daily limit: ${settings.dailyLimit || 15}`;
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

      if (dashSettingDaily && document.activeElement !== dashSettingDaily) {
        dashSettingDaily.value = settings.dailyLimit || 15;
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
