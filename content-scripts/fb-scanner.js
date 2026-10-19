/**
 * Facebook Content Script: Group Discovery & Post Automation
 * Handles DOM scraping on group search pages and automated post creation on group feeds.
 */
(function () {
  'use strict';

  console.log('[FB Group Assistant] Content script initialized on:', window.location.href);

  // Communication message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        // Immediate security check
        if (DomHelpers.detectSecurityCheckpoint()) {
          console.warn('[FB Group Assistant] Security checkpoint detected!');
          chrome.runtime.sendMessage({
            action: 'SAFETY_HALT',
            reason: 'Security checkpoint or action block detected on page.'
          });
          sendResponse({ success: false, error: 'Security checkpoint triggered.' });
          return;
        }

        switch (message.action) {
          case 'PING':
            sendResponse({ success: true, url: window.location.href });
            break;

          case 'SCAN_SEARCH_GROUPS':
            const groups = await scanSearchGroups(message.keyword || '');
            sendResponse({ success: true, count: groups.length, groups });
            break;

          case 'INSPECT_CURRENT_GROUP':
            const groupInfo = await inspectCurrentGroup();
            sendResponse({ success: true, groupInfo });
            break;

          case 'CREATE_POST':
            const postResult = await executeGroupPost(message.template, message.groupId);
            sendResponse(postResult);
            break;

          default:
            sendResponse({ success: false, error: 'Unknown action: ' + message.action });
        }
      } catch (err) {
        console.error('[FB Group Assistant] Content script error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // Keep message channel open for async response
  });

  /**
   * Scrapes group cards from a Facebook group search results page.
   * Target URL: facebook.com/groups/search/groups/?q=...
   */
  async function scanSearchGroups(keyword) {
    console.log('[FB Group Assistant] Scanning groups for keyword:', keyword);
    await DomHelpers.sleep(1500);

    // Scroll down slightly to trigger lazy-load if needed
    window.scrollBy({ top: 400, behavior: 'smooth' });
    await DomHelpers.sleep(1200);

    const discovered = [];
    const seenUrls = new Set();

    // Group links typically contain '/groups/' but exclude generic tabs
    const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));

    for (const link of links) {
      const href = link.href.split('?')[0]; // Clean query params
      const match = href.match(/https:\/\/(?:www\.)?facebook\.com\/groups\/([^/]+)/);

      if (!match) continue;
      const groupSlug = match[1];

      // Exclude generic Facebook group system routes
      if (['search', 'feed', 'discover', 'joins', 'create'].includes(groupSlug.toLowerCase())) {
        continue;
      }

      if (seenUrls.has(href)) continue;
      seenUrls.add(href);

      // Locate parent card container
      const card = link.closest('div[role="feed"] > div') || link.closest('div[class*="x1"]') || link.parentElement?.parentElement;
      const cardText = card ? (card.innerText || '') : '';

      // Extract title
      let title = (link.innerText || '').trim();
      if (!title && card) {
        const heading = card.querySelector('h2, h3, [role="heading"], strong');
        if (heading) title = (heading.innerText || '').trim();
      }
      if (!title) title = groupSlug;

      // Extract privacy (Public vs Private)
      let privacy = 'Public';
      if (/private/i.test(cardText)) {
        privacy = 'Private';
      }

      // Extract member count
      let memberCount = 0;
      const memberMatch = cardText.match(/([\d.]+[KM]?)\s+members/i);
      if (memberMatch) {
        memberCount = DomHelpers.parseMemberCount(memberMatch[1]);
      }

      const groupRecord = {
        groupId: groupSlug,
        groupName: title.replace(/\n+/g, ' ').substring(0, 80),
        groupUrl: href.endsWith('/') ? href : href + '/',
        discoveredKeyword: keyword,
        approvalStatus: 'auto_approved', // default initial hypothesis, verified on visit/post
        memberCount,
        privacy,
        isBlacklisted: false
      };

      discovered.push(groupRecord);

      // Save to storage
      if (window.StorageUtil) {
        await window.StorageUtil.saveDiscoveredGroup(groupRecord);
      }
    }

    if (window.StorageUtil) {
      await window.StorageUtil.appendLog(
        `Discovery scan completed: ${discovered.length} groups found for keyword "${keyword}".`,
        'success'
      );
    }

    console.log(`[FB Group Assistant] Extracted ${discovered.length} groups from search page.`);
    return discovered;
  }

  /**
   * Inspects current Facebook group page to extract exact metadata and posting status.
   */
  async function inspectCurrentGroup() {
    const url = window.location.href;
    const match = url.match(/facebook\.com\/groups\/([^/?]+)/);
    const groupId = match ? match[1] : 'unknown';

    // Group name from H1 or document title
    const h1 = document.querySelector('h1');
    const groupName = h1 ? h1.innerText.trim() : document.title.replace(/\|.*Facebook/i, '').trim();

    // Check privacy & members
    const bodyText = document.body ? document.body.innerText : '';
    let privacy = 'Public';
    if (/private group/i.test(bodyText)) privacy = 'Private';

    let memberCount = 0;
    const memberMatch = bodyText.match(/([\d.]+[KM]?)\s+members/i);
    if (memberMatch) {
      memberCount = DomHelpers.parseMemberCount(memberMatch[1]);
    }

    const info = {
      groupId,
      groupName,
      groupUrl: `https://www.facebook.com/groups/${groupId}/`,
      privacy,
      memberCount
    };

    if (window.StorageUtil) {
      await window.StorageUtil.saveDiscoveredGroup(info);
    }

    return info;
  }

  /**
   * Executes post submission on a Facebook group feed.
   * Handles modal triggering, text composition via spin-syntax, pre-moderation checks, and submit actions.
   */
  async function executeGroupPost(template, targetGroupId) {
    console.log('[FB Group Assistant] Starting post composition...');
    
    // Safety checkpoint check
    if (DomHelpers.detectSecurityCheckpoint()) {
      chrome.runtime.sendMessage({ action: 'SAFETY_HALT', reason: 'Security checkpoint before post creation.' });
      return { success: false, error: 'Security checkpoint triggered.' };
    }

    // Step 1: Spin content
    let postText = template;
    if (window.SpinSyntax) {
      postText = window.SpinSyntax.parse(template);
    }

    // Step 2: Locate post creation trigger button
    // Facebook uses "Write something...", "Create a public post...", or aria-label containing "Write a post"
    const triggerSelectors = [
      'div[aria-label*="Write a post"]',
      'div[aria-label*="Write something"]',
      'div[aria-label*="Create a post"]',
      'div[aria-label*="Create a public post"]',
      'span[dir="auto"]'
    ];

    let trigger = null;
    // Look specifically for buttons or interactive divs with post trigger text
    const interactive = Array.from(document.querySelectorAll('div[role="button"], span[dir="auto"]'));
    for (const el of interactive) {
      const text = (el.innerText || el.getAttribute('aria-label') || '').trim();
      if (/write something|create a public post|create a post|what's on your mind/i.test(text)) {
        trigger = el;
        break;
      }
    }

    if (!trigger) {
      trigger = DomHelpers.queryFirst(triggerSelectors);
    }

    if (!trigger) {
      return {
        success: false,
        error: 'Could not find "Write a post" trigger on current group page. Ensure you have joined the group or are logged in.'
      };
    }

    // Click trigger to open modal
    await DomHelpers.simulateClick(trigger);
    await DomHelpers.sleep(1800);

    // Step 3: Wait for dialog modal
    let dialog = null;
    try {
      dialog = await DomHelpers.waitForElement(['div[role="dialog"]', 'div[aria-label*="Create a post"]'], 6000);
    } catch (e) {
      return { success: false, error: 'Create post modal failed to open.' };
    }

    // Step 4: Locate contenteditable textbox
    const editorSelectors = [
      'div[role="textbox"][contenteditable="true"]',
      'div[aria-label*="Write something"]',
      'div[aria-label*="Create a public post"]',
      'div[data-lexical-editor="true"]'
    ];

    const editor = DomHelpers.queryFirst(editorSelectors, dialog);
    if (!editor) {
      return { success: false, error: 'Post editor textbox not found in dialog.' };
    }

    // Humanized input simulation
    console.log('[FB Group Assistant] Typing post content...');
    await DomHelpers.simulateInput(editor, postText);
    await DomHelpers.sleep(1200);

    // Step 5: Check for pre-moderation notices in dialog before posting
    const dialogText = (dialog.innerText || '').toLowerCase();
    const isPreModerated = /submit for admin review|sent for approval|admin approval required|pending approval/i.test(dialogText);

    // Step 6: Find Post / Submit button
    // Usually a button or div[role="button"] with text "Post" or aria-label="Post"
    const submitCandidates = Array.from(dialog.querySelectorAll('div[role="button"], button'));
    let submitBtn = null;

    for (const btn of submitCandidates) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const txt = (btn.innerText || '').trim().toLowerCase();
      if (aria === 'post' || aria === 'submit' || txt === 'post' || txt === 'submit') {
        // Ensure button is not disabled
        const ariaDisabled = btn.getAttribute('aria-disabled');
        if (ariaDisabled !== 'true' && !btn.disabled) {
          submitBtn = btn;
          break;
        }
      }
    }

    if (!submitBtn) {
      return { success: false, error: 'Submit/Post button not clickable or disabled.' };
    }

    console.log('[FB Group Assistant] Submitting post...');
    await DomHelpers.simulateClick(submitBtn);
    await DomHelpers.sleep(2500);

    // Step 7: Evaluate submission response & update status
    let approvalStatus = isPreModerated ? 'requires_review' : 'auto_approved';

    // Check for post-submission toast notifications
    const pageText = (document.body ? document.body.innerText : '').toLowerCase();
    if (/submitted to admins for approval|pending admin approval|your post is pending/i.test(pageText)) {
      approvalStatus = 'requires_review';
    }

    const currentUrl = window.location.href;
    const match = currentUrl.match(/facebook\.com\/groups\/([^/?]+)/);
    const resolvedGroupId = targetGroupId || (match ? match[1] : 'unknown');

    // Update storage record
    if (window.StorageUtil) {
      await window.StorageUtil.updateGroup(resolvedGroupId, {
        approvalStatus,
        lastPostedAt: new Date().toISOString(),
        postCount: 1
      });
      await window.StorageUtil.updateDailyUsage('postsCompleted');
      await window.StorageUtil.appendLog(
        `Post submitted to group "${resolvedGroupId}". Status: ${approvalStatus}.`,
        approvalStatus === 'auto_approved' ? 'success' : 'warn'
      );
    }

    // Notify background worker
    chrome.runtime.sendMessage({
      action: 'POST_COMPLETED',
      groupId: resolvedGroupId,
      approvalStatus,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      groupId: resolvedGroupId,
      approvalStatus,
      postSnippet: postText.substring(0, 60) + '...'
    };
  }
})();
