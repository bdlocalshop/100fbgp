/**
 * Background Service Worker: Queue Orchestrator & Rate Limiting Engine
 * Ephemeral architecture: Never relies on global variables; persists all state in chrome.storage.local.
 * Uses chrome.alarms for scheduled dispatching and humanized jitter intervals.
 */

importScripts('/utils/spin-syntax.js', '/utils/storage.js');

const ALARM_NAME = 'FB_QUEUE_ALARM';

// Initialize extension lifecycle
chrome.runtime.onInstalled.addListener(async (details) => {
  await StorageUtil.getCampaignState();
  await updateBadge('idle');
  await StorageUtil.appendLog(`Extension installed (${details.reason}). Ready.`, 'info');
});

// Alarm Listener for Queue Execution
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await processQueueTick();
  }
});

// Unified Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case 'START_QUEUE':
          await startQueue();
          sendResponse({ success: true, message: 'Queue started.' });
          break;

        case 'PAUSE_QUEUE':
          await pauseQueue('User requested pause.');
          sendResponse({ success: true, message: 'Queue paused.' });
          break;

        case 'EMERGENCY_STOP':
          await emergencyStop('Emergency stop triggered.');
          sendResponse({ success: true, message: 'Queue stopped.' });
          break;

        case 'SAFETY_HALT':
          await handleSafetyHalt(message.reason || 'Safety circuit breaker triggered.');
          sendResponse({ success: true });
          break;

        case 'POST_COMPLETED':
          await handlePostCompleted(message);
          sendResponse({ success: true });
          break;

        case 'MANUAL_RUN_DISCOVERY':
          const discResult = await runManualDiscovery(message.keyword);
          sendResponse(discResult);
          break;

        case 'MANUAL_RUN_POST':
          const postResult = await runManualPost(message.template, message.groupId);
          sendResponse(postResult);
          break;

        default:
          sendResponse({ success: false, error: 'Unknown background action: ' + message.action });
      }
    } catch (err) {
      console.error('[Background] Error processing message:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep channel open for async response
});

/**
 * Starts the automated queue
 */
async function startQueue() {
  const state = await StorageUtil.getCampaignState();

  if (state.status === 'paused_safety') {
    await StorageUtil.appendLog('Cannot start queue: Safety circuit breaker is active. Resolve checkpoints first.', 'error');
    throw new Error('Safety circuit breaker is active.');
  }

  // Check daily limits
  if (isDailyQuotaExhausted(state)) {
    await StorageUtil.appendLog('Daily quotas already completed. Reset usage or wait until tomorrow.', 'warn');
    await pauseQueue('Daily quotas met.');
    return;
  }

  await StorageUtil.saveCampaignState({ status: 'running' });
  await updateBadge('running');
  await StorageUtil.appendLog('Queue started. Scheduling next task...', 'info');

  // Schedule next run with initial short delay (10-25 seconds) to allow user to view
  await scheduleNextTick(15, 30);
}

/**
 * Pauses the automated queue
 */
async function pauseQueue(reason = 'Paused') {
  await chrome.alarms.clear(ALARM_NAME);
  await StorageUtil.saveCampaignState({
    status: 'paused',
    nextScheduledRun: null,
    currentTask: null
  });
  await updateBadge('paused');
  await StorageUtil.appendLog(`Queue paused: ${reason}`, 'info');
}

/**
 * Emergency stop resets queue to idle
 */
async function emergencyStop(reason = 'Stopped') {
  await chrome.alarms.clear(ALARM_NAME);
  await StorageUtil.saveCampaignState({
    status: 'idle',
    nextScheduledRun: null,
    currentTask: null
  });
  await updateBadge('idle');
  await StorageUtil.appendLog(`Emergency Stop: ${reason}`, 'warn');
}

/**
 * Handles safety halts (checkpoint, rate-limit, ban detection)
 */
async function handleSafetyHalt(reason) {
  await chrome.alarms.clear(ALARM_NAME);
  await StorageUtil.saveCampaignState({
    status: 'paused_safety',
    nextScheduledRun: null,
    currentTask: null
  });
  await updateBadge('paused_safety');
  await StorageUtil.appendLog(`SAFETY HALT TRIGGERED: ${reason}`, 'error');

  // Show desktop notification
  try {
    chrome.notifications.create('safety_alert', {
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'Action Required: Safety Alert',
      message: `Automation stopped: ${reason}`
    });
  } catch (e) {
    console.error('Notification error:', e);
  }
}

/**
 * Handles post completion callback
 */
async function handlePostCompleted(payload) {
  const state = await StorageUtil.getCampaignState();
  if (state.status === 'running') {
    // Schedule next task after normal jitter delay
    const minDelay = state.rateLimits.minDelaySeconds || 60;
    const maxDelay = state.rateLimits.maxDelaySeconds || 180;
    await scheduleNextTick(minDelay, maxDelay);
  }
}

/**
 * Checks if daily limits have been satisfied
 */
function isDailyQuotaExhausted(state) {
  const { usageToday, rateLimits, automationMode } = state;
  const postsDone = usageToday.postsCompleted >= rateLimits.maxPostsDaily;
  const searchesDone = usageToday.searchesConducted >= rateLimits.maxSearchesDaily;

  if (automationMode === 'discover_only') return searchesDone;
  if (automationMode === 'post_only') return postsDone;
  return postsDone && searchesDone;
}

/**
 * Schedules the next tick using chrome.alarms with jitter
 */
async function scheduleNextTick(minSec, maxSec) {
  const jitterSec = Math.floor(minSec + Math.random() * (maxSec - minSec));
  const delayMinutes = Math.max(0.2, jitterSec / 60);
  const nextTime = Date.now() + jitterSec * 1000;

  await StorageUtil.saveCampaignState({
    nextScheduledRun: new Date(nextTime).toISOString()
  });

  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: delayMinutes });
  console.log(`[Background] Next tick scheduled in ${jitterSec}s (${delayMinutes.toFixed(2)}m)`);
}

/**
 * Main queue tick processor
 */
async function processQueueTick() {
  const state = await StorageUtil.getCampaignState();

  if (state.status !== 'running') {
    return;
  }

  // Quota check
  if (isDailyQuotaExhausted(state)) {
    await StorageUtil.appendLog('Daily quota limit reached. Automation paused for today.', 'warn');
    await pauseQueue('Daily quotas completed.');
    return;
  }

  const { automationMode, usageToday, rateLimits } = state;
  let taskType = 'discovery';

  // Determine what task to execute
  if (automationMode === 'post_only') {
    taskType = 'post';
  } else if (automationMode === 'discover_only') {
    taskType = 'discovery';
  } else {
    // 'all' mode: alternate between discovery and posting based on quotas
    const canSearch = usageToday.searchesConducted < rateLimits.maxSearchesDaily;
    const canPost = usageToday.postsCompleted < rateLimits.maxPostsDaily;

    if (canPost && (!canSearch || Math.random() > 0.4)) {
      taskType = 'post';
    } else {
      taskType = 'discovery';
    }
  }

  if (taskType === 'discovery') {
    await executeDiscoveryTask(state);
  } else {
    await executePostTask(state);
  }
}

/**
 * Executes a group discovery task in the background
 */
async function executeDiscoveryTask(state) {
  if (state.keywords.length === 0) {
    await StorageUtil.appendLog('No keywords configured for discovery.', 'warn');
    await pauseQueue('No keywords.');
    return;
  }

  const keyword = state.keywords[state.activeKeywordIndex % state.keywords.length];
  const nextIndex = (state.activeKeywordIndex + 1) % state.keywords.length;
  await StorageUtil.saveCampaignState({
    activeKeywordIndex: nextIndex,
    currentTask: `Discovering groups for "${keyword}"`
  });

  await StorageUtil.appendLog(`Initiating group discovery for keyword: "${keyword}"...`, 'info');

  const searchUrl = `https://www.facebook.com/groups/search/groups/?q=${encodeURIComponent(keyword)}`;
  const tab = await openOrReuseTab(searchUrl);

  // Allow tab to render
  await sleep(4000);

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'SCAN_SEARCH_GROUPS',
      keyword
    });

    if (response && response.success) {
      await StorageUtil.updateDailyUsage('searchesConducted');
    }
  } catch (err) {
    await StorageUtil.appendLog(`Discovery warning: Tab not responsive yet (${err.message}).`, 'warn');
  }

  // Schedule next queue step
  const minDelay = state.rateLimits.minDelaySeconds || 60;
  const maxDelay = state.rateLimits.maxDelaySeconds || 180;
  await scheduleNextTick(minDelay, maxDelay);
}

/**
 * Executes a posting task on the next eligible group
 */
async function executePostTask(state) {
  const groups = await StorageUtil.getGroups();
  const eligibleGroups = Object.values(groups).filter(g => {
    return !g.isBlacklisted && g.approvalStatus !== 'restricted';
  });

  if (eligibleGroups.length === 0) {
    await StorageUtil.appendLog('No eligible auto-approved groups available. Running discovery first.', 'info');
    await executeDiscoveryTask(state);
    return;
  }

  // Prioritize groups that haven't been posted to recently
  eligibleGroups.sort((a, b) => {
    const timeA = a.lastPostedAt ? new Date(a.lastPostedAt).getTime() : 0;
    const timeB = b.lastPostedAt ? new Date(b.lastPostedAt).getTime() : 0;
    return timeA - timeB;
  });

  const targetGroup = eligibleGroups[0];
  const template = state.postTemplates[state.activeTemplateIndex % state.postTemplates.length];
  const nextTemplateIndex = (state.activeTemplateIndex + 1) % state.postTemplates.length;

  await StorageUtil.saveCampaignState({
    activeTemplateIndex: nextTemplateIndex,
    currentTask: `Posting to group "${targetGroup.groupName}"`
  });

  await StorageUtil.appendLog(`Navigating to group "${targetGroup.groupName}" for post submission...`, 'info');

  const tab = await openOrReuseTab(targetGroup.groupUrl);
  await sleep(4500);

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'CREATE_POST',
      template,
      groupId: targetGroup.groupId
    });

    if (!response || !response.success) {
      await StorageUtil.appendLog(`Post attempt returned warning: ${response?.error || 'Unknown error'}`, 'warn');
    }
  } catch (err) {
    await StorageUtil.appendLog(`Post communication error: ${err.message}`, 'error');
  }

  // Schedule next
  const minDelay = state.rateLimits.minDelaySeconds || 60;
  const maxDelay = state.rateLimits.maxDelaySeconds || 180;
  await scheduleNextTick(minDelay, maxDelay);
}

/**
 * Manual discovery trigger from popup UI
 */
async function runManualDiscovery(keyword) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab found.');

  const effectiveKeyword = keyword || 'business networking';
  await StorageUtil.appendLog(`Running manual group discovery for "${effectiveKeyword}"...`, 'info');

  const response = await chrome.tabs.sendMessage(tab.id, {
    action: 'SCAN_SEARCH_GROUPS',
    keyword: effectiveKeyword
  });

  if (response && response.success) {
    await StorageUtil.updateDailyUsage('searchesConducted');
  }
  return response;
}

/**
 * Manual post trigger from popup UI
 */
async function runManualPost(template, groupId) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab found.');

  await StorageUtil.appendLog('Running manual post creation on active tab...', 'info');

  const response = await chrome.tabs.sendMessage(tab.id, {
    action: 'CREATE_POST',
    template,
    groupId
  });

  return response;
}

/**
 * Helper to open or reuse a Facebook tab
 */
async function openOrReuseTab(targetUrl) {
  const tabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
    return tab;
  }
  return await chrome.tabs.create({ url: targetUrl, active: true });
}

/**
 * Updates extension action badge
 */
async function updateBadge(status) {
  try {
    if (status === 'running') {
      await chrome.action.setBadgeText({ text: 'ON' });
      await chrome.action.setBadgeBackgroundColor({ color: '#28a745' }); // Green
    } else if (status === 'paused') {
      await chrome.action.setBadgeText({ text: 'PAUSE' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ffc107' }); // Yellow
    } else if (status === 'paused_safety') {
      await chrome.action.setBadgeText({ text: 'ALERT' });
      await chrome.action.setBadgeBackgroundColor({ color: '#dc3545' }); // Red
    } else {
      await chrome.action.setBadgeText({ text: 'IDLE' });
      await chrome.action.setBadgeBackgroundColor({ color: '#6c757d' }); // Gray
    }
  } catch (err) {
    console.warn('Could not set badge:', err);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
