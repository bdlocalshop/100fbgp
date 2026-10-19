/**
 * Storage Layer Helper
 * Strongly-typed wrapper around chrome.storage.local adhering to PRD specifications.
 * Works seamlessly in Service Workers, Extension Popups, and Content Scripts.
 */
(function (root) {
  'use strict';

  const STORAGE_KEYS = {
    CAMPAIGN: 'fb_campaign_state',
    GROUPS: 'fb_discovered_groups',
    LOGS: 'fb_operational_logs'
  };

  const DEFAULT_CAMPAIGN = {
    activeCampaignId: 'camp_default',
    status: 'idle', // 'idle' | 'running' | 'paused' | 'paused_safety'
    keywords: [
      'ecommerce entrepreneurs',
      'shopify store owners',
      'digital marketing growth'
    ],
    activeKeywordIndex: 0,
    postTemplates: [
      '{Hello|Hi|Greetings} fellow group members! {Excited to connect with everyone here.|Great to be part of this community.} What has been your {biggest win|main focus} this month?',
      'Hey everyone! Quick question for the community: {what tools or tactics are currently driving the best results for you?|how are you streamlining your daily workflow this quarter?}'
    ],
    activeTemplateIndex: 0,
    automationMode: 'all', // 'all' (discover & post), 'discover_only', 'post_only'
    rateLimits: {
      maxSearchesDaily: 20,
      maxPostsDaily: 10,
      minDelaySeconds: 60,
      maxDelaySeconds: 180
    },
    usageToday: {
      dateString: getTodayDateString(),
      searchesConducted: 0,
      postsCompleted: 0
    },
    nextScheduledRun: null,
    currentTask: null
  };

  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const StorageUtil = {
    getTodayDateString,

    /**
     * Retrieves campaign state, automatically resetting daily counters if date has changed.
     * @returns {Promise<object>}
     */
    async getCampaignState() {
      const result = await chrome.storage.local.get(STORAGE_KEYS.CAMPAIGN);
      let state = result[STORAGE_KEYS.CAMPAIGN];

      if (!state) {
        state = JSON.parse(JSON.stringify(DEFAULT_CAMPAIGN));
        state.usageToday.dateString = getTodayDateString();
        await chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN]: state });
        return state;
      }

      // Check if day changed
      const today = getTodayDateString();
      if (!state.usageToday || state.usageToday.dateString !== today) {
        state.usageToday = {
          dateString: today,
          searchesConducted: 0,
          postsCompleted: 0
        };
        await chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN]: state });
      }

      return state;
    },

    /**
     * Saves campaign state
     * @param {object} updates 
     * @returns {Promise<object>}
     */
    async saveCampaignState(updates) {
      const current = await this.getCampaignState();
      const updated = { ...current, ...updates };
      await chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN]: updated });
      return updated;
    },

    /**
     * Increments daily usage for 'searchesConducted' or 'postsCompleted'
     * @param {'searchesConducted'|'postsCompleted'} type 
     * @returns {Promise<object>}
     */
    async updateDailyUsage(type) {
      const state = await this.getCampaignState();
      const today = getTodayDateString();

      if (state.usageToday.dateString !== today) {
        state.usageToday = {
          dateString: today,
          searchesConducted: 0,
          postsCompleted: 0
        };
      }

      if (type === 'searchesConducted') {
        state.usageToday.searchesConducted = (state.usageToday.searchesConducted || 0) + 1;
      } else if (type === 'postsCompleted') {
        state.usageToday.postsCompleted = (state.usageToday.postsCompleted || 0) + 1;
      }

      await chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN]: state });
      return state.usageToday;
    },

    /**
     * Resets daily usage manually
     */
    async resetDailyUsage() {
      const state = await this.getCampaignState();
      state.usageToday = {
        dateString: getTodayDateString(),
        searchesConducted: 0,
        postsCompleted: 0
      };
      await chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN]: state });
      await this.appendLog('Daily usage counters were reset.', 'info');
      return state.usageToday;
    },

    /**
     * Retrieves all discovered groups
     * @returns {Promise<Record<string, object>>}
     */
    async getGroups() {
      const result = await chrome.storage.local.get(STORAGE_KEYS.GROUPS);
      return result[STORAGE_KEYS.GROUPS] || {};
    },

    /**
     * Upserts a discovered group record
     * @param {object} groupData 
     * @returns {Promise<object>}
     */
    async saveDiscoveredGroup(groupData) {
      if (!groupData || (!groupData.groupId && !groupData.groupUrl)) {
        return null;
      }

      const groups = await this.getGroups();
      const key = groupData.groupId || groupData.groupUrl.replace(/[^a-zA-Z0-9]/g, '_');

      const existing = groups[key] || {};
      const updatedGroup = {
        groupId: groupData.groupId || existing.groupId || key,
        groupName: groupData.groupName || existing.groupName || 'Unknown Group',
        groupUrl: groupData.groupUrl || existing.groupUrl || '',
        discoveredKeyword: groupData.discoveredKeyword || existing.discoveredKeyword || '',
        approvalStatus: groupData.approvalStatus || existing.approvalStatus || 'auto_approved', // 'auto_approved' | 'requires_review' | 'restricted'
        memberCount: groupData.memberCount !== undefined ? groupData.memberCount : (existing.memberCount || 0),
        privacy: groupData.privacy || existing.privacy || 'Public',
        lastPostedAt: groupData.lastPostedAt || existing.lastPostedAt || null,
        postCount: groupData.postCount !== undefined ? groupData.postCount : (existing.postCount || 0),
        isBlacklisted: groupData.isBlacklisted !== undefined ? groupData.isBlacklisted : (existing.isBlacklisted || false),
        updatedAt: new Date().toISOString()
      };

      groups[key] = updatedGroup;
      await chrome.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
      return updatedGroup;
    },

    /**
     * Updates specific fields of an existing group
     * @param {string} groupId 
     * @param {object} updates 
     * @returns {Promise<object|null>}
     */
    async updateGroup(groupId, updates) {
      const groups = await this.getGroups();
      if (!groups[groupId]) return null;

      groups[groupId] = {
        ...groups[groupId],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await chrome.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
      return groups[groupId];
    },

    /**
     * Toggles the blacklist state of a group
     * @param {string} groupId 
     * @returns {Promise<boolean>}
     */
    async toggleGroupBlacklist(groupId) {
      const groups = await this.getGroups();
      if (!groups[groupId]) return false;

      groups[groupId].isBlacklisted = !groups[groupId].isBlacklisted;
      groups[groupId].updatedAt = new Date().toISOString();
      await chrome.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });

      const status = groups[groupId].isBlacklisted ? 'blacklisted' : 'whitelisted';
      await this.appendLog(`Group "${groups[groupId].groupName}" marked as ${status}.`, 'info');
      return groups[groupId].isBlacklisted;
    },

    /**
     * Removes a group from storage
     * @param {string} groupId 
     */
    async deleteGroup(groupId) {
      const groups = await this.getGroups();
      if (groups[groupId]) {
        const name = groups[groupId].groupName;
        delete groups[groupId];
        await chrome.storage.local.set({ [STORAGE_KEYS.GROUPS]: groups });
        await this.appendLog(`Group "${name}" deleted.`, 'info');
      }
    },

    /**
     * Clears all groups
     */
    async clearGroups() {
      await chrome.storage.local.set({ [STORAGE_KEYS.GROUPS]: {} });
      await this.appendLog('All saved groups cleared.', 'warn');
    },

    /**
     * Appends an audit log message (capped at 100 recent entries)
     * @param {string} message 
     * @param {'info'|'success'|'warn'|'error'} level 
     */
    async appendLog(message, level = 'info') {
      try {
        const result = await chrome.storage.local.get(STORAGE_KEYS.LOGS);
        const logs = result[STORAGE_KEYS.LOGS] || [];

        const newLog = {
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          timestamp: new Date().toISOString(),
          message,
          level
        };

        logs.unshift(newLog); // prepend so newest is first
        const trimmed = logs.slice(0, 100);

        await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: trimmed });
        return newLog;
      } catch (err) {
        console.error('Failed to append log:', err);
      }
    },

    /**
     * Retrieves all operational logs
     * @returns {Promise<Array>}
     */
    async getLogs() {
      const result = await chrome.storage.local.get(STORAGE_KEYS.LOGS);
      return result[STORAGE_KEYS.LOGS] || [];
    },

    /**
     * Clears logs
     */
    async clearLogs() {
      await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: [] });
    }
  };

  root.StorageUtil = StorageUtil;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageUtil;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
