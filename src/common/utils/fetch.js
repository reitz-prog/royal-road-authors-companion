// Fetch utilities for Royal Road pages

import { log } from '../logging/core.js';

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
      credentials: 'include',
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

  const doc = await fetchPage(url);
  if (!doc) return null;

  let fictionTitle = '';
  let coverUrl = '';
  let authorName = '';
  let authorAvatar = '';
  let profileUrl = '';

  // Fiction title - try multiple sources
  const h3Title = doc.querySelector('h3.text-on-surface-strong');
  if (h3Title) {
    fictionTitle = h3Title.textContent.trim();
  }

  if (!fictionTitle) {
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      fictionTitle = ogTitle.getAttribute('content') || '';
      fictionTitle = fictionTitle.replace(/\s*\|\s*Royal Road.*$/i, '').trim();
    }
  }

  if (!fictionTitle) {
    const coverImg = doc.querySelector('img[data-type="cover"]');
    if (coverImg) {
      fictionTitle = (coverImg.getAttribute('alt') || '').trim();
    }
  }

  // Cover image
  const ogImage = doc.querySelector('meta[property="og:image"]');
  if (ogImage) {
    coverUrl = ogImage.getAttribute('content') || '';
  }

  if (!coverUrl) {
    const coverImg = doc.querySelector('img[data-type="cover"]');
    if (coverImg) {
      coverUrl = coverImg.getAttribute('src') || '';
    }
  }

  // Author info from profile links
  const authorLinks = doc.querySelectorAll('a[href*="/profile/"]');
  let profileId = null;

  for (const link of authorLinks) {
    const h4 = link.querySelector('h4.text-on-surface-strong');
    if (h4) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/\/profile\/(\d+)/);
      if (match) {
        profileId = match[1];
        authorName = h4.textContent.trim();
        profileUrl = `https://www.royalroad.com/profile/${profileId}`;
        break;
      }
    }
  }

  // Author avatar
  if (profileId) {
    for (const link of authorLinks) {
      const href = link.getAttribute('href') || '';
      if (href.includes(`/profile/${profileId}`)) {
        const avatarImg = link.querySelector('img[data-type="avatar"]');
        if (avatarImg) {
          authorAvatar = avatarImg.getAttribute('src') || '';
          break;
        }
      }
    }
  }

  // Fallback author name from meta
  if (!authorName) {
    const authorMeta = doc.querySelector('meta[property="books:author"]');
    if (authorMeta) {
      authorName = authorMeta.getAttribute('content') || '';
    }
  }

  logger.info('Fiction details fetched', { fictionId, fictionTitle, authorName });

  return {
    fictionId,
    fictionTitle,
    fictionUrl: url,
    coverUrl,
    authorName,
    authorAvatar,
    profileUrl
  };
}
