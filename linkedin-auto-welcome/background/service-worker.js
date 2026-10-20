/**
 * LinkedIn Auto Welcome & Responder - Background Service Worker
 * Manifest V3 compliant - Fully persistent via chrome.storage.local
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
  minDelay: 25,       // min delay between sends in seconds
  maxDelay: 45,       // max delay between sends in seconds
  skipExistingChats: true,
  autoScanInterval: 60 // minutes between automatic checks
};

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function getStorageData() {
  const result = await chrome.storage.local.get([
    'settings',
    'stats',
    'sentHistory',
    'runtimeState'
  ]);

  const today = getTodayString();
  let stats = result.stats || {
    todayCount: 0,
    lastResetDate: today,
    totalSent: 0
  };

  // Reset daily quota if day has rolled over
  if (stats.lastResetDate !== today) {
    stats.todayCount = 0;
    stats.lastResetDate = today;
    await chrome.storage.local.set({ stats });
  }

  const rawSettings = result.settings || {};
  const settings = {
    ...DEFAULT_SETTINGS,
    ...rawSettings,
    rules: Array.isArray(rawSettings.rules) ? rawSettings.rules : DEFAULT_SETTINGS.rules
  };
  const sentHistory = result.sentHistory || [];
  const runtimeState = result.runtimeState || {
    isProcessing: false,
    currentStatus: 'Idle - Ready',
    lastRunTime: null
  };

  return { settings, stats, sentHistory, runtimeState };
}

// Lifecycle: setup on install
chrome.runtime.onInstalled.addListener(async (details) => {
  const { settings, stats, sentHistory, runtimeState } = await getStorageData();

  await chrome.storage.local.set({
    settings,
    stats,
    sentHistory,
    runtimeState: {
      isProcessing: false,
      currentStatus: 'Ready',
      lastRunTime: null
    }
  });

  // Schedule periodic background check
  await setupScanAlarm(settings.autoScanInterval);
  updateBadge(stats.todayCount, settings.dailyLimit);
});

// Setup or update alarm interval
async function setupScanAlarm(intervalMinutes) {
  await chrome.alarms.clear('linkedin_auto_scan');
  chrome.alarms.create('linkedin_auto_scan', {
    periodInMinutes: Math.max(15, Number(intervalMinutes) || 60)
  });
}

// Update icon badge
async function updateBadge(todayCount, dailyLimit) {
  try {
    const text = todayCount > 0 ? `${todayCount}` : '';
    await chrome.action.setBadgeText({ text });
    const isUnlimited = !dailyLimit || Number(dailyLimit) <= 0;
    await chrome.action.setBadgeBackgroundColor({
      color: (!isUnlimited && todayCount >= dailyLimit) ? '#E02424' : '#0A66C2'
    });
  } catch (err) {
    // Ignore badge error if action not ready
  }
}

// Alarm Listener
chrome.alarms.addListener(async (alarm) => {
  if (alarm.name !== 'linkedin_auto_scan') return;

  const { settings, stats, runtimeState } = await getStorageData();

  if (!settings.enabled) return;
  const isUnlimited = !settings.dailyLimit || Number(settings.dailyLimit) <= 0;
  if (!isUnlimited && stats.todayCount >= Number(settings.dailyLimit)) return;
  if (runtimeState.isProcessing) return;

  // Check if a LinkedIn tab is open to safely perform background scan
  const tabs = await chrome.tabs.query({ url: 'https://*.linkedin.com/*' });
  if (tabs && tabs.length > 0) {
    const connTab = tabs.find(t => t.url && t.url.includes('/connections'));
    const targetTab = connTab || tabs[0];
    try {
      await chrome.tabs.sendMessage(targetTab.id, { action: 'TRIGGER_BACKGROUND_CHECK' });
    } catch (e) {
      // Content script may not be loaded in that tab yet
    }
  }
});

// Message Listener for Popup and Content Script communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'GET_DATA') {
        const data = await getStorageData();
        sendResponse({ success: true, data });
        return;
      }

      if (message.action === 'SAVE_SETTINGS') {
        const { settings: currentSettings } = await getStorageData();
        const updatedSettings = { ...currentSettings, ...message.settings };
        await chrome.storage.local.set({ settings: updatedSettings });

        if (message.settings.autoScanInterval) {
          await setupScanAlarm(updatedSettings.autoScanInterval);
        }
        sendResponse({ success: true, settings: updatedSettings });
        return;
      }

      if (message.action === 'RECORD_SENT_MESSAGE') {
        const { stats, sentHistory, settings } = await getStorageData();
        const newRecord = {
          id: message.payload.id || Date.now().toString(),
          profileUrl: message.payload.profileUrl,
          name: message.payload.name,
          firstName: message.payload.firstName,
          message: message.payload.message,
          ruleMatched: message.payload.ruleMatched || 'Default',
          sentAt: new Date().toISOString(),
          status: message.payload.status || 'sent'
        };

        // Prepend to history
        const updatedHistory = [newRecord, ...sentHistory].slice(0, 500); // keep last 500
        const updatedStats = {
          ...stats,
          todayCount: stats.todayCount + 1,
          totalSent: (stats.totalSent || 0) + 1
        };

        await chrome.storage.local.set({
          stats: updatedStats,
          sentHistory: updatedHistory
        });

        await updateBadge(updatedStats.todayCount, settings.dailyLimit);
        sendResponse({ success: true, record: newRecord });
        return;
      }

      if (message.action === 'UPDATE_RUNTIME_STATE') {
        const { runtimeState: current } = await getStorageData();
        const updatedState = { ...current, ...message.state };
        await chrome.storage.local.set({ runtimeState: updatedState });
        sendResponse({ success: true, state: updatedState });
        return;
      }

      if (message.action === 'CLEAR_HISTORY') {
        await chrome.storage.local.set({ sentHistory: [] });
        sendResponse({ success: true });
        return;
      }

      if (message.action === 'RESET_TODAY_COUNT') {
        const { stats, settings } = await getStorageData();
        const updatedStats = { ...stats, todayCount: 0 };
        await chrome.storage.local.set({ stats: updatedStats });
        await updateBadge(0, settings.dailyLimit);
        sendResponse({ success: true, stats: updatedStats });
        return;
      }

      if (message.action === 'START_SCAN_SESSION') {
        // Find existing LinkedIn connections tab or open one
        const tabs = await chrome.tabs.query({ url: 'https://*.linkedin.com/mynetwork/invite-connect/connections/*' });
        let targetTabId;

        if (tabs.length > 0) {
          targetTabId = tabs[0].id;
          await chrome.tabs.update(targetTabId, { active: true });
        } else {
          const newTab = await chrome.tabs.create({
            url: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
            active: true
          });
          targetTabId = newTab.id;
        }

        // Give the page a moment to load and request scan
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(targetTabId, { action: 'START_DOM_SCAN' });
          } catch (err) {
            console.log('Tab still loading or listener initializing');
          }
        }, 3000);

        sendResponse({ success: true, tabId: targetTabId });
        return;
      }

      if (message.action === 'STOP_SCAN_SESSION') {
        const tabs = await chrome.tabs.query({ url: 'https://*.linkedin.com/*' });
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'STOP_DOM_SCAN' });
          } catch (e) {
            // Tab might not be responsive
          }
        }
        await chrome.storage.local.set({
          runtimeState: {
            isProcessing: false,
            currentStatus: 'Stopped by user',
            lastRunTime: new Date().toISOString()
          }
        });
        sendResponse({ success: true });
        return;
      }

      sendResponse({ success: false, error: 'Unknown action' });
    } catch (err) {
      console.error('Service worker error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep channel open for async sendResponse
});
