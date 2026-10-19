# Chrome Web Store Listing & Compliance Document

## 1. Extension Metadata

* **Name:** Group Discovery & Posting Assistant
* **Version:** 1.0.0
* **Category:** Productivity / Social & Communication
* **Language:** English (United States)
* **Single Purpose:** Streamlines community management and discovery across Facebook groups with scheduled content delivery, spintax variations, and automated daily rate limiting.

---

## 2. Store Listing Copy

### 2.1 Short Description (max 132 chars)
> Discover active Facebook groups, preview spintax post variations, schedule content queues, and track daily quota limits safely.

### 2.2 Detailed Description
Group Discovery & Posting Assistant helps community managers, independent creators, and marketers organize and manage outreach across Facebook groups with built-in safety controls.

**Key Features:**

* **Smart Group Discovery:** Search and catalog relevant groups based on your target keywords. Automatically identifies public/private statuses and group member counts.
* **Auto-Approval Detection:** Distinguishes between groups with instant post approvals and those requiring manual administrator review.
* **Dynamic Content Templates:** Write post templates with Spin-Syntax `{like|this|example}` to ensure natural message variety across submissions. Test and preview variations in real time before publishing.
* **Intelligent Rate Limiting & Cooldowns:** Protect your account with daily caps on searches and posts, plus randomized jitter delays between tasks to simulate natural browsing habits.
* **Safety Circuit Breaker:** Instantly halts queue operations if platform rate-limit alerts or security checkpoints are encountered.
* **Privacy First:** 100% local. Your keywords, templates, groups list, and operational logs are stored directly on your machine in local extension storage. No third-party servers, tracking scripts, or external data collection.

---

## 3. Permissions Justification

Every permission declared in `manifest.json` is strictly necessary to deliver the extension's core functionality:

| Permission | Scope & Purpose |
| :--- | :--- |
| `storage` | Required to store discovered group records, campaign keywords, post templates, rate limit configurations, and operational audit logs locally on the user's browser without requiring an external database. |
| `alarms` | Required to schedule queue intervals, randomized delays, and daily quota resets without running continuous high-CPU background loops. |
| `notifications` | Required to send desktop alerts when safety circuit breakers trip (e.g., action block warnings) or when daily quotas are reached. |
| `activeTab` | Required to read and interact with the user's active Facebook tab when initiating manual group scans or manual post previews. |
| `scripting` | Required to inject automation listeners and DOM helpers for group discovery and post modal interaction on Facebook tabs. |
| `tabs` | Required to check if open tabs are navigating Facebook group pages and coordinate automated queue tasks safely. |
| `host_permissions` (`https://*.facebook.com/*`) | Required to read group search results and interact with post creation modals on Facebook web pages. Scoped strictly to Facebook domains. |

---

## 4. Privacy & Data Use Disclosure

* **Data Collection:** The extension collects **NO personal data**, credentials, cookies, or browsing history.
* **Data Transmission:** **NO data is transmitted to external servers**. All group records, keywords, and logs reside solely within `chrome.storage.local`.
* **Account Security:** The extension does not store passwords or session tokens; it operates purely as an in-browser assistant within the user's existing logged-in session.

---

## 5. Version History

### Version 1.0.0 (2026-10-18)
* Initial release adhering to Manifest V3 standards.
* Implemented keyword-based group discovery and member count parser.
* Built post modal composition engine with synthetic input simulation.
* Implemented spintax parser with live variation previewer.
* Added randomized jitter scheduler via `chrome.alarms` and daily quota management.
* Added safety circuit breaker for security checkpoints.
* Built comprehensive tabbed dashboard interface (Dashboard, Campaign, Groups, Settings, Logs).
