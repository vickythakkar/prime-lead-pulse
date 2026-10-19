/**
 * LinkedIn Auto Welcome & Responder - Full Dashboard Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
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

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }

  function updatePreview() {
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

    // Overview Table (Top 5)
    if (!history || history.length === 0) {
      overviewTableBody.innerHTML = '<tr><td colspan="4" class="text-center empty-cell">No messages sent yet. Newly accepted connections will appear here.</td></tr>';
      logsTableBody.innerHTML = '<tr><td colspan="5" class="text-center empty-cell">No history found.</td></tr>';
      return;
    }

    // Top 5
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

    // Complete Table
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

  async function loadDashboard() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_DATA' });
      if (!response || !response.success) return;

      const { settings, stats, sentHistory, runtimeState } = response.data;

      // Master switch
      dashMasterToggle.checked = Boolean(settings.enabled);

      // Stats
      statToday.textContent = stats.todayCount || 0;
      statTodaySub.textContent = `Daily limit: ${settings.dailyLimit || 15}`;
      statTotal.textContent = stats.totalSent || 0;

      if (!settings.enabled) {
        statStatus.textContent = 'Paused';
        statStatus.style.color = '#64748b';
      } else if (runtimeState.isProcessing) {
        statStatus.textContent = 'In Progress';
        statStatus.style.color = '#f59e0b';
        btnDashScan.classList.add('hidden');
        btnDashStop.classList.remove('hidden');
      } else {
        statStatus.textContent = 'Ready';
        statStatus.style.color = '#10b981';
        btnDashScan.classList.remove('hidden');
        btnDashStop.classList.add('hidden');
      }

      statLastRun.textContent = runtimeState.lastRunTime ? `Last run: ${formatDate(runtimeState.lastRunTime)}` : 'Last run: Never';

      // Template form
      if (document.activeElement !== dashTemplateInput) {
        dashTemplateInput.value = settings.template || '';
        updatePreview();
      }

      // Settings form
      if (document.activeElement !== dashSettingDaily) {
        dashSettingDaily.value = settings.dailyLimit || 15;
      }
      if (document.activeElement !== dashSettingMinDelay) {
        dashSettingMinDelay.value = settings.minDelay || 25;
      }
      if (document.activeElement !== dashSettingMaxDelay) {
        dashSettingMaxDelay.value = settings.maxDelay || 45;
      }
      dashSettingSkipExisting.checked = settings.skipExistingChats !== false;
      dashSettingInterval.value = String(settings.autoScanInterval || 60);

      // Render Tables
      renderTables(sentHistory);

    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    }
  }

  // Initial Load
  await loadDashboard();

  // Navigation switching
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
      pageTitle.textContent = titles[targetTab] || 'Dashboard';
    });
  });

  btnGotoLogs.addEventListener('click', () => {
    const logsNavItem = document.querySelector('.nav-item[data-tab="logs"]');
    if (logsNavItem) logsNavItem.click();
  });

  // Dynamic tags insertion
  tagPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const tag = pill.dataset.insert;
      const start = dashTemplateInput.selectionStart || dashTemplateInput.value.length;
      const end = dashTemplateInput.selectionEnd || dashTemplateInput.value.length;
      const text = dashTemplateInput.value;

      dashTemplateInput.value = text.substring(0, start) + tag + text.substring(end);
      dashTemplateInput.focus();
      dashTemplateInput.selectionStart = dashTemplateInput.selectionEnd = start + tag.length;
      updatePreview();
    });
  });

  dashTemplateInput.addEventListener('input', updatePreview);

  // Master switch
  dashMasterToggle.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      action: 'SAVE_SETTINGS',
      settings: { enabled: dashMasterToggle.checked }
    });
    showToast(dashMasterToggle.checked ? 'Automation enabled' : 'Automation paused');
    await loadDashboard();
  });

  // Save Template
  btnDashSaveTemplate.addEventListener('click', async () => {
    const template = dashTemplateInput.value.trim();
    if (!template) {
      showToast('Template cannot be empty');
      return;
    }
    await chrome.runtime.sendMessage({
      action: 'SAVE_SETTINGS',
      settings: { template }
    });
    showToast('Template saved successfully!');
  });

  // Save Settings
  btnDashSaveSettings.addEventListener('click', async () => {
    const dailyLimit = parseInt(dashSettingDaily.value, 10) || 15;
    const minDelay = parseInt(dashSettingMinDelay.value, 10) || 25;
    const maxDelay = parseInt(dashSettingMaxDelay.value, 10) || 45;
    const skipExistingChats = dashSettingSkipExisting.checked;
    const autoScanInterval = parseInt(dashSettingInterval.value, 10) || 60;

    if (minDelay >= maxDelay) {
      showToast('Min delay must be less than Max delay');
      return;
    }

    await chrome.runtime.sendMessage({
      action: 'SAVE_SETTINGS',
      settings: {
        dailyLimit,
        minDelay,
        maxDelay,
        skipExistingChats,
        autoScanInterval
      }
    });

    showToast('Safety settings saved successfully!');
    await loadDashboard();
  });

  // Trigger Scan
  btnDashScan.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'START_SCAN_SESSION' });
    showToast('Opening LinkedIn to scan new connections...');
  });

  // Stop button
  btnDashStop.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'STOP_SCAN_SESSION' });
    showToast('Stopping automation...');
    await loadDashboard();
  });

  // Clear logs
  btnDashClearLogs.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear your message activity history?')) {
      await chrome.runtime.sendMessage({ action: 'CLEAR_HISTORY' });
      showToast('Activity history cleared');
      await loadDashboard();
    }
  });

  // Export CSV
  btnExportCsv.addEventListener('click', () => {
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

  // Listen to background updates
  chrome.storage.onChanged.addListener(() => {
    loadDashboard();
  });
});
