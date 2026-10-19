/**
 * LinkedIn Auto Welcome & Responder - Popup Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const masterToggle = document.getElementById('master-toggle');
  const btnOpenFullDashboard = document.getElementById('btn-open-full-dashboard');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const quotaBadge = document.getElementById('quota-badge');
  const quotaProgressFill = document.getElementById('quota-progress-fill');
  const btnTriggerScan = document.getElementById('btn-trigger-scan');
  const btnStop = document.getElementById('btn-stop');

  // Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Template tab
  const templateInput = document.getElementById('template-input');
  const templatePreview = document.getElementById('template-preview');
  const btnSaveTemplate = document.getElementById('btn-save-template');
  const tagButtons = document.querySelectorAll('.tag-btn');

  // Settings tab
  const settingDailyLimit = document.getElementById('setting-daily-limit');
  const settingMinDelay = document.getElementById('setting-min-delay');
  const settingMaxDelay = document.getElementById('setting-max-delay');
  const settingSkipExisting = document.getElementById('setting-skip-existing');
  const settingScanInterval = document.getElementById('setting-scan-interval');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  // Logs tab
  const logsCount = document.getElementById('logs-count');
  const logsList = document.getElementById('logs-list');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const toast = document.getElementById('toast');

  // Show Toast
  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }

  // Update Live Preview
  function updatePreview() {
    const raw = templateInput.value || '';
    const sample = raw
      .replace(/\{firstName\}/gi, 'Sarah')
      .replace(/\{fullName\}/gi, 'Sarah Jenkins');
    templatePreview.textContent = sample || '(Empty message)';
  }

  // Render Activity Logs
  function renderLogs(history) {
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

      row.innerHTML = `
        <div>
          <a href="${item.profileUrl || '#'}" target="_blank" class="log-name">${escapeHtml(item.name || 'Member')}</a>
          <div class="log-time">${timeStr}</div>
        </div>
        <span class="log-badge ${isSent ? 'sent' : 'skipped'}">${isSent ? 'Sent' : 'Skipped'}</span>
      `;
      logsList.appendChild(row);
    });
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }

  // Load and refresh state
  async function loadState() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_DATA' });
      if (!response || !response.success) return;

      const { settings, stats, sentHistory, runtimeState } = response.data;

      // Master switch
      masterToggle.checked = Boolean(settings.enabled);

      // Status
      if (!settings.enabled) {
        statusDot.className = 'status-dot paused';
        statusText.textContent = 'Paused (Disabled)';
      } else if (runtimeState.isProcessing) {
        statusDot.className = 'status-dot busy';
        statusText.textContent = runtimeState.currentStatus || 'Processing...';
        btnTriggerScan.classList.add('hidden');
        btnStop.classList.remove('hidden');
      } else {
        statusDot.className = 'status-dot';
        statusText.textContent = stats.todayCount >= settings.dailyLimit ? 'Daily limit reached' : 'Ready';
        btnTriggerScan.classList.remove('hidden');
        btnStop.classList.add('hidden');
      }

      // Quota
      const today = stats.todayCount || 0;
      const limit = settings.dailyLimit || 15;
      quotaBadge.textContent = `Today: ${today} / ${limit}`;
      const pct = Math.min(100, Math.round((today / limit) * 100));
      quotaProgressFill.style.width = `${pct}%`;

      // Inputs (only set if not actively focused by user to prevent typing interference)
      if (document.activeElement !== templateInput) {
        templateInput.value = settings.template || '';
        updatePreview();
      }

      if (document.activeElement !== settingDailyLimit) {
        settingDailyLimit.value = settings.dailyLimit || 15;
      }
      if (document.activeElement !== settingMinDelay) {
        settingMinDelay.value = settings.minDelay || 25;
      }
      if (document.activeElement !== settingMaxDelay) {
        settingMaxDelay.value = settings.maxDelay || 45;
      }

      settingSkipExisting.checked = settings.skipExistingChats !== false;
      settingScanInterval.value = String(settings.autoScanInterval || 60);

      // Render Logs
      renderLogs(sentHistory);

    } catch (err) {
      console.error('Failed to load state in popup:', err);
    }
  }

  // Initial load
  await loadState();

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(`pane-${btn.dataset.tab}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Dynamic tags insertion
  tagButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.insert;
      const start = templateInput.selectionStart || templateInput.value.length;
      const end = templateInput.selectionEnd || templateInput.value.length;
      const text = templateInput.value;

      templateInput.value = text.substring(0, start) + tag + text.substring(end);
      templateInput.focus();
      templateInput.selectionStart = templateInput.selectionEnd = start + tag.length;
      updatePreview();
    });
  });

  templateInput.addEventListener('input', updatePreview);

  // Master switch toggle
  masterToggle.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      action: 'SAVE_SETTINGS',
      settings: { enabled: masterToggle.checked }
    });
    showToast(masterToggle.checked ? 'Automation enabled' : 'Automation paused');
    await loadState();
  });

  // Save Template button
  btnSaveTemplate.addEventListener('click', async () => {
    const template = templateInput.value.trim();
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

  // Save Settings button
  btnSaveSettings.addEventListener('click', async () => {
    const dailyLimit = parseInt(settingDailyLimit.value, 10) || 15;
    const minDelay = parseInt(settingMinDelay.value, 10) || 25;
    const maxDelay = parseInt(settingMaxDelay.value, 10) || 45;
    const skipExistingChats = settingSkipExisting.checked;
    const autoScanInterval = parseInt(settingScanInterval.value, 10) || 60;

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

    showToast('Settings saved successfully!');
    await loadState();
  });

  // Trigger scan button
  btnTriggerScan.addEventListener('click', async () => {
    btnTriggerScan.classList.add('hidden');
    btnStop.classList.remove('hidden');
    statusText.textContent = 'Opening connections...';
    statusDot.className = 'status-dot busy';

    await chrome.runtime.sendMessage({ action: 'START_SCAN_SESSION' });
    showToast('Connecting to LinkedIn...');
  });

  // Stop button
  btnStop.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'STOP_SCAN_SESSION' });
    showToast('Stopping automation...');
    await loadState();
  });

  // Clear logs button
  btnClearLogs.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear your message history log?')) {
      await chrome.runtime.sendMessage({ action: 'CLEAR_HISTORY' });
      showToast('Activity log cleared');
      await loadState();
    }
  });

  // Open Full Dashboard button
  btnOpenFullDashboard.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });

  // Live storage updates (if content script or service worker updates storage while popup is open)
  chrome.storage.onChanged.addListener(() => {
    loadState();
  });
});
