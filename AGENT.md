# AI Agent Build Instructions: Facebook Group Automation Extension

## 1. Role & Mission
You are an expert browser extension developer implementing a Manifest V3 Chrome Extension based on `PRD.md`. Your task is to implement the extension step-by-step using modern JavaScript, strictly adhering to Chrome Extension Manifest V3 standards, local storage persistence, and robust error-handling.

---

## 2. Core Architecture Guidelines
* **Manifest Version:** Chrome Manifest V3 only.
* **Component Separation:**
  * `manifest.json`: Minimal required permissions (`storage`, `alarms`, `notifications`, `activeTab`, `scripting`).
  * `background/service-worker.js`: Central state machine and scheduler using `chrome.alarms` (do not rely on persistent in-memory global variables, as service workers terminate when idle).
  * `content-scripts/fb-scanner.js`: DOM observer and content script injected into Facebook tabs to extract group search results and posting interfaces.
  * `popup/` or `sidepanel/`: Clean user interface (HTML/JS/CSS) displaying daily quotas, keyword pools, and logs.
  * `utils/storage.js`: Strongly-typed helper wrapper around `chrome.storage.local`.

---

## 3. Strict Development Rules for AI Agents

1. **State Persistence:**
   * Always write runtime counters (searches today, posts submitted today, last active date) to `chrome.storage.local`.
   * On service worker startup, always rehydrate state from storage.

2. **DOM Selector Resilience:**
   * Facebook frequently obfuscates class names. Rely on accessible ARIA roles and labels (e.g., `[role="dialog"]`, `div[aria-label="Write a post..."]`, `div[role="feed"]`) rather than auto-generated CSS class hashes.
   * Wrap all DOM extraction calls in safe query utilities with timeout fallbacks to prevent script halting.

3. **Rate Limiting & Safety Guardrails:**
   * Implement a centralized queue worker with randomized jitter:
     $$Delay = \text{minDelay} + \text{Math.random()} \times (\text{maxDelay} - \text{minDelay})$$
   * Check daily quotas before triggering any search or post action. If `usageToday.postsCompleted >= rateLimits.maxPostsDaily`, pause execution until the next local calendar day.
   * If any DOM feedback indicates an action block or checkpoint, trigger an immediate halt event and persist `status: "paused_safety"` to storage.

4. **Spin-Syntax Parser:**
   * Implement a recursive or regex-based spinning function to process templates like `{Hi|Hello} {there|friend}` before populating content.

---

## 4. Step-by-Step Implementation Plan

### Step 1: Manifest & Directory Setup
Set up the project folder with the following directory tree:
```text
fb-group-poster/
├── manifest.json
├── PRD.md
├── AGENT.md
├── background/
│   └── service-worker.js
├── content-scripts/
│   ├── dom-helpers.js
│   └── fb-scanner.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── utils/
    ├── storage.js
    └── spin-syntax.js
```

### Step 2: Storage & State Management Layer (`utils/storage.js`)
* Implement functions:
  * `getCampaignState()`: Retrieves campaign settings and current daily limits.
  * `updateDailyUsage(type)`: Increments `postsCompleted` or `searchesConducted`. Resets counters if the calendar date has changed.
  * `saveDiscoveredGroup(groupData)`: Upserts a group record into the local group dictionary.
  * `appendLog(message, level)`: Keeps an operational log of the last 100 actions for debugging.

### Step 3: Background Scheduler (`background/service-worker.js`)
* Register alarm listener (`chrome.alarms.onAlarm`).
* Set up a job dispatcher:
  * Check daily limits.
  * Pick the next group or keyword from the active rotation list.
  * Send messaging payload to content script via `chrome.tabs.sendMessage`.

### Step 4: Content Script Automation (`content-scripts/fb-scanner.js`)
* Group Discovery: Read search result elements, identify group URL, title, and public/private badges.
* Post Submission:
  * Locate post creation trigger.
  * Input processed spin-syntax text using synthetic input events.
  * Check for pre-moderation notice ("Submitted for admin review").
  * Send execution report back to background worker.

### Step 5: Side Panel / Popup UI (`popup/`)
* Build status dashboard showing:
  * Active status toggle (Running / Paused).
  * Today's progress: `Searches: X / Max`, `Posts: Y / Max`.
  * Group list with manual whitelist/blacklist controls.
  * Activity feed log.