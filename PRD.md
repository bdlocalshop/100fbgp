# Product Requirements Document (PRD)

## 1. Overview & Objective
**Product Name:** AutoGroup Poster & Discovery Extension  
**Target Platform:** Google Chrome Extension (Manifest V3)  
**Target Audience:** Community managers, content creators, and marketers managing outreach across Facebook groups.  

### 1.1 Goal
Provide a controlled, browser-based automation tool that identifies relevant Facebook groups with auto-approval post policies, schedules content delivery across rotating keyword topics, and strictly adheres to rate limits to ensure compliance and account health.

---

## 2. Problem Statement
* **Time-Intensive Group Sourcing:** Finding active groups within specific niches that permit instant posting (rather than requiring admin pre-moderation) is manual and slow.
* **Account Safety Risks:** Repetitive or rapid posting actions easily trigger platform anti-spam mechanisms, leading to temporary action blocks or account restrictions.
* **Repetition & Spam Perception:** Posting identical copy to the same groups repeatedly degrades engagement and increases spam reports.

---

## 3. System Architecture & Components

```
+-------------------------------------------------------------+
| Chrome Extension (Manifest V3)                              |
|                                                             |
|  +-----------------------+     +--------------------------+ |
|  | Popup / Side Panel UI | <-> | Service Worker (BG)      | |
|  | - Queue Configuration |     | - Task Scheduling/Alarms | |
|  | - Quota Controls      |     | - Rate-Limit Engine      | |
|  | - Log Viewer          |     | - Local State Machine    | |
|  +-----------------------+     +--------------------------+ |
|                                              ^              |
|                                              |              |
|                                              v              |
|                                +--------------------------+ |
|                                | Content Script           | |
|                                | - Page Automation        | |
|                                | - Feed / Modal Observers | |
|                                | - Status Detection       | |
|                                +--------------------------+ |
+-------------------------------------------------------------+
                               |
                               v
               chrome.storage.local (Group DB, Logs)
```

1. **Popup / Side Panel Interface:** Provides controls for keywords, content templates, rate-limiting parameters, and operational status logs.
2. **Background Service Worker (`chrome.alarms`):** Acts as the central scheduler and state controller. Maintains timing delays, execution queues, and daily resets.
3. **Content Script:** Injected strictly into active Facebook tabs to read search results, interact with post creation modals, and inspect submission responses.
4. **Local Storage Engine (`chrome.storage.local`):** Persists discovered groups, post history, daily usage counters, and rotation pointers without requiring external servers.

---

## 4. Functional Specifications

### 4.1 Keyword-Based Group Discovery
* **Search Execution:** Formulates queries matching user-defined keyword sets (e.g., `facebook.com/groups/search/groups/?q={keyword}`).
* **Eligibility & Auto-Approval Detection:**
  * Checks group visibility (Public vs. Private).
  * Evaluates post creator interface state (checking for the presence of "Submit for admin review" indicators vs. standard instant "Post" states).
  * Categorizes groups: `auto_approved`, `requires_review`, or `restricted`.
* **Keyword Rotation:**
  * Supports multiple keyword lists mapped to distinct days or run sequences.
  * Ensures queries alternate systematically to broaden coverage and prevent duplicate result processing.

### 4.2 Automated Content Publishing
* **Content Templates:**
  * Supports multiple post variations.
  * Supports basic Spin-Syntax (e.g., `{Hello|Hi|Greetings} fellow members...`) to introduce structural variation across submissions.
* **Humanized Execution:**
  * Inserts randomized delays (e.g., 60–180 seconds) between actions.
  * Simulates natural input events (`input`, `change`, `keydown`) during composition rather than instant mass text injection.
* **Verification & Categorization:**
  * Monitors post-submission notifications or feed mutations.
  * If a submission transitions to "Pending approval", updates the group's record to `requires_review` and removes it from the automated queue.

### 4.3 Safety Controls & Quota Management
* **Daily Quota Enforcement:**
  * Maximum Group Searches per Day (default: 20).
  * Maximum Post Submissions per Day (default: 10).
  * Minimum / Maximum randomized cooldowns between tasks.
* **Circuit Breakers:**
  * Detects security checkpoints, CAPTCHAs, or rate-limit modals ("You're temporarily blocked...").
  * Automatically aborts running queues and triggers a browser notification warning the user to pause activity.

---

## 5. Data Schemas (`chrome.storage.local`)

### 5.1 Group Record Schema
```json
{
  "groupId": "104928172839",
  "groupName": "E-Commerce Entrepreneurs",
  "groupUrl": "https://facebook.com/groups/104928172839/",
  "discoveredKeyword": "dropshipping tools",
  "approvalStatus": "auto_approved",
  "memberCount": 18500,
  "lastPostedAt": "2026-10-18T06:00:00Z",
  "postCount": 2,
  "isBlacklisted": false
}
```

### 5.2 Campaign & Rate Limit Schema
```json
{
  "activeCampaignId": "camp_alpha",
  "keywords": [
    "ecommerce tips",
    "shopify owners",
    "digital marketing hacks"
  ],
  "activeKeywordIndex": 0,
  "rateLimits": {
    "maxSearchesDaily": 25,
    "maxPostsDaily": 12,
    "minDelaySeconds": 60,
    "maxDelaySeconds": 180
  },
  "usageToday": {
    "dateString": "2026-10-18",
    "searchesConducted": 6,
    "postsCompleted": 3
  }
}
```

---

## 6. User Interface Requirements

* **Dashboard View:**
  * Summary metrics: posts completed today, searches conducted, and remaining quota.
  * Master toggle: Start Queue / Pause Queue / Emergency Stop.
* **Group Management:**
  * Table view listing discovered groups with filter toggles (`Auto-Approved`, `Pending Review`, `Blacklisted`).
  * Manual override buttons to add or exclude groups.
* **Content & Settings:**
  * Text area supporting dynamic tokens and spin-syntax preview.
  * Input fields for daily limit quotas and randomized cooldown intervals.
* **Audit Log:**
  * Real-time console log tracking extension activity, timestamps, and error responses.

---

## 7. Implementation Roadmap

1. **Milestone 1: Project Setup & Discovery Logic**
   * Initialize Manifest V3 configuration with appropriate permissions (`storage`, `alarms`, `notifications`, `activeTab`).
   * Implement search navigation and group metadata extraction content scripts.
2. **Milestone 2: Post Composition & Feedback Observer**
   * Build post modal automation with realistic timing variations.
   * Add post-submission DOM observers to differentiate instant publishing from pending moderation.
3. **Milestone 3: Queue Management & Safety System**
   * Implement background task orchestrator and storage sync.
   * Add hard limits, midnight resets, and rate-limit detection circuit breakers.
4. **Milestone 4: UI Development & Validation**
   * Finalize the extension Side Panel interface.
   * Conduct manual validation on test groups to verify DOM resilience and timeout handling.