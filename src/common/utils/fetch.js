// Fetch utilities for Royal Road pages

import { log } from '../logging/core.js';
import { parseFictionDetails } from './fictionDetails.js';

const logger = log.scope('fetch');

/**
 * Delay helper for backoff
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff retry
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} maxRetries - Max retry attempts (default 3)
 * @param {number} baseDelay - Base delay in ms (default 1000)
 * @returns {Promise<Response>} Fetch response
 */
async function fetchWithRetry(url, options = {}, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on rate limiting (429) or server errors (5xx)
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (attempt < maxRetries) {
          const delayMs = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
          logger.warn(`Rate limited or server error, retrying in ${delayMs}ms`, {
            url, status: response.status, attempt: attempt + 1
          });
          await delay(delayMs);
          continue;
        }
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delayMs = baseDelay * Math.pow(2, attempt);
        logger.warn(`Fetch failed, retrying in ${delayMs}ms`, {
          url, error: err.message, attempt: attempt + 1
        });
        await delay(delayMs);
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

/**
 * Fetch a Royal Road page and parse as HTML document
 * @param {string} url - URL to fetch
 * @returns {Promise<Document|null>} Parsed document or null on error
 */
export async function fetchPage(url) {
  try {
    logger.debug('Fetching page', { url });
    const response = await fetchWithRetry(url, {
      credentials: 'omit',
      headers: { 'Accept': 'text/html' }
    });

    if (!response.ok) {
      logger.error('Fetch failed', { url, status: response.status });
      return null;
    }

    const html = await response.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  } catch (err) {
    logger.error('Fetch error after retries', { url, error: err.message });
    return null;
  }
}

/**
 * Fetch fiction details from Royal Road
 * @param {string} fictionId - Royal Road fiction ID
 * @returns {Promise<Object|null>} Fiction details or null
 */
export async function fetchFictionDetails(fictionId) {
  const url = `https://www.royalroad.com/fiction/${fictionId}`;
  logger.info('Fetching fiction details', { fictionId });

  try {
    const response = await fetchWithRetry(url, {
      credentials: 'omit',
      headers: { 'Accept': 'text/html' }
    });

    if (!response.ok) {
      logger.error('Fetch failed', { url, status: response.status });
      return null;
    }

    const html = await response.text();
    const { profileId, ...details } = parseFictionDetails(html, fictionId);
    logger.info('Fiction details fetched', { fictionId, fictionTitle: details.fictionTitle, authorName: details.authorName, hasAvatar: !!details.authorAvatar });
    return details;
  } catch (err) {
    logger.error('Fetch error after retries', { url, error: err.message });
    return null;
  }
}
