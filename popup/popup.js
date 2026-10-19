/**
 * Popup Interface Controller
 * Manages tab switching, real-time dashboard updates, campaign configurations,
 * group list management, safety circuit breaker resets, and audit logs.
 */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  let countdownInterval = null;

  // DOM Element References
  const elements = {
    // Badges & Status
    statusBadge: document.getElementById('queue-status-badge'),
    groupCountBadge: document.getElementById('group-count-badge'),
    safetyBanner: document.getElementById('safety-alert-banner'),
    safetyAlertText: document.getElementById('safety-alert-text'),
    btnClearSafety: document.getElementById('btn-clear-safety'),

    // Master Controls
    btnStart: document.getElementById('btn-start'),
    btnPause: document.getElementById('btn-pause'),
    btnStop: document.getElementById('btn-stop'),
    countdownBanner: document.getElementById('countdown-banner'),
    nextActionLabel: document.getElementById('next-action-label'),
    countdownTimer: document.getElementById('countdown-timer'),

    // Metrics
    metricPostsText: document.getElementById('metric-posts-text'),
    postsProgressFill: document.getElementById('posts-progress-fill'),
    metricSearchesText: document.getElementById('metric-searches-text'),
    searchesProgressFill: document.getElementById('searches-progress-fill'),
    dashboardActiveKeyword: document.getElementById('dashboard-active-keyword'),
    dashboardMode: document.getElementById('dashboard-mode'),

    // Manual Actions
    btnManualDiscover: document.getElementById('btn-manual-discover'),
    btnManualPost: document.getElementById('btn-manual-post'),

    // Campaign & Keywords
    inputNewKeyword: document.getElementById('input-new-keyword'),
    btnAddKeyword: document.getElementById('btn-add-keyword'),
    keywordsList: document.getElementById('keywords-list'),
    textareaNewTemplate: document.getElementById('textarea-new-template'),
    btnAddTemplate: document.getElementById('btn-add-template'),
    btnTestSpintax: document.getElementById('btn-test-spintax'),
    spintaxPreviewBox: document.getElementById('spintax-preview-box'),
    spintaxPreviewsList: document.getElementById('spintax-previews-list'),
    templatesList: document.getElementById('templates-list'),

    // Groups
    inputSearchGroups: document.getElementById('input-search-groups'),
    selectFilterGroups: document.getElementById('select-filter-groups'),
    groupsContainer: document.getElementById('groups-container'),
    btnExportGroups: document.getElementById('btn-export-groups'),
    btnClearGroups: document.getElementById('btn-clear-groups'),

    // Settings
    settingMaxPosts: document.getElementById('setting-max-posts'),
    settingMaxSearches: document.getElementById('setting-max-searches'),
    settingMinDelay: document.getElementById('setting-min-delay'),
    settingMaxDelay: document.getElementById('setting-max-delay'),
    settingAutomationMode: document.getElementById('setting-automation-mode'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    btnResetUsage: document.getElementById('btn-reset-usage'),

    // Logs
    selectLogFilter: document.getElementById('select-log-filter'),
    btnClearLogs: document.getElementById('btn-clear-logs'),
    logsContainer: document.getElementById('logs-container'),

    // Tabs
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),

    // Toast
    toastContainer: document.getElementById('toast-container')
  };

  // --- Initial Setup & Event Listeners ---
  initTabs();
  initEventListeners();
  await refreshAll();

  // Real-time synchronization on storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      refreshAll();
    }
  });

  // Start countdown ticker
  startCountdownTicker();

  // --- Tab Navigation ---
  function initTabs() {
    elements.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.tabButtons.forEach(b => b.classList.remove('active'));
        elements.tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPane = document.getElementById(btn.dataset.tab);
        if (targetPane) targetPane.classList.add('active');
      });
    });
  }

  // --- Event Listeners Initialization ---
  function initEventListeners() {
    // Master Queue Controls
    elements.btnStart.addEventListener('click', async () => {
      try {
        const resp = await chrome.runtime.sendMessage({ action: 'START_QUEUE' });
        showToast(resp?.message || 'Queue started');
        await refreshAll();
      } catch (e) {
        showToast('Error: ' + e.message);
      }
    });

    elements.btnPause.addEventListener('click', async () => {
      const resp = await chrome.runtime.sendMessage({ action: 'PAUSE_QUEUE' });
      showToast(resp?.message || 'Queue paused');
      await refreshAll();
    });

    elements.btnStop.addEventListener('click', async () => {
      const resp = await chrome.runtime.sendMessage({ action: 'EMERGENCY_STOP' });
      showToast(resp?.message || 'Queue stopped');
      await refreshAll();
    });

    elements.btnClearSafety.addEventListener('click', async () => {
      await StorageUtil.saveCampaignState({ status: 'idle' });
      await StorageUtil.appendLog('Safety circuit breaker manually cleared.', 'info');
      showToast('Safety lock reset');
      await refreshAll();
    });

    // Manual Instant Actions
    elements.btnManualDiscover.addEventListener('click', async () => {
      const state = await StorageUtil.getCampaignState();
      const kw = state.keywords[state.activeKeywordIndex % state.keywords.length] || 'business';
      showToast('Scanning groups for "' + kw + '"...');
      try {
        const resp = await chrome.runtime.sendMessage({ action: 'MANUAL_RUN_DISCOVERY', keyword: kw });
        if (resp && resp.success) {
          showToast(`Found ${resp.count} groups!`);
        } else {
          showToast(resp?.error || 'Could not scan active tab.');
        }
      } catch (err) {
        showToast('Ensure active tab is on Facebook search page.');
      }
      await refreshAll();
    });

    elements.btnManualPost.addEventListener('click', async () => {
      const state = await StorageUtil.getCampaignState();
      const tmpl = state.postTemplates[state.activeTemplateIndex % state.postTemplates.length];
      showToast('Posting to active Facebook group tab...');
      try {
        const resp = await chrome.runtime.sendMessage({ action: 'MANUAL_RUN_POST', template: tmpl });
        if (resp && resp.success) {
          showToast('Post submitted! Status: ' + resp.approvalStatus);
        } else {
          showToast(resp?.error || 'Post attempt failed.');
        }
      } catch (err) {
        showToast('Ensure active tab is on a Facebook group page.');
      }
      await refreshAll();
    });

    // Keywords Management
    elements.btnAddKeyword.addEventListener('click', async () => {
      const kw = elements.inputNewKeyword.value.trim();
      if (!kw) return;
      const state = await StorageUtil.getCampaignState();
      if (!state.keywords.includes(kw)) {
        state.keywords.push(kw);
        await StorageUtil.saveCampaignState({ keywords: state.keywords });
        elements.inputNewKeyword.value = '';
        showToast(`Keyword "${kw}" added`);
        await renderKeywords();
      }
    });

    // Templates & Spintax Management
    elements.btnAddTemplate.addEventListener('click', async () => {
      const text = elements.textareaNewTemplate.value.trim();
      if (!text) return;
      const state = await StorageUtil.getCampaignState();
      state.postTemplates.push(text);
      await StorageUtil.saveCampaignState({ postTemplates: state.postTemplates });
      elements.textareaNewTemplate.value = '';
      showToast('Template saved');
      await renderTemplates();
    });

    elements.btnTestSpintax.addEventListener('click', () => {
      const text = elements.textareaNewTemplate.value.trim();
      if (!text) {
        showToast('Enter template text to preview spintax');
        return;
      }
      const previews = SpinSyntax.generatePreviews(text, 3);
      elements.spintaxPreviewsList.innerHTML = previews.map(p => `<div class="preview-item">${escapeHtml(p)}</div>`).join('');
      elements.spintaxPreviewBox.classList.remove('hidden');
    });

    // Groups Filtering & Actions
    elements.inputSearchGroups.addEventListener('input', renderGroups);
    elements.selectFilterGroups.addEventListener('change', renderGroups);

    elements.btnExportGroups.addEventListener('click', async () => {
      const groups = await StorageUtil.getGroups();
      const blob = new Blob([JSON.stringify(groups, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facebook_groups_${StorageUtil.getTodayDateString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Groups exported');
    });

    elements.btnClearGroups.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete all discovered groups?')) {
        await StorageUtil.clearGroups();
        showToast('Groups cleared');
        await renderGroups();
      }
    });

    // Settings
    elements.btnSaveSettings.addEventListener('click', async () => {
      const maxPosts = parseInt(elements.settingMaxPosts.value, 10) || 10;
      const maxSearches = parseInt(elements.settingMaxSearches.value, 10) || 20;
      const minDelay = parseInt(elements.settingMinDelay.value, 10) || 60;
      const maxDelay = parseInt(elements.settingMaxDelay.value, 10) || 180;
      const autoMode = elements.settingAutomationMode.value;

      if (minDelay >= maxDelay) {
        showToast('Min delay must be less than max delay');
        return;
      }

      await StorageUtil.saveCampaignState({
        automationMode: autoMode,
        rateLimits: {
          maxPostsDaily: maxPosts,
          maxSearchesDaily: maxSearches,
          minDelaySeconds: minDelay,
          maxDelaySeconds: maxDelay
        }
      });

      showToast('Settings saved successfully');
      await refreshAll();
    });

    elements.btnResetUsage.addEventListener('click', async () => {
      if (confirm('Reset today\'s search and post counters back to 0?')) {
        await StorageUtil.resetDailyUsage();
        showToast('Daily counters reset');
        await refreshAll();
      }
    });

    // Logs
    elements.selectLogFilter.addEventListener('change', renderLogs);
    elements.btnClearLogs.addEventListener('click', async () => {
      await StorageUtil.clearLogs();
      showToast('Logs cleared');
      await renderLogs();
    });
  }

  // --- Main Refresh Controller ---
  async function refreshAll() {
    const state = await StorageUtil.getCampaignState();
    renderStatus(state);
    renderMetrics(state);
    await renderKeywords(state);
    await renderTemplates(state);
    await renderGroups();
    await renderLogs();
    populateSettings(state);
  }

  // --- Render Status & Badges ---
  function renderStatus(state) {
    const status = state.status || 'idle';
    elements.statusBadge.className = 'badge';

    if (status === 'running') {
      elements.statusBadge.classList.add('badge-running');
      elements.statusBadge.innerText = 'RUNNING';
      elements.safetyBanner.classList.add('hidden');
    } else if (status === 'paused') {
      elements.statusBadge.classList.add('badge-paused');
      elements.statusBadge.innerText = 'PAUSED';
      elements.safetyBanner.classList.add('hidden');
    } else if (status === 'paused_safety') {
      elements.statusBadge.classList.add('badge-safety');
      elements.statusBadge.innerText = 'SAFETY HALT';
      elements.safetyBanner.classList.remove('hidden');
    } else {
      elements.statusBadge.classList.add('badge-idle');
      elements.statusBadge.innerText = 'IDLE';
      elements.safetyBanner.classList.add('hidden');
    }

    const currentKeyword = state.keywords[state.activeKeywordIndex % state.keywords.length] || 'None';
    elements.dashboardActiveKeyword.innerText = currentKeyword;

    const modeLabels = {
      all: 'Discover & Post (Full Cycle)',
      discover_only: 'Discover Only',
      post_only: 'Post to Discovered'
    };
    elements.dashboardMode.innerText = modeLabels[state.automationMode] || state.automationMode;
  }

  // --- Render Quota Metrics ---
  function renderMetrics(state) {
    const postsDone = state.usageToday.postsCompleted || 0;
    const postsMax = state.rateLimits.maxPostsDaily || 10;
    const postsPct = Math.min(100, Math.round((postsDone / postsMax) * 100));

    elements.metricPostsText.innerText = `${postsDone} / ${postsMax}`;
    elements.postsProgressFill.style.width = `${postsPct}%`;
    elements.postsProgressFill.style.backgroundColor = postsDone >= postsMax ? '#fa383e' : '#1877f2';

    const searchesDone = state.usageToday.searchesConducted || 0;
    const searchesMax = state.rateLimits.maxSearchesDaily || 20;
    const searchesPct = Math.min(100, Math.round((searchesDone / searchesMax) * 100));

    elements.metricSearchesText.innerText = `${searchesDone} / ${searchesMax}`;
    elements.searchesProgressFill.style.width = `${searchesPct}%`;
    elements.searchesProgressFill.style.backgroundColor = searchesDone >= searchesMax ? '#fa383e' : '#1877f2';
  }

  // --- Render Keywords ---
  async function renderKeywords(stateArg) {
    const state = stateArg || await StorageUtil.getCampaignState();
    elements.keywordsList.innerHTML = '';

    state.keywords.forEach((kw, index) => {
      const li = document.createElement('li');
      li.className = 'tag-item';
      li.innerHTML = `
        <span>${escapeHtml(kw)}</span>
        <span class="tag-remove" data-index="${index}">&times;</span>
      `;

      li.querySelector('.tag-remove').addEventListener('click', async (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        state.keywords.splice(idx, 1);
        await StorageUtil.saveCampaignState({ keywords: state.keywords });
        await renderKeywords();
      });

      elements.keywordsList.appendChild(li);
    });
  }

  // --- Render Post Templates ---
  async function renderTemplates(stateArg) {
    const state = stateArg || await StorageUtil.getCampaignState();
    elements.templatesList.innerHTML = '';

    state.postTemplates.forEach((template, index) => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div class="template-text">${escapeHtml(template)}</div>
        <span class="template-delete" data-index="${index}" title="Delete template">&times;</span>
      `;

      card.querySelector('.template-delete').addEventListener('click', async (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        state.postTemplates.splice(idx, 1);
        await StorageUtil.saveCampaignState({ postTemplates: state.postTemplates });
        await renderTemplates();
      });

      elements.templatesList.appendChild(card);
    });
  }

  // --- Render Discovered Groups ---
  async function renderGroups() {
    const groupsMap = await StorageUtil.getGroups();
    const groups = Object.values(groupsMap);
    elements.groupCountBadge.innerText = groups.length;

    const searchTerm = elements.inputSearchGroups.value.toLowerCase().trim();
    const filter = elements.selectFilterGroups.value;

    const filtered = groups.filter(g => {
      if (filter === 'auto_approved' && g.approvalStatus !== 'auto_approved') return false;
      if (filter === 'requires_review' && g.approvalStatus !== 'requires_review') return false;
      if (filter === 'blacklisted' && !g.isBlacklisted) return false;

      if (searchTerm) {
        const matchName = (g.groupName || '').toLowerCase().includes(searchTerm);
        const matchKeyword = (g.discoveredKeyword || '').toLowerCase().includes(searchTerm);
        return matchName || matchKeyword;
      }
      return true;
    });

    if (filtered.length === 0) {
      elements.groupsContainer.innerHTML = '<div class="empty-state">No matching groups found.</div>';
      return;
    }

    elements.groupsContainer.innerHTML = '';
    filtered.forEach(group => {
      const card = document.createElement('div');
      card.className = `group-card ${group.isBlacklisted ? 'blacklisted' : ''}`;

      const badgeClass = group.approvalStatus === 'auto_approved'
        ? 'badge-auto-approved'
        : group.approvalStatus === 'requires_review'
          ? 'badge-requires-review'
          : 'badge-restricted';

      const lastPostStr = group.lastPostedAt ? new Date(group.lastPostedAt).toLocaleDateString() : 'Never';

      card.innerHTML = `
        <div class="group-card-header">
          <a href="${escapeHtml(group.groupUrl)}" target="_blank" class="group-title" title="${escapeHtml(group.groupName)}">
            ${escapeHtml(group.groupName)}
          </a>
          <span class="group-badge ${badgeClass}">${group.approvalStatus.replace('_', ' ')}</span>
        </div>
        <div class="group-meta">
          <span>👥 ${group.memberCount ? group.memberCount.toLocaleString() : 'N/A'} members</span>
          <span>🔒 ${group.privacy || 'Public'}</span>
          <span>📝 Posted: ${group.postCount || 0}x (Last: ${lastPostStr})</span>
        </div>
        <div class="group-actions">
          <button class="btn btn-sm btn-outline btn-toggle-blacklist" data-id="${group.groupId}">
            ${group.isBlacklisted ? 'Whitelist' : 'Blacklist'}
          </button>
          <button class="btn btn-sm btn-outline-danger btn-delete-group" data-id="${group.groupId}">
            Delete
          </button>
        </div>
      `;

      card.querySelector('.btn-toggle-blacklist').addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        await StorageUtil.toggleGroupBlacklist(id);
        await renderGroups();
      });

      card.querySelector('.btn-delete-group').addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        await StorageUtil.deleteGroup(id);
        await renderGroups();
      });

      elements.groupsContainer.appendChild(card);
    });
  }

  // --- Render Operational Logs ---
  async function renderLogs() {
    const logs = await StorageUtil.getLogs();
    const filter = elements.selectLogFilter.value;

    const filtered = logs.filter(l => {
      if (filter === 'all') return true;
      return l.level === filter;
    });

    if (filtered.length === 0) {
      elements.logsContainer.innerHTML = '<div class="empty-state">No logs recorded for this filter.</div>';
      return;
    }

    elements.logsContainer.innerHTML = filtered.map(log => {
      const timeStr = new Date(log.timestamp).toLocaleTimeString();
      return `
        <div class="log-entry log-${log.level}">
          <span class="log-time">[${timeStr}]</span>
          <span class="log-msg">${escapeHtml(log.message)}</span>
        </div>
      `;
    }).join('');
  }

  // --- Populate Settings Form ---
  function populateSettings(state) {
    elements.settingMaxPosts.value = state.rateLimits.maxPostsDaily || 10;
    elements.settingMaxSearches.value = state.rateLimits.maxSearchesDaily || 20;
    elements.settingMinDelay.value = state.rateLimits.minDelaySeconds || 60;
    elements.settingMaxDelay.value = state.rateLimits.maxDelaySeconds || 180;
    elements.settingAutomationMode.value = state.automationMode || 'all';
  }

  // --- Countdown Ticker ---
  function startCountdownTicker() {
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(async () => {
      const state = await StorageUtil.getCampaignState();
      if (state.status === 'running' && state.nextScheduledRun) {
        const diffMs = new Date(state.nextScheduledRun).getTime() - Date.now();
        if (diffMs > 0) {
          const seconds = Math.floor(diffMs / 1000);
          elements.countdownBanner.classList.remove('hidden');
          elements.nextActionLabel.innerText = state.currentTask || 'Scheduled Task';
          elements.countdownTimer.innerText = `${seconds}s`;
        } else {
          elements.countdownBanner.classList.add('hidden');
        }
      } else {
        elements.countdownBanner.classList.add('hidden');
      }
    }, 1000);
  }

  // --- UI Toast Helper ---
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
