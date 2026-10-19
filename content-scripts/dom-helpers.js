/**
 * DOM Helpers for Facebook Automation
 * Resilient against obfuscated class names by relying on ARIA roles, labels, text content, and humanized inputs.
 */
(function (root) {
  'use strict';

  const DomHelpers = {
    /**
     * Pauses execution for a specified duration in milliseconds.
     * @param {number} ms 
     * @returns {Promise<void>}
     */
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Randomized sleep between min and max milliseconds.
     */
    async randomDelay(minMs = 1000, maxMs = 3000) {
      const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));
      await this.sleep(delay);
    },

    /**
     * Queries the first element matching any of the provided selectors.
     * @param {string[]|string} selectors 
     * @param {Element|Document} root 
     * @returns {Element|null}
     */
    queryFirst(selectors, root = document) {
      const list = Array.isArray(selectors) ? selectors : [selectors];
      for (const sel of list) {
        try {
          const el = root.querySelector(sel);
          if (el) return el;
        } catch (e) {
          // Ignore invalid selector syntax in fallbacks
        }
      }
      return null;
    },

    /**
     * Finds an element by matching its text content or aria-label against a regex or string.
     * @param {string} selector 
     * @param {RegExp|string} pattern 
     * @param {Element|Document} root 
     * @returns {Element|null}
     */
    findByText(selector, pattern, root = document) {
      const elements = root.querySelectorAll(selector);
      for (const el of elements) {
        const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
        if (pattern instanceof RegExp) {
          if (pattern.test(text)) return el;
        } else if (text.toLowerCase().includes(pattern.toLowerCase())) {
          return el;
        }
      }
      return null;
    },

    /**
     * Waits for an element matching any of the selectors to appear in the DOM.
     * @param {string[]|string} selectors 
     * @param {number} timeoutMs 
     * @param {Element|Document} root 
     * @returns {Promise<Element>}
     */
    waitForElement(selectors, timeoutMs = 8000, root = document) {
      return new Promise((resolve, reject) => {
        const existing = this.queryFirst(selectors, root);
        if (existing) {
          return resolve(existing);
        }

        const list = Array.isArray(selectors) ? selectors : [selectors];
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Timeout (${timeoutMs}ms) waiting for: ${list.join(', ')}`));
        }, timeoutMs);

        const observer = new MutationObserver(() => {
          const match = this.queryFirst(list, root);
          if (match) {
            clearTimeout(timer);
            observer.disconnect();
            resolve(match);
          }
        });

        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });
      });
    },

    /**
     * Simulates natural human click with pointer/mouse events.
     * @param {Element} element 
     */
    async simulateClick(element) {
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.sleep(300);

      const events = ['pointerover', 'pointerenter', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
      for (const eventName of events) {
        const evt = new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          view: window,
          buttons: 1
        });
        element.dispatchEvent(evt);
        await this.sleep(20 + Math.random() * 30);
      }
    },

    /**
     * Inserts text into Facebook's rich text editor (Lexical / DraftJS / contenteditable)
     * using humanized input events and document.execCommand fallback.
     * @param {Element} editorElement 
     * @param {string} text 
     */
    async simulateInput(editorElement, text) {
      if (!editorElement) throw new Error('Editor element not found');

      editorElement.focus();
      await this.sleep(200);

      // Select all existing text if any to clear
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editorElement);
      sel.removeAllRanges();
      sel.addRange(range);

      await this.sleep(100);

      // Try execCommand first (most reliable for contenteditable and DraftJS/Lexical undo stack)
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch (err) {
        inserted = false;
      }

      if (!inserted) {
        // Fallback for newer Lexical setups
        try {
          const beforeInputEvent = new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text
          });
          editorElement.dispatchEvent(beforeInputEvent);

          editorElement.textContent = text;

          const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text
          });
          editorElement.dispatchEvent(inputEvent);
        } catch (e) {
          editorElement.innerText = text;
          editorElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      // Fire keyboard and input events to ensure Facebook registers text changes
      editorElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
      editorElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
      editorElement.dispatchEvent(new Event('change', { bubbles: true }));

      await this.sleep(400);
    },

    /**
     * Parses numeric counts from Facebook strings (e.g., "14.2K members", "1.5M members", "320 members")
     * @param {string} rawString 
     * @returns {number}
     */
    parseMemberCount(rawString) {
      if (!rawString) return 0;
      const clean = rawString.toUpperCase().replace(/,/g, '');
      const match = clean.match(/([\d.]+)\s*([KM])?/);
      if (!match) return 0;

      const num = parseFloat(match[1]);
      const multiplier = match[2];

      if (multiplier === 'K') return Math.round(num * 1000);
      if (multiplier === 'M') return Math.round(num * 1000000);
      return Math.round(num);
    },

    /**
     * Checks if current page is displaying Facebook security checkpoints or action block modals.
     * @returns {boolean}
     */
    detectSecurityCheckpoint() {
      const bodyText = document.body ? document.body.innerText : '';
      const flags = [
        "you're temporarily blocked",
        "temporarily blocked from performing this action",
        "action blocked",
        "security check",
        "confirm your identity",
        "try again later",
        "we restrict certain activity to protect our community"
      ];

      const lower = bodyText.toLowerCase();
      for (const flag of flags) {
        if (lower.includes(flag)) {
          return true;
        }
      }

      // Check for security dialogs
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        const dialogText = (dialog.innerText || '').toLowerCase();
        for (const flag of flags) {
          if (dialogText.includes(flag)) {
            return true;
          }
        }
      }

      return false;
    }
  };

  root.DomHelpers = DomHelpers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DomHelpers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
