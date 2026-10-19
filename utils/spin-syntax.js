/**
 * Spin-Syntax Parser & Generator
 * Supports single-level and nested spintax patterns: {option1|option2|{nested1|nested2}}
 */
(function (root) {
  'use strict';

  const SpinSyntax = {
    /**
     * Resolves a spintax string into one randomized variation.
     * Recursively evaluates innermost brackets first.
     * @param {string} text - The input template containing {A|B|C}
     * @returns {string} - Spun text
     */
    parse(text) {
      if (!text || typeof text !== 'string') return '';
      
      const regex = /\{([^{}]+)\}/g;
      let current = text;
      let iterations = 0;
      const MAX_DEPTH = 20;

      while (regex.test(current) && iterations < MAX_DEPTH) {
        current = current.replace(regex, (match, choices) => {
          const parts = choices.split('|');
          const pick = parts[Math.floor(Math.random() * parts.length)];
          return pick !== undefined ? pick : '';
        });
        iterations++;
      }

      return current;
    },

    /**
     * Generates multiple sample variations of a spintax template for preview.
     * @param {string} text - The spintax template
     * @param {number} count - Number of previews (default: 3)
     * @returns {string[]} - Array of variations
     */
    generatePreviews(text, count = 3) {
      if (!text) return [];
      const samples = new Set();
      const attempts = count * 6; // Allow retries for unique outputs
      
      for (let i = 0; i < attempts && samples.size < count; i++) {
        samples.add(this.parse(text));
      }

      return Array.from(samples);
    },

    /**
     * Calculates the estimated number of distinct combinations in a template.
     * @param {string} text - Spintax template
     * @returns {number} - Total combinations
     */
    countCombinations(text) {
      if (!text || typeof text !== 'string') return 1;
      const regex = /\{([^{}]+)\}/g;
      let count = 1;
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        const parts = match[1].split('|');
        count *= Math.max(1, parts.length);
      }
      return count;
    }
  };

  // Expose to globalThis (works in Service Worker, Window, and Content Script)
  root.SpinSyntax = SpinSyntax;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpinSyntax;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
