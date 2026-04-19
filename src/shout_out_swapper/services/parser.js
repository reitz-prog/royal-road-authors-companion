// Shoutout Code Parser Service

import { log } from '../../common/logging/core.js';
import { extractFictionId } from '../../common/utils/html.js';
import { fetchFictionDetails } from '../../common/utils/fetch.js';

const logger = log.scope('parser');

/**
 * Parse shoutout code synchronously (basic extraction)
 * @param {string} code - HTML shoutout code
 * @returns {Object} Basic parsed info
 */
export function parseShoutoutCode(code) {
  const fictionId = extractFictionId(code);
  let fictionUrl = '';
  let coverUrl = '';
  let fictionTitle = '';

  if (fictionId) {
    fictionUrl = `https://www.royalroad.com/fiction/${fictionId}`;
  }

  // Try to extract from the code itself
  const parser = new DOMParser();
  const doc = parser.parseFromString(code, 'text/html');

  // Look for cover image from royalroadcdn (fallback only - fetchFictionDetails gets the real cover)
  const imgs = doc.querySelectorAll('img');
  imgs.forEach(img => {
    const src = img.getAttribute('src') || '';
    if (src.includes('royalroadcdn.com') && src.includes('cover')) {
      coverUrl = src;
    }
  });

  // Look for fiction link text as title - skip image-only links
  const fictionLinks = doc.querySelectorAll('a[href*="/fiction/"]');
  for (const link of fictionLinks) {
    const linkText = link.textContent.trim();
    // Skip empty links or links that only contain whitespace/images
    if (linkText && linkText.length > 2 && linkText.length < 200) {
      fictionTitle = linkText;
      break;
    }
  }

  logger.debug('Parsed shoutout code', { fictionId, fictionTitle });

  return {
    fictionId,
    fictionTitle,
    fictionUrl,
    coverUrl,
    authorName: '',
    authorAvatar: '',
    profileUrl: ''
  };
}

/**
 * Parse shoutout code and fetch full details
 * @param {string} code - HTML shoutout code
 * @returns {Promise<Object>} Full parsed info with fetched details
 */
export async function parseShoutoutCodeAsync(code) {
  const basicInfo = parseShoutoutCode(code);

  if (basicInfo.fictionId) {
    logger.info('Fetching details for fiction', { fictionId: basicInfo.fictionId });
    const details = await fetchFictionDetails(basicInfo.fictionId);
    if (details) {
      return {
        ...basicInfo,
        ...details
      };
    }
  }

  return basicInfo;
}

export default { parseShoutoutCode, parseShoutoutCodeAsync };
