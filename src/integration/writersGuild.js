// Writers Guild Integration Service
import { log } from '../common/logging/core.js';
import { parseShoutoutCodeAsync } from '../shout_out_swapper/services/parser.js';
import * as db from '../common/db/proxy.js';

const logger = log.scope('writers-guild');

/**
 * Fetch the Writers Guild dashboard HTML via background script
 * @returns {Promise<string>} Dashboard HTML
 */
async function fetchWritersGuildDashboard() {
  logger.info('Fetching Writers Guild dashboard via background');

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'fetchWritersGuild' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success) {
        resolve(response.html);
      } else {
        reject(new Error(response?.error || 'Failed to fetch Writers Guild dashboard'));
      }
    });
  });
}

/**
 * Decode HTML entities in a string
 * @param {string} text - Text with HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Parse scheduled shoutouts from dashboard HTML
 * @param {string} html - Dashboard HTML
 * @returns {Array<{date: string, code: string}>} Parsed entries
 */
export function parseScheduledShoutouts(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const entries = [];

  // Find all shoutout card containers - look for the date element and work up
  const dateElements = doc.querySelectorAll('.font-mono');

  for (const dateEl of dateElements) {
    const date = dateEl.textContent?.trim();

    // Skip if not a date format
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    // Find the parent card container
    let card = dateEl.closest('.rounded-lg');
    if (!card) continue;

    // Get code from the code display area (look for the pre-formatted code block)
    const codeEl = card.querySelector('.font-mono.text-xs, [class*="bg-neutral-50"], [class*="bg-neutral-950"]');

    // Skip the date element itself
    if (codeEl === dateEl) {
      // Try to find another element
      const allCodeEls = card.querySelectorAll('.font-mono');
      for (const el of allCodeEls) {
        if (el !== dateEl && el.textContent?.includes('<')) {
          let code = el.textContent?.trim();
          if (code) {
            code = decodeHtmlEntities(code);
            entries.push({ date, code });
            logger.debug('Found shoutout entry', { date });
          }
          break;
        }
      }
    } else if (codeEl) {
      let code = codeEl.textContent?.trim();
      if (code && code.includes('<')) {
        code = decodeHtmlEntities(code);
        entries.push({ date, code });
        logger.debug('Found shoutout entry', { date });
      }
    }
  }

  logger.info(`Parsed ${entries.length} shoutout entries`);
  return entries;
}

/**
 * Import shoutouts from Writers Guild into the extension
 * @param {string} currentFictionId - The fiction to schedule shoutouts for
 * @returns {Promise<{imported: number, skipped: number, errors: string[]}>}
 */
export async function importFromWritersGuild(currentFictionId) {
  const result = { imported: 0, skipped: 0, errors: [] };

  try {
    // Fetch and parse dashboard
    const html = await fetchWritersGuildDashboard();
    const entries = parseScheduledShoutouts(html);

    if (entries.length === 0) {
      result.errors.push('No scheduled shoutouts found on Writers Guild dashboard');
      return result;
    }

    // Get existing shoutouts to check for duplicates
    const existingShoutouts = await db.getAll('shoutouts');

    for (const entry of entries) {
      try {
        // Parse the shoutout code to get fiction details
        const parsed = await parseShoutoutCodeAsync(entry.code);

        if (!parsed.fictionId) {
          result.errors.push(`Could not parse fiction ID for entry on ${entry.date}`);
          result.skipped++;
          continue;
        }

        // Check if this shoutout already exists (same fictionId and date)
        const isDuplicate = existingShoutouts.some(s =>
          s.fictionId === parsed.fictionId &&
          s.schedules?.some(sch => sch.date === entry.date)
        );

        if (isDuplicate) {
          logger.debug('Skipping duplicate shoutout', { fictionId: parsed.fictionId, date: entry.date });
          result.skipped++;
          continue;
        }

        // Create new shoutout
        const shoutout = {
          code: entry.code,
          fictionId: parsed.fictionId,
          fictionTitle: parsed.fictionTitle,
          fictionUrl: parsed.fictionUrl,
          coverUrl: parsed.coverUrl,
          authorName: parsed.authorName,
          authorAvatar: parsed.authorAvatar,
          profileUrl: parsed.profileUrl,
          schedules: [{
            fictionId: currentFictionId,
            date: entry.date,
            chapter: null,
            chapterUrl: null
          }],
          expectedReturnDate: null,
          swappedDate: null,
          swappedChapter: null,
          swappedChapterUrl: null,
          lastSwapScanDate: null
        };

        await db.save('shoutouts', shoutout);
        result.imported++;
        logger.info('Imported shoutout', { fictionId: parsed.fictionId, date: entry.date });

      } catch (err) {
        logger.error('Error importing entry', err);
        result.errors.push(`Error importing entry for ${entry.date}: ${err.message}`);
        result.skipped++;
      }
    }

  } catch (err) {
    logger.error('Failed to import from Writers Guild', err);
    result.errors.push(err.message);
  }

  return result;
}

export default { parseScheduledShoutouts, importFromWritersGuild };
