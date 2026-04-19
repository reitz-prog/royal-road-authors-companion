// MyFictions sync service
// Fetches user's fictions from the author-dashboard and syncs to IndexedDB

import * as db from '../../common/db/proxy.js';
import { log } from '../../common/logging/core.js';

const logger = log.scope('myFictions');

/**
 * Parse fictions from HTML content
 * Looks for .fiction[data-fiction-id] elements
 */
function parseFictionsFromHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const fictions = [];
  const fictionElements = doc.querySelectorAll('.fiction[data-fiction-id]');

  for (const el of fictionElements) {
    const fictionId = el.dataset.fictionId;
    const title = el.dataset.title || '';
    const coverImg = el.querySelector('img[data-type="cover"]');
    const coverUrl = coverImg?.src || '';

    if (fictionId) {
      fictions.push({
        fictionId,
        title,
        coverUrl
      });
    }
  }

  return fictions;
}

/**
 * Fetch the main author-dashboard page and parse fictions
 */
async function fetchMyFictions() {
  try {
    const response = await fetch('https://www.royalroad.com/author-dashboard', {
      credentials: 'include'
    });

    if (!response.ok) {
      logger.warn('Failed to fetch author-dashboard', { status: response.status });
      return [];
    }

    const html = await response.text();
    const fictions = parseFictionsFromHtml(html);
    logger.info('Fetched fictions from author-dashboard', { count: fictions.length });
    return fictions;
  } catch (err) {
    logger.error('Error fetching author-dashboard', err);
    return [];
  }
}

/**
 * Sync user's fictions from the author-dashboard to IndexedDB
 * Fetches the main author-dashboard page to get the complete list
 */
export async function syncMyFictions() {
  // Check if we already have fictions in DB
  let existingFictions = await db.getAll('myFictions') || [];

  // If we have fictions, return them (don't re-fetch every time)
  if (existingFictions.length > 0) {
    logger.info('Using cached fictions from DB', { count: existingFictions.length });
    return existingFictions;
  }

  // Fetch from author-dashboard page
  const fictions = await fetchMyFictions();

  if (fictions.length === 0) {
    logger.info('No fictions found');
    return [];
  }

  // Upsert each fiction
  for (const fiction of fictions) {
    const existing = existingFictions.find(f => f.fictionId === fiction.fictionId);
    if (existing) {
      // Update existing
      await db.save('myFictions', {
        ...existing,
        title: fiction.title,
        coverUrl: fiction.coverUrl
      });
    } else {
      // Insert new
      await db.save('myFictions', fiction);
    }
  }

  logger.info('Synced fictions to DB', { count: fictions.length });
  return db.getAll('myFictions');
}

/**
 * Get all user's fictions from DB
 */
export async function getAllMyFictions() {
  return db.getAll('myFictions') || [];
}

/**
 * Get a specific fiction by Royal Road fiction ID
 */
export async function getMyFictionByFictionId(fictionId) {
  return db.getByIndex('myFictions', 'fictionId', fictionId);
}
