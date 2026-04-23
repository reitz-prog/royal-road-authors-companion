// Background service worker
// Handles long-running scans and IndexedDB operations

import * as db from '../common/db/core.js';
import { log } from '../common/logging/core.js';

const logger = log.scope('background');
const authorLogger = log.scope('author-data');

console.log('[RR Companion BG] Service worker loading...');

// Scan state stored in chrome.storage.local
const SCAN_STATE_KEY = 'scanState';
const IMPORT_STATE_KEY = 'importState';
const SWAP_CHECK_STATE_KEY = 'swapCheckState';
const CHECK_ALL_SWAPS_STATE_KEY = 'checkAllSwapsState';

async function getCheckAllSwapsState() {
  const result = await chrome.storage.local.get(CHECK_ALL_SWAPS_STATE_KEY);
  return result[CHECK_ALL_SWAPS_STATE_KEY] || { status: 'idle' };
}

async function setCheckAllSwapsState(state) {
  await chrome.storage.local.set({ [CHECK_ALL_SWAPS_STATE_KEY]: state });
}

// Initialize DB when service worker starts
let dbReady = false;

// Normalize any date input (string, Date, Excel serial number) to "YYYY-MM-DD" or null.
function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date: days since 1899-12-30 (accounting for 1900 leap bug)
    const ms = (value - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

async function ensureDB() {
  if (!dbReady) {
    await db.openDB();
    dbReady = true;
    await runLegacySwapMigration();
  }
}

// Today's date as YYYY-MM-DD
function today() {
  return new Date().toISOString().split('T')[0];
}

// Case-insensitive match for "/fiction/<id>" with a non-digit terminator, so
// that fictionId "1" does not match "/fiction/12345".
function fictionLinkRegex(fictionId) {
  return new RegExp(`/fiction/${fictionId}(?=[/"'\\s?#]|$)`, 'i');
}

// Find the best target schedule for a per-schedule swap hit: the oldest
// un-swapped schedule whose fictionId matches the fiction we detected in
// their notes. Returns null when every schedule for that fiction is already
// marked swapped (duplicate hit — safe to ignore).
function findTargetSchedule(shoutout, myFictionId) {
  return (shoutout.schedules || [])
    .filter(s => String(s.fictionId) === String(myFictionId) && !s.swappedDate)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))[0] || null;
}

// Mark a swap hit. Prefers writing to the matching unswapped schedule;
// falls back to parent-level fields when no matching schedule exists (e.g.
// legacy record with no schedules). Returns true when something was written.
function assignSwap(shoutout, myFictionId, chapter, day) {
  const sched = findTargetSchedule(shoutout, myFictionId);
  if (sched) {
    sched.swappedDate = day;
    sched.swappedChapter = chapter.title;
    sched.swappedChapterUrl = chapter.url;
    sched.lastSwapScanDate = day;
    return true;
  }
  if (!shoutout.swappedDate) {
    shoutout.swappedDate = day;
    shoutout.swappedChapter = chapter.title;
    shoutout.swappedChapterUrl = chapter.url;
    shoutout.lastSwapScanDate = day;
    return true;
  }
  return false;
}

// Stamp lastSwapScanDate on every schedule whose fictionId is among the set
// we actually searched for this shoutout.
function stampScanDateOnSchedules(shoutout, myFictionIdSet, day) {
  for (const sched of shoutout.schedules || []) {
    if (myFictionIdSet.has(String(sched.fictionId))) {
      sched.lastSwapScanDate = day;
    }
  }
}

// Keep the parent-level swap fields as a summary of the schedules for
// backward-compat with read sites that still use them. Picks the earliest
// swapped schedule as the representative.
function syncShoutoutSwapSummary(shoutout) {
  const schedules = shoutout.schedules || [];
  // No schedules — parent fields are the only source of truth, leave as-is.
  if (schedules.length === 0) return;
  const swapped = schedules
    .filter(s => s.swappedDate)
    .sort((a, b) => String(a.swappedDate).localeCompare(String(b.swappedDate)))[0];
  if (swapped) {
    shoutout.swappedDate = swapped.swappedDate;
    shoutout.swappedChapter = swapped.swappedChapter || null;
    shoutout.swappedChapterUrl = swapped.swappedChapterUrl || null;
  } else {
    shoutout.swappedDate = null;
    shoutout.swappedChapter = null;
    shoutout.swappedChapterUrl = null;
  }
  const scanDates = schedules.map(s => s.lastSwapScanDate).filter(Boolean).sort();
  if (scanDates.length) shoutout.lastSwapScanDate = scanDates[scanDates.length - 1];
}

// One-time migration for legacy records that have parent-level swap data
// but no per-schedule data. Best-effort: assigns the swap to the oldest
// archived schedule (or oldest schedule when none are archived).
function migrateLegacyShoutout(shoutout) {
  const schedules = shoutout.schedules || [];
  if (schedules.length === 0) return false;
  const anySwap = schedules.some(s => s.swappedDate);
  const anyScan = schedules.some(s => s.lastSwapScanDate);
  let mutated = false;
  if (shoutout.swappedDate && !anySwap) {
    const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));
    const archived = schedules.filter(s => s.chapter).sort(byDate);
    const target = archived[0] || schedules.slice().sort(byDate)[0];
    if (target) {
      target.swappedDate = shoutout.swappedDate;
      target.swappedChapter = shoutout.swappedChapter || null;
      target.swappedChapterUrl = shoutout.swappedChapterUrl || null;
      target.lastSwapScanDate =
        target.lastSwapScanDate || shoutout.lastSwapScanDate || shoutout.swappedDate;
      mutated = true;
    }
  }
  if (shoutout.lastSwapScanDate && !anyScan) {
    for (const sched of schedules) {
      if (!sched.lastSwapScanDate) {
        sched.lastSwapScanDate = shoutout.lastSwapScanDate;
        mutated = true;
      }
    }
  }
  return mutated;
}

async function runLegacySwapMigration() {
  try {
    const all = await db.getAll('shoutouts') || [];
    let migrated = 0;
    for (const s of all) {
      if (migrateLegacyShoutout(s)) {
        await db.save('shoutouts', s);
        migrated++;
      }
    }
    if (migrated > 0) {
      console.log('[RR Companion BG] Legacy swap migration: updated', migrated, 'shoutouts');
    }
  } catch (err) {
    console.error('[RR Companion BG] Legacy swap migration failed:', err);
  }
}

// Get current scan state
async function getScanState() {
  const result = await chrome.storage.local.get(SCAN_STATE_KEY);
  return result[SCAN_STATE_KEY] || { status: 'idle' };
}

// Update scan state
async function setScanState(state) {
  await chrome.storage.local.set({ [SCAN_STATE_KEY]: state });
}

// Get current import state
async function getImportState() {
  const result = await chrome.storage.local.get(IMPORT_STATE_KEY);
  return result[IMPORT_STATE_KEY] || { status: 'idle' };
}

// Update import state
async function setImportState(state) {
  await chrome.storage.local.set({ [IMPORT_STATE_KEY]: state });
}

// Get current swap check state
async function getSwapCheckState() {
  const result = await chrome.storage.local.get(SWAP_CHECK_STATE_KEY);
  return result[SWAP_CHECK_STATE_KEY] || { status: 'idle', checks: {} };
}

// Update swap check state
async function setSwapCheckState(state) {
  await chrome.storage.local.set({ [SWAP_CHECK_STATE_KEY]: state });
}

// Update a single shoutout's check state
async function updateShoutoutCheckState(shoutoutId, checkState) {
  const state = await getSwapCheckState();
  state.checks = state.checks || {};
  state.checks[shoutoutId] = checkState;
  await setSwapCheckState(state);
}

// Delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch with exponential backoff retry
async function fetchWithRetry(url, options = {}, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on rate limiting (429) or server errors (5xx)
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (attempt < maxRetries) {
          const delayMs = baseDelay * Math.pow(2, attempt);
          console.log(`[RR Companion BG] Rate limited (${response.status}), retrying in ${delayMs}ms...`);
          await delay(delayMs);
          continue;
        }
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delayMs = baseDelay * Math.pow(2, attempt);
        console.log(`[RR Companion BG] Fetch failed, retrying in ${delayMs}ms: ${err.message}`);
        await delay(delayMs);
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

// Broadcast message to all Royal Road tabs
async function broadcastToTabs(message) {
  try {
    const tabs = await chrome.tabs.query({ url: '*://www.royalroad.com/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  } catch (err) {
    // Ignore errors
  }
}

// ============ OFFSCREEN DOCUMENT MANAGEMENT ============

let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    console.error('[RR Companion BG] chrome.offscreen API not available');
    throw new Error('Offscreen API not available - please reload the extension');
  }

  const offscreenUrl = chrome.runtime.getURL('offscreen.html');

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['DOM_SCRAPING'],
    justification: 'Parse HTML content from Royal Road pages'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
  console.log('[RR Companion BG] Offscreen document created');
}

// ============ PARSING VIA OFFSCREEN ============

async function fetchChapterList(fictionId) {
  const url = `https://www.royalroad.com/fiction/${fictionId}`;
  console.log('[RR Companion BG] Fetching fiction page:', url);

  const response = await fetchWithRetry(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Failed to fetch fiction page: ${response.status}`);
  }

  const html = await response.text();
  await ensureOffscreenDocument();

  const result = await chrome.runtime.sendMessage({
    type: 'parseChapterList',
    html,
    fictionId
  });

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to parse chapter list');
  }

  console.log(`[RR Companion BG] Found ${result.data.chapters.length} chapters`);
  return result.data;
}

async function fetchChapterNotes(chapterUrl) {
  const response = await fetchWithRetry(chapterUrl, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  await ensureOffscreenDocument();

  const result = await chrome.runtime.sendMessage({
    type: 'parseChapterNotes',
    html,
    chapterUrl
  });

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to parse chapter notes');
  }

  return result.data;
}

async function extractShoutoutsFromHtml(html, excludeFictionId) {
  await ensureOffscreenDocument();

  const result = await chrome.runtime.sendMessage({
    type: 'extractShoutouts',
    html,
    excludeFictionId
  });

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to extract shoutouts');
  }

  return new Map(Object.entries(result.data));
}

async function fetchFictionDetails(fictionId) {
  const url = `https://www.royalroad.com/fiction/${fictionId}`;
  authorLogger.info('Fetching fiction details', { fictionId, url });

  const response = await fetchWithRetry(url, { credentials: 'include' });
  if (!response.ok) {
    authorLogger.error('Failed to fetch fiction page', { fictionId, status: response.status });
    throw new Error(`Failed to fetch fiction page: ${response.status}`);
  }

  const html = await response.text();
  authorLogger.debug('Got HTML response', { fictionId, htmlLength: html.length });

  await ensureOffscreenDocument();

  const result = await chrome.runtime.sendMessage({
    type: 'parseFictionDetails',
    html,
    fictionId
  });

  if (!result?.success) {
    authorLogger.error('Failed to parse fiction details', { fictionId, error: result?.error });
    throw new Error(result?.error || 'Failed to parse fiction details');
  }

  const data = result.data || {};

  authorLogger.info('Fiction details parsed', {
    fictionId,
    fictionTitle: data.fictionTitle || '(empty)',
    authorName: data.authorName || '(empty)',
    hasCover: !!data.coverUrl,
    hasProfile: !!data.profileUrl,
    hasAvatar: !!data.authorAvatar,
  });

  if (!data.authorName) {
    authorLogger.warn('Author name is empty after parse', { fictionId, data });
  }

  const { profileId, ...rest } = data;
  return rest;
}

// ============ SCANNING LOGIC ============

async function batchDownloadChapters(chapters, batchSize = 5, delayMs = 1000, onProgress = null) {
  const results = new Map();

  for (let i = 0; i < chapters.length; i += batchSize) {
    const batch = chapters.slice(i, i + batchSize);

    const batchPromises = batch.map(async (chapter) => {
      try {
        const notes = await fetchChapterNotes(chapter.url);
        return { chapter, notes, error: null };
      } catch (err) {
        return { chapter, notes: null, error: err };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      results.set(result.chapter.url, result);
    }

    if (onProgress) {
      await onProgress({
        downloaded: Math.min(i + batchSize, chapters.length),
        total: chapters.length
      });
    }

    if (i + batchSize < chapters.length) {
      await delay(delayMs);
    }
  }

  return results;
}

function isAlreadyArchived(shoutout, myFictionId, chapterName) {
  const schedules = shoutout.schedules || [];
  return schedules.some(s =>
    String(s.fictionId) === String(myFictionId) &&
    s.chapter === chapterName
  );
}

async function runFullScan(myFictionId) {
  let shoutoutsFound = 0;

  try {
    await setScanState({
      status: 'scanning',
      phase: 'download',
      current: 0,
      total: 0,
      currentTitle: 'Initializing...',
      shoutoutsFound: 0
    });

    await ensureDB();
    await ensureOffscreenDocument();

    console.log('[RR Companion BG] Starting scan for fiction:', myFictionId);
    const fictionData = await fetchChapterList(myFictionId);
    const { chapters, fictionTitle } = fictionData;

    console.log(`[RR Companion BG] Found ${chapters.length} chapters for ${fictionTitle}`);

    // Get already-scanned chapter URLs to skip
    const allShoutouts = await db.getAll('shoutouts');
    const scannedChapterUrls = new Set();
    for (const shoutout of allShoutouts) {
      const schedules = shoutout.schedules || [];
      for (const sch of schedules) {
        if (String(sch.fictionId) === String(myFictionId) && sch.chapter && sch.chapterUrl) {
          scannedChapterUrls.add(sch.chapterUrl);
        }
      }
    }

    const chaptersToDownload = chapters.filter(ch => !scannedChapterUrls.has(ch.url));
    const skippedCount = chapters.length - chaptersToDownload.length;
    console.log(`[RR Companion BG] Skipping ${skippedCount} already-scanned, downloading ${chaptersToDownload.length}`);

    await setScanState({
      status: 'scanning',
      phase: 'download',
      current: 0,
      total: chaptersToDownload.length,
      currentTitle: skippedCount > 0 ? `Skipped ${skippedCount} cached, downloading...` : 'Downloading chapters...',
      shoutoutsFound: 0
    });

    const downloadedChapters = await batchDownloadChapters(chaptersToDownload, 5, 1000, async (progress) => {
      await setScanState({
        status: 'scanning',
        phase: 'download',
        current: progress.downloaded,
        total: chaptersToDownload.length,
        currentTitle: `Downloading ${progress.downloaded}/${chaptersToDownload.length}...`,
        shoutoutsFound: 0
      });
    });

    console.log('[RR Companion BG] Downloaded', downloadedChapters.size, 'chapters');

    // Process chapters
    let localShoutouts = [...allShoutouts];
    const processedInScan = new Set();

    // Cache for contacts to avoid redundant DB calls
    const existingContacts = await db.getAll('contacts') || [];
    const contactCache = new Map(existingContacts.map(c => [c.authorName, c]));

    let scanCancelled = false;
    for (let i = 0; i < chaptersToDownload.length; i++) {
      const liveState = await getScanState();
      if (liveState.status !== 'scanning') {
        scanCancelled = true;
        break;
      }

      const chapter = chaptersToDownload[i];

      await setScanState({
        status: 'scanning',
        phase: 'process',
        current: i + 1,
        total: chaptersToDownload.length,
        currentTitle: chapter.title,
        shoutoutsFound
      });

      const downloadResult = downloadedChapters.get(chapter.url);
      if (!downloadResult || downloadResult.error || !downloadResult.notes) {
        continue;
      }

      try {
        const combined = downloadResult.notes.combined || '';
        const shoutoutsMap = await extractShoutoutsFromHtml(combined, myFictionId);

        for (const [rrFictionId, extractedCode] of shoutoutsMap.entries()) {
          const scanKey = `${rrFictionId}|${chapter.title}`;
          if (processedInScan.has(scanKey)) continue;
          processedInScan.add(scanKey);

          const existingShoutout = localShoutouts.find(s =>
            String(s.fictionId) === String(rrFictionId)
          );

          if (existingShoutout && isAlreadyArchived(existingShoutout, myFictionId, chapter.title)) {
            continue;
          }

          const details = await fetchFictionDetails(rrFictionId);

          // Create/update contact if we have author info (using cache)
          if (details?.authorName) {
            let contact = contactCache.get(details.authorName);

            if (!contact) {
              const newContact = {
                authorName: details.authorName,
                authorAvatar: details.authorAvatar || '',
                profileUrl: details.profileUrl || ''
              };
              const contactId = await db.save('contacts', newContact);
              contactCache.set(details.authorName, { ...newContact, id: contactId });
              console.log('[RR Companion BG] Created contact:', details.authorName);
            } else if (!contact.authorAvatar && details.authorAvatar) {
              // Update existing contact with avatar
              const updated = { ...contact, authorAvatar: details.authorAvatar };
              await db.save('contacts', updated);
              contactCache.set(details.authorName, updated);
              console.log('[RR Companion BG] Updated contact avatar:', details.authorName);
            }
          }

          if (existingShoutout) {
            // Update existing shoutout
            const schedules = [...(existingShoutout.schedules || [])];

            const alreadyArchived = schedules.some(
              s => String(s.fictionId) === String(myFictionId) && s.chapter === chapter.title
            );
            if (alreadyArchived) continue;

            // Prefer archiving onto a pending schedule whose date matches the
            // chapter's publish date. Without the date check, a Monday
            // schedule would silently end up labelled "Wednesday" just
            // because Wednesday's chapter was the one we scanned.
            let pendingIdx = schedules.findIndex(
              s => String(s.fictionId) === String(myFictionId) &&
                   !s.chapter &&
                   s.date === chapter.date
            );

            if (pendingIdx >= 0) {
              schedules[pendingIdx] = { ...schedules[pendingIdx], chapter: chapter.title, chapterUrl: chapter.url };
            } else {
              // No pending schedule for this exact date → record as a new,
              // already-archived entry. The user's original scheduled date
              // (if any) stays untouched.
              schedules.push({
                fictionId: String(myFictionId),
                date: chapter.date,
                chapter: chapter.title,
                chapterUrl: chapter.url
              });
            }

            const updatedCode = (!existingShoutout.code && extractedCode) ? extractedCode : existingShoutout.code;
            await db.save('shoutouts', { ...existingShoutout, schedules, code: updatedCode });

            const idx = localShoutouts.findIndex(s => s.id === existingShoutout.id);
            if (idx >= 0) {
              localShoutouts[idx] = { ...localShoutouts[idx], schedules, code: updatedCode };
            }
          } else {
            // Create new shoutout with all cached data
            const newSchedule = {
              fictionId: String(myFictionId),
              date: chapter.date,
              chapter: chapter.title,
              chapterUrl: chapter.url
            };

            const newShoutout = {
              fictionId: rrFictionId,
              fictionTitle: details?.fictionTitle || 'Unknown',
              fictionUrl: details?.fictionUrl || `https://www.royalroad.com/fiction/${rrFictionId}`,
              coverUrl: details?.coverUrl || '',
              authorName: details?.authorName || '',
              authorAvatar: details?.authorAvatar || '',
              profileUrl: details?.profileUrl || '',
              schedules: [newSchedule],
              code: extractedCode || ''
            };

            const newId = await db.save('shoutouts', newShoutout);
            localShoutouts.push({ ...newShoutout, id: newId });
          }

          shoutoutsFound++;

          // Notify content scripts (runs on royalroad.com tabs, needs tabs.sendMessage)
          broadcastToTabs({
            type: 'shoutoutFound',
            chapterName: chapter.title,
            fictionTitle: details?.fictionTitle || 'Unknown',
            authorName: details?.authorName || 'Unknown',
          });
        }
      } catch (err) {
        console.error('[RR Companion BG] Error processing chapter:', chapter.title, err);
      }
    }

    // Phase 3: Check for swap returns (did they shout us back?)
    // Include unarchived shoutouts too — they may have shouted us first.
    const latestShoutouts = await db.getAll('shoutouts') || [];
    const unswappedShoutouts = latestShoutouts.filter(s =>
      !s.swappedDate && s.fictionId
    );

    if (unswappedShoutouts.length > 0) {
      const myFictions = await db.getAll('myFictions') || [];
      const myFictionIds = myFictions.map(f => String(f.fictionId));

      let swapsChecked = 0;
      let swapsFound = 0;

      for (const shoutout of unswappedShoutouts) {
        swapsChecked++;

        // Auto-heal: fetch missing author info
        if (!shoutout.authorName && shoutout.fictionId) {
          authorLogger.info('Auto-heal triggered - missing author', {
            shoutoutId: shoutout.id,
            fictionId: shoutout.fictionId,
            fictionTitle: shoutout.fictionTitle
          });
          try {
            const details = await fetchFictionDetails(shoutout.fictionId);
            if (details?.authorName) {
              const before = { authorName: shoutout.authorName, fictionTitle: shoutout.fictionTitle };
              shoutout.authorName = details.authorName;
              shoutout.fictionTitle = details.fictionTitle || shoutout.fictionTitle;
              shoutout.coverUrl = details.coverUrl || shoutout.coverUrl;
              shoutout.profileUrl = details.profileUrl || shoutout.profileUrl;
              shoutout.authorAvatar = details.authorAvatar || shoutout.authorAvatar;
              await db.save('shoutouts', shoutout);
              authorLogger.info('Auto-heal SUCCESS', {
                shoutoutId: shoutout.id,
                before,
                after: { authorName: shoutout.authorName, fictionTitle: shoutout.fictionTitle }
              });
            } else {
              authorLogger.warn('Auto-heal FAILED - no author in response', {
                shoutoutId: shoutout.id,
                fictionId: shoutout.fictionId,
                details
              });
            }
          } catch (err) {
            authorLogger.error('Auto-heal ERROR', {
              shoutoutId: shoutout.id,
              fictionId: shoutout.fictionId,
              error: err.message
            });
          }
        }

        await setScanState({
          status: 'scanning',
          phase: 'checkSwaps',
          current: swapsChecked,
          total: unswappedShoutouts.length,
          currentTitle: `Checking swap: ${shoutout.authorName || shoutout.fictionTitle || 'Unknown'}`,
          shoutoutsFound
        });

        try {
          // Fetch their chapter list
          const theirFictionData = await fetchChapterList(shoutout.fictionId);
          const theirChapters = theirFictionData.chapters || [];

          // Scope the search to the fictions this shoutout was actually
          // scheduled on — each hit gets attributed to its matching schedule.
          // For legacy shoutouts with no schedules, fall back to all of our
          // fictions so we still record a parent-level swap.
          const shoutoutMyFictionIds = new Set(
            (shoutout.schedules || []).map(s => String(s.fictionId)).filter(Boolean)
          );
          const relevantFictionIds = shoutoutMyFictionIds.size > 0
            ? myFictionIds.filter(id => shoutoutMyFictionIds.has(String(id)))
            : myFictionIds;
          const day = today();

          const allSchedulesSwapped = () => {
            const schedules = shoutout.schedules || [];
            if (schedules.length === 0) return !!shoutout.swappedDate;
            return schedules
              .filter(s => shoutoutMyFictionIds.has(String(s.fictionId)))
              .every(s => s.swappedDate);
          };

          for (const chapter of theirChapters) {
            if (allSchedulesSwapped()) break;
            try {
              const notes = await fetchChapterNotes(chapter.url);
              const combined = notes?.combined || '';

              for (const myFictionId of relevantFictionIds) {
                if (fictionLinkRegex(myFictionId).test(combined)) {
                  if (assignSwap(shoutout, myFictionId, chapter, day)) {
                    swapsFound++;
                    console.log('[RR Companion BG] Swap found:', shoutout.authorName, 'for fiction', myFictionId, 'in', chapter.title);
                  }
                }
              }
            } catch (chErr) {
              console.log('[RR Companion BG] Error checking chapter:', chapter.title);
            }

            // Small delay between chapters
            await delay(200);
          }

          stampScanDateOnSchedules(shoutout, shoutoutMyFictionIds, day);
          if (!(shoutout.schedules || []).length) shoutout.lastSwapScanDate = day;
          syncShoutoutSwapSummary(shoutout);
          await db.save('shoutouts', shoutout);
        } catch (err) {
          console.log('[RR Companion BG] Error checking swap for:', shoutout.authorName, err.message);
        }
      }

      console.log('[RR Companion BG] Swap check complete:', { checked: swapsChecked, found: swapsFound });
    }

    if (scanCancelled) {
      console.log('[RR Companion BG] Scan cancelled by user');
      await setScanState({ status: 'idle' });
      broadcastToTabs({ type: 'scanCancelled' });
      return;
    }

    await setScanState({
      status: 'complete',
      message: `Done! Found ${shoutoutsFound} shoutout(s).`,
      shoutoutsFound,
      fictionTitle,
      completedAt: new Date().toISOString()
    });

    broadcastToTabs({ type: 'scanComplete', shoutoutsFound });

    // Decay to idle after the UI has had time to consume the `complete`
    // status (poll interval is 500ms). Keeps reopening the scanner modal
    // from re-triggering onScanComplete against stale state.
    setTimeout(() => {
      setScanState({ status: 'idle' }).catch(() => {});
    }, 1500);

  } catch (err) {
    console.error('[RR Companion BG] Scan error:', err);
    await setScanState({ status: 'error', error: err.message });
    // Same decay for error state so the modal can be reopened cleanly.
    setTimeout(() => {
      setScanState({ status: 'idle' }).catch(() => {});
    }, 3000);
  }
}

// ============ CHECK ALL SWAPS ============
// Check all archived shoutouts to see if other authors have shouted us back

async function checkAllSwaps(opts = {}) {
  const { fictionId = null } = opts;
  console.log('[RR Companion BG] === CHECK ALL SWAPS ===', fictionId ? { fictionId } : '(all)');

  try {
    await ensureDB();

    // Check every shoutout that isn't already confirmed swapped.
    // Includes scheduled/unposted ones — they might have posted us first.
    //
    // `fictionId` scopes the check to shoutouts that appear on one of our
    // fictions. A shoutout's `s.fictionId` is the OTHER author's fiction
    // (the one we're shouting), while `s.schedules[*].fictionId` points to
    // OUR fiction where the shoutout is scheduled or archived. Matching
    // that schedule field is the correct scoping.
    const allShoutouts = await db.getAll('shoutouts') || [];
    const unswappedShoutouts = allShoutouts.filter(s => {
      if (s.swappedDate || !s.fictionId) return false;
      if (fictionId) {
        const onOurFiction = (s.schedules || []).some(
          sch => String(sch.fictionId) === String(fictionId),
        );
        if (!onOurFiction) return false;
      }
      return true;
    });

    if (unswappedShoutouts.length === 0) {
      console.log('[RR Companion BG] No unswapped shoutouts to check');
      return { checked: 0, found: 0 };
    }

    console.log('[RR Companion BG] Checking', unswappedShoutouts.length, 'unswapped shoutouts');

    // Get our fiction IDs
    const myFictions = await db.getAll('myFictions') || [];
    const myFictionIds = myFictions.map(f => String(f.fictionId));

    if (myFictionIds.length === 0) {
      console.log('[RR Companion BG] No myFictions found');
      return { checked: 0, found: 0, error: 'No fictions found' };
    }

    await ensureOffscreenDocument();
    await setCheckAllSwapsState({ status: 'running', current: 0, total: unswappedShoutouts.length });

    let swapsChecked = 0;
    let swapsFound = 0;
    let checkAllCancelled = false;

    for (const shoutout of unswappedShoutouts) {
      const liveState = await getCheckAllSwapsState();
      if (liveState.status !== 'running') {
        checkAllCancelled = true;
        break;
      }

      swapsChecked++;

      // Auto-heal: fetch missing author info
      if (!shoutout.authorName && shoutout.fictionId) {
        authorLogger.info('Auto-heal triggered (checkAllSwaps) - missing author', {
          shoutoutId: shoutout.id,
          fictionId: shoutout.fictionId,
          fictionTitle: shoutout.fictionTitle
        });
        try {
          const details = await fetchFictionDetails(shoutout.fictionId);
          if (details?.authorName) {
            const before = { authorName: shoutout.authorName, fictionTitle: shoutout.fictionTitle };
            shoutout.authorName = details.authorName;
            shoutout.fictionTitle = details.fictionTitle || shoutout.fictionTitle;
            shoutout.coverUrl = details.coverUrl || shoutout.coverUrl;
            shoutout.profileUrl = details.profileUrl || shoutout.profileUrl;
            shoutout.authorAvatar = details.authorAvatar || shoutout.authorAvatar;
            await db.save('shoutouts', shoutout);
            authorLogger.info('Auto-heal SUCCESS (checkAllSwaps)', {
              shoutoutId: shoutout.id,
              before,
              after: { authorName: shoutout.authorName, fictionTitle: shoutout.fictionTitle }
            });
          } else {
            authorLogger.warn('Auto-heal FAILED (checkAllSwaps) - no author in response', {
              shoutoutId: shoutout.id,
              fictionId: shoutout.fictionId,
              details
            });
          }
        } catch (err) {
          authorLogger.error('Auto-heal ERROR (checkAllSwaps)', {
            shoutoutId: shoutout.id,
            fictionId: shoutout.fictionId,
            error: err.message
          });
        }
      }

      // Update check state for this shoutout
      await updateShoutoutCheckState(shoutout.id, {
        status: 'checking',
        current: 0,
        total: 0,
        chapter: 'Fetching chapters...',
        startedAt: new Date().toISOString()
      });

      // Broadcast overall progress
      broadcastToTabs({
        type: 'checkAllSwapsProgress',
        current: swapsChecked,
        total: unswappedShoutouts.length,
        authorName: shoutout.authorName || shoutout.fictionTitle || 'Unknown'
      });

      // Broadcast per-shoutout progress
      broadcastToTabs({
        type: 'swapCheckProgress',
        shoutoutId: shoutout.id,
        current: 0,
        total: 0,
        chapter: 'Fetching chapters...'
      });

      try {
        // Fetch their chapter list
        const chapterListUrl = `https://www.royalroad.com/fiction/${shoutout.fictionId}`;
        const chapterListResponse = await fetchWithRetry(chapterListUrl, { credentials: 'include' });
        if (!chapterListResponse.ok) {
          console.log('[RR Companion BG] Failed to fetch fiction:', shoutout.fictionId);
          await updateShoutoutCheckState(shoutout.id, { status: 'complete', found: false });
          continue;
        }

        const chapterListHtml = await chapterListResponse.text();
        const parseResponse = await chrome.runtime.sendMessage({
          type: 'parseChapterList',
          html: chapterListHtml,
          fictionId: shoutout.fictionId
        });

        if (!parseResponse?.success) {
          console.log('[RR Companion BG] Failed to parse chapters for:', shoutout.fictionId);
          await updateShoutoutCheckState(shoutout.id, { status: 'complete', found: false });
          continue;
        }

        const theirChapters = parseResponse.data?.chapters || [];
        const shoutoutMyFictionIds = new Set(
          (shoutout.schedules || []).map(s => String(s.fictionId)).filter(Boolean)
        );
        const relevantFictionIds = shoutoutMyFictionIds.size > 0
          ? myFictionIds.filter(id => shoutoutMyFictionIds.has(String(id)))
          : myFictionIds;
        const day = today();

        const allSchedulesSwapped = () => {
          const schedules = shoutout.schedules || [];
          if (schedules.length === 0) return !!shoutout.swappedDate;
          return schedules
            .filter(s => shoutoutMyFictionIds.has(String(s.fictionId)))
            .every(s => s.swappedDate);
        };

        for (let i = 0; i < theirChapters.length; i++) {
          if (allSchedulesSwapped()) break;
          const chapter = theirChapters[i];

          await updateShoutoutCheckState(shoutout.id, {
            status: 'checking',
            current: i + 1,
            total: theirChapters.length,
            chapter: chapter.title
          });

          broadcastToTabs({
            type: 'swapCheckProgress',
            shoutoutId: shoutout.id,
            current: i + 1,
            total: theirChapters.length,
            chapter: chapter.title
          });

          try {
            const chapterResponse = await fetchWithRetry(chapter.url, { credentials: 'include' });
            if (!chapterResponse.ok) continue;

            const chapterHtml = await chapterResponse.text();
            const parseNotesResponse = await chrome.runtime.sendMessage({
              type: 'parseChapterNotes',
              html: chapterHtml,
              chapterUrl: chapter.url
            });

            if (!parseNotesResponse?.success) continue;

            const authorNotes = parseNotesResponse.data?.combined || '';

            for (const myFictionId of relevantFictionIds) {
              if (fictionLinkRegex(myFictionId).test(authorNotes)) {
                if (assignSwap(shoutout, myFictionId, chapter, day)) {
                  swapsFound++;
                  console.log('[RR Companion BG] Swap found:', shoutout.authorName, 'for fiction', myFictionId, 'in', chapter.title);
                }
              }
            }
          } catch (chErr) {
            console.log('[RR Companion BG] Error checking chapter:', chapter.title);
          }

          await delay(200);
        }

        stampScanDateOnSchedules(shoutout, shoutoutMyFictionIds, day);
        if (!(shoutout.schedules || []).length) shoutout.lastSwapScanDate = day;
        syncShoutoutSwapSummary(shoutout);
        await db.save('shoutouts', shoutout);

        const foundSwap = (shoutout.schedules || []).some(s => s.swappedDate) || !!shoutout.swappedDate;

        // Update check state
        await updateShoutoutCheckState(shoutout.id, {
          status: 'complete',
          found: foundSwap,
          completedAt: new Date().toISOString()
        });

      } catch (err) {
        console.log('[RR Companion BG] Error checking swap for:', shoutout.authorName, err.message);
        await updateShoutoutCheckState(shoutout.id, {
          status: 'error',
          error: err.message,
          completedAt: new Date().toISOString()
        });
      }
    }

    await setCheckAllSwapsState({ status: 'idle' });

    if (checkAllCancelled) {
      console.log('[RR Companion BG] Check all swaps cancelled by user');
      broadcastToTabs({ type: 'checkAllSwapsCancelled', checked: swapsChecked });
      return { checked: swapsChecked, found: swapsFound, cancelled: true };
    }

    console.log('[RR Companion BG] Check all swaps complete:', { checked: swapsChecked, found: swapsFound });

    // Broadcast completion
    broadcastToTabs({
      type: 'swapCheckComplete',
      checked: swapsChecked,
      found: swapsFound
    });

    return { checked: swapsChecked, found: swapsFound };

  } catch (err) {
    console.error('[RR Companion BG] Check all swaps error:', err);
    await setCheckAllSwapsState({ status: 'idle' });
    return { checked: 0, found: 0, error: err.message };
  }
}

// ============ CHECK SWAP RETURN ============
// Scan the other author's fiction to see if they posted our shoutout

async function checkSwapReturn(shoutoutId, theirFictionId, myFictionIds) {
  console.log('[RR Companion BG] === CHECKING SWAP RETURN ===');
  console.log('[RR Companion BG] shoutoutId:', shoutoutId);
  console.log('[RR Companion BG] theirFictionId:', theirFictionId);
  console.log('[RR Companion BG] myFictionIds:', myFictionIds);

  if (!theirFictionId) {
    console.error('[RR Companion BG] ERROR: theirFictionId is missing!');
    return { found: false, error: 'Fiction ID is missing' };
  }

  if (!myFictionIds || myFictionIds.length === 0) {
    console.error('[RR Companion BG] ERROR: myFictionIds is empty!');
    return { found: false, error: 'No fiction IDs to search for' };
  }

  // Set initial checking state
  await updateShoutoutCheckState(shoutoutId, {
    status: 'checking',
    current: 0,
    total: 0,
    chapter: 'Initializing...',
    startedAt: new Date().toISOString()
  });

  try {
    await ensureDB();
    console.log('[RR Companion BG] DB ready');
    await ensureOffscreenDocument();
    console.log('[RR Companion BG] Offscreen document ready');

    // Get shoutout to check for expected return date
    const shoutout = await db.getById('shoutouts', shoutoutId);
    const expectedReturnDate = shoutout?.expectedReturnDate;
    console.log('[RR Companion BG] Expected return date:', expectedReturnDate);

    // Fetch their chapter list
    const chapterListUrl = `https://www.royalroad.com/fiction/${theirFictionId}`;
    console.log('[RR Companion BG] Fetching fiction page:', chapterListUrl);
    const chapterListResponse = await fetchWithRetry(chapterListUrl, { credentials: 'include' });
    if (!chapterListResponse.ok) {
      console.error('[RR Companion BG] Failed to fetch fiction page:', chapterListResponse.status);
      throw new Error(`Failed to fetch fiction page: ${chapterListResponse.status}`);
    }
    const chapterListHtml = await chapterListResponse.text();
    console.log('[RR Companion BG] Got HTML, length:', chapterListHtml.length);

    // Parse chapter list via offscreen (use same format as fetchChapterList)
    console.log('[RR Companion BG] Sending to offscreen for parsing...');
    const parseChaptersResponse = await chrome.runtime.sendMessage({
      type: 'parseChapterList',
      html: chapterListHtml,
      fictionId: theirFictionId
    });

    console.log('[RR Companion BG] Parse response:', parseChaptersResponse);
    if (!parseChaptersResponse?.success) {
      throw new Error(parseChaptersResponse?.error || 'Failed to parse chapter list');
    }

    const allChapters = parseChaptersResponse.data?.chapters || [];
    console.log('[RR Companion BG] Found', allChapters.length, 'total chapters');
    if (allChapters.length > 0) {
      console.log('[RR Companion BG] First chapter:', allChapters[0]);
    }

    if (allChapters.length === 0) {
      return { found: false, reason: 'No chapters found' };
    }

    const shoutoutMyFictionIds = new Set(
      (shoutout?.schedules || []).map(s => String(s.fictionId)).filter(Boolean)
    );
    const relevantFictionIds = shoutoutMyFictionIds.size > 0
      ? myFictionIds.filter(id => shoutoutMyFictionIds.has(String(id)))
      : myFictionIds;
    const day = today();
    let firstHit = null;

    const allSchedulesSwapped = () => {
      const schedules = shoutout?.schedules || [];
      if (schedules.length === 0) return !!shoutout?.swappedDate;
      return schedules
        .filter(s => shoutoutMyFictionIds.has(String(s.fictionId)))
        .every(s => s.swappedDate);
    };

    const scanChapters = async (chapters, offset = 0) => {
      console.log('[RR Companion BG] Scanning', chapters.length, 'chapters starting at offset', offset);

      for (let i = 0; i < chapters.length; i++) {
        if (allSchedulesSwapped()) return;
        const chapter = chapters[i];
        console.log(`[RR Companion BG] Scanning chapter ${offset + i + 1}/${allChapters.length}: ${chapter.title}`);

        await updateShoutoutCheckState(shoutoutId, {
          status: 'checking',
          current: offset + i + 1,
          total: allChapters.length,
          chapter: chapter.title
        });

        broadcastToTabs({
          type: 'swapCheckProgress',
          shoutoutId,
          current: offset + i + 1,
          total: allChapters.length,
          chapter: chapter.title
        });

        const chapterResponse = await fetchWithRetry(chapter.url, { credentials: 'include' });
        if (!chapterResponse.ok) {
          console.log('[RR Companion BG] Failed to fetch chapter:', chapter.url, chapterResponse.status);
          continue;
        }
        const chapterHtml = await chapterResponse.text();

        const parseNotesResponse = await chrome.runtime.sendMessage({
          type: 'parseChapterNotes',
          html: chapterHtml,
          chapterUrl: chapter.url
        });

        if (!parseNotesResponse?.success) {
          console.log('[RR Companion BG] Failed to parse notes for:', chapter.url);
          continue;
        }

        const authorNotes = parseNotesResponse.data?.combined || '';

        for (const myFictionId of relevantFictionIds) {
          if (fictionLinkRegex(myFictionId).test(authorNotes)) {
            if (assignSwap(shoutout, myFictionId, chapter, day)) {
              if (!firstHit) firstHit = chapter;
              console.log('[RR Companion BG] FOUND our shoutout in:', chapter.title, 'for fiction:', myFictionId);
            }
          }
        }
      }
    };

    if (expectedReturnDate) {
      const startDate = new Date(expectedReturnDate);
      startDate.setDate(startDate.getDate() - 3);
      const startDateStr = startDate.toISOString().split('T')[0];

      console.log('[RR Companion BG] Smart scan starting from:', startDateStr);

      const priorityChapters = allChapters.filter(ch => ch.date && ch.date >= startDateStr);
      const olderChapters = allChapters.filter(ch => !ch.date || ch.date < startDateStr);

      console.log('[RR Companion BG] Priority chapters:', priorityChapters.length, 'Older:', olderChapters.length);

      await scanChapters(priorityChapters, 0);
      if (!allSchedulesSwapped() && olderChapters.length > 0) {
        console.log('[RR Companion BG] Not all done in priority, scanning older chapters...');
        await scanChapters(olderChapters, priorityChapters.length);
      }
    } else {
      console.log('[RR Companion BG] No expected date, scanning all chapters');
      await scanChapters(allChapters, 0);
    }

    // Persist scan date + summary
    stampScanDateOnSchedules(shoutout, shoutoutMyFictionIds, day);
    if (!(shoutout.schedules || []).length) shoutout.lastSwapScanDate = day;
    syncShoutoutSwapSummary(shoutout);
    await db.save('shoutouts', shoutout);

    const foundAny = (shoutout.schedules || []).some(s => s.swappedDate) || !!shoutout.swappedDate;

    broadcastToTabs({
      type: 'swapCheckComplete',
      shoutoutId,
      found: foundAny,
      chapter: firstHit?.title || null
    });

    if (foundAny) {
      await updateShoutoutCheckState(shoutoutId, {
        status: 'complete',
        found: true,
        chapter: firstHit?.title || shoutout.swappedChapter || null,
        chapterUrl: firstHit?.url || shoutout.swappedChapterUrl || null,
        completedAt: new Date().toISOString()
      });

      return {
        found: true,
        chapter: firstHit?.title || shoutout.swappedChapter || null,
        chapterUrl: firstHit?.url || shoutout.swappedChapterUrl || null,
        date: firstHit?.date || null
      };
    }

    await updateShoutoutCheckState(shoutoutId, {
      status: 'complete',
      found: false,
      completedAt: new Date().toISOString()
    });

    return { found: false, reason: 'Not found in any chapters' };

  } catch (err) {
    console.error('[RR Companion BG] Check swap error:', err);

    // Update persistent state - error
    await updateShoutoutCheckState(shoutoutId, {
      status: 'error',
      error: err.message,
      completedAt: new Date().toISOString()
    });

    return { found: false, error: err.message };
  }
}


// ============ AUTO-ARCHIVE TODAY ============

async function autoArchiveToday() {
  console.log('[RR Companion BG] Auto-archiving today\'s chapters...');

  try {
    await ensureDB();

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toLocaleDateString('en-CA');
    console.log('[RR Companion BG] Today is:', today);

    // Get all user's fictions
    const myFictions = await db.getAll('myFictions') || [];
    if (myFictions.length === 0) {
      console.log('[RR Companion BG] No fictions found, skipping auto-archive');
      return { archived: 0, checked: 0 };
    }

    // Get all shoutouts
    const shoutouts = await db.getAll('shoutouts') || [];
    if (shoutouts.length === 0) {
      console.log('[RR Companion BG] No shoutouts found, skipping auto-archive');
      return { archived: 0, checked: 0 };
    }

    let totalArchived = 0;
    let totalChecked = 0;

    // For each fiction, fetch chapters and check for today's publications
    for (const fiction of myFictions) {
      try {
        console.log('[RR Companion BG] Checking fiction:', fiction.title, fiction.fictionId);

        // Find shoutouts scheduled for today on this fiction that aren't already archived
        const todayShoutouts = shoutouts.filter(s =>
          s.schedules?.some(sch =>
            sch.date === today &&
            String(sch.fictionId) === String(fiction.fictionId) &&
            !sch.chapter // Not already archived
          )
        );

        if (todayShoutouts.length === 0) {
          console.log('[RR Companion BG] No unarchived shoutouts for today on', fiction.title);
          continue;
        }

        console.log('[RR Companion BG] Found', todayShoutouts.length, 'shoutouts scheduled for today');

        // Fetch chapter list for this fiction
        const fictionData = await fetchChapterList(fiction.fictionId);
        const chapters = fictionData.chapters || [];

        // Find chapters published today
        const todayChapters = chapters.filter(ch => ch.date === today);
        console.log('[RR Companion BG] Found', todayChapters.length, 'chapters published today');

        if (todayChapters.length === 0) {
          continue;
        }

        // Use the most recent chapter published today (first in list since chapters are sorted newest first)
        const latestChapter = todayChapters[0];
        console.log('[RR Companion BG] Latest chapter today:', latestChapter.title);

        // Archive each matching shoutout
        for (const shoutout of todayShoutouts) {
          totalChecked++;

          // Find the schedule for today on this fiction
          const scheduleIdx = shoutout.schedules.findIndex(sch =>
            sch.date === today &&
            String(sch.fictionId) === String(fiction.fictionId) &&
            !sch.chapter
          );

          if (scheduleIdx === -1) continue;

          // Update the schedule with chapter info
          const updatedSchedules = [...shoutout.schedules];
          updatedSchedules[scheduleIdx] = {
            ...updatedSchedules[scheduleIdx],
            chapter: latestChapter.title,
            chapterUrl: latestChapter.url
          };

          // Save to database
          const updatedShoutout = { ...shoutout, schedules: updatedSchedules };
          await db.save('shoutouts', updatedShoutout);

          console.log('[RR Companion BG] Auto-archived shoutout:', shoutout.authorName || shoutout.fictionTitle, 'in', latestChapter.title);
          totalArchived++;
        }
      } catch (err) {
        console.error('[RR Companion BG] Error checking fiction:', fiction.title, err);
      }
    }

    console.log('[RR Companion BG] Auto-archive complete:', totalArchived, 'archived,', totalChecked, 'checked');
    return { archived: totalArchived, checked: totalChecked };

  } catch (err) {
    console.error('[RR Companion BG] Auto-archive error:', err);
    return { archived: 0, checked: 0, error: err.message };
  }
}


// ============ IMPORT FROM EXCEL ============

async function runImport(workbookData) {
  console.log('[RR Companion BG] Starting import...');

  try {
    await ensureDB();
    await ensureOffscreenDocument();

    const myFictions = await db.getAll('myFictions') || [];
    const existingShoutouts = await db.getAll('shoutouts') || [];
    const existingContacts = await db.getAll('contacts') || [];

    // Cache for contacts
    const contactCache = new Map(existingContacts.map(c => [c.authorName, c]));

    // Build map of existing shoutouts by fiction ID
    const shoutoutsByRrFictionId = new Map();
    for (const s of existingShoutouts) {
      // Use fictionId field directly (preferred) or extract from code as fallback
      if (s.fictionId) {
        shoutoutsByRrFictionId.set(String(s.fictionId), s);
      } else {
        const match = (s.code || '').match(/\/fiction\/(\d+)/);
        if (match) {
          shoutoutsByRrFictionId.set(String(match[1]), s);
        }
      }
    }

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    const errors = [];

    // Count total rows
    let totalRows = 0;
    let processedRows = 0;
    for (const sheet of workbookData.sheets) {
      totalRows += sheet.rows.length;
    }

    // Notify tabs that import has started
    broadcastToTabs({
      type: 'importStarted',
      total: totalRows
    });

    // Process each sheet
    let cancelled = false;
    for (const sheet of workbookData.sheets) {
      if (cancelled) break;
      const isUnscheduled = sheet.name.toLowerCase() === 'unscheduled';

      // Find matching fiction
      let myFiction = null;
      if (!isUnscheduled) {
        myFiction = myFictions.find(f => {
          const sanitizedTitle = (f.title || '').substring(0, 31).replace(/[\\/*?:\[\]]/g, '');
          return sanitizedTitle === sheet.name || f.title === sheet.name;
        });

        if (!myFiction) {
          // Log warning but continue - rows will be imported as unscheduled
          console.log(`[RR Companion BG] Sheet "${sheet.name}" doesn't match any fiction - importing as unscheduled`);
        }
      }

      for (const row of sheet.rows) {
        // Check for user cancellation before each row
        const liveState = await getImportState();
        if (liveState.status !== 'importing') {
          cancelled = true;
          break;
        }

        processedRows++;

        // Update progress every 5 rows
        if (processedRows % 5 === 0) {
          await setImportState({
            status: 'importing',
            current: processedRows,
            total: totalRows,
            imported,
            duplicates,
            skipped
          });

          // Broadcast progress to all tabs
          broadcastToTabs({
            type: 'importProgress',
            current: processedRows,
            total: totalRows,
            imported,
            duplicates,
            skipped
          });
        }

        try {
          const code = row['Code'] || '';
          const date = normalizeDate(row['Date']);

          if (!code.trim()) {
            skipped++;
            continue;
          }

          // Extract fiction ID from code
          const match = code.match(/\/fiction\/(\d+)/);
          if (!match) {
            skipped++;
            continue;
          }
          const rrFictionId = match[1];

          // Parse code for basic info
          let parsedInfo = { fictionId: rrFictionId };

          // Try to fetch fiction details
          try {
            const details = await fetchFictionDetails(rrFictionId);
            if (details) {
              parsedInfo = { ...parsedInfo, ...details };
            }
          } catch (fetchErr) {
            console.log('[RR Companion BG] Could not fetch details for', rrFictionId);
          }

          // Create/update contact
          if (parsedInfo.authorName) {
            let contact = contactCache.get(parsedInfo.authorName);

            if (!contact) {
              const newContact = {
                authorName: parsedInfo.authorName,
                authorAvatar: parsedInfo.authorAvatar || '',
                profileUrl: parsedInfo.profileUrl || ''
              };
              const contactId = await db.save('contacts', newContact);
              contactCache.set(parsedInfo.authorName, { ...newContact, id: contactId });
            } else if (!contact.authorAvatar && parsedInfo.authorAvatar) {
              const updated = { ...contact, authorAvatar: parsedInfo.authorAvatar };
              await db.save('contacts', updated);
              contactCache.set(parsedInfo.authorName, updated);
            }
          }

          // Build schedule
          let newSchedule = null;
          if (myFiction && date) {
            newSchedule = {
              fictionId: String(myFiction.fictionId),
              date: date,
              chapter: row['Chapter'] || null,
              chapterUrl: row['Chapter URL'] || null
            };
          }

          // Check existing
          const existingShoutout = shoutoutsByRrFictionId.get(String(rrFictionId));

          if (existingShoutout) {
            const scheduleExists = newSchedule && (existingShoutout.schedules || []).some(s =>
              String(s.fictionId) === String(newSchedule.fictionId) && s.date === newSchedule.date
            );

            if (scheduleExists) {
              duplicates++;
              continue;
            }

            if (newSchedule) {
              const updatedSchedules = [...(existingShoutout.schedules || []), newSchedule];

              // Also merge swap status if existing doesn't have it but import does
              const updatedShoutout = {
                ...existingShoutout,
                schedules: updatedSchedules,
                // Only update swap status if existing is empty but import has it
                swappedDate: existingShoutout.swappedDate || row['Swapped Date'] || '',
                swappedChapter: existingShoutout.swappedChapter || row['Swapped Chapter'] || '',
                swappedChapterUrl: existingShoutout.swappedChapterUrl || row['Swapped Chapter URL'] || '',
                lastSwapScanDate: existingShoutout.lastSwapScanDate || row['Last Scan Date'] || ''
              };

              await db.save('shoutouts', updatedShoutout);
              existingShoutout.schedules = updatedSchedules;
              imported++;

              // Broadcast that a shoutout was updated for incremental UI refresh
              broadcastToTabs({
                type: 'shoutoutImported',
                shoutout: updatedShoutout,
                imported,
                duplicates,
                skipped,
                current: processedRows,
                total: totalRows
              });
            } else {
              duplicates++;
            }
            continue;
          }

          // Create new shoutout
          const newShoutout = {
            code: code,
            schedules: newSchedule ? [newSchedule] : [],
            fictionId: rrFictionId,
            fictionTitle: parsedInfo.fictionTitle || row['Fiction'] || '',
            fictionUrl: parsedInfo.fictionUrl || row['Fiction URL'] || '',
            coverUrl: parsedInfo.coverUrl || '',
            authorName: parsedInfo.authorName || row['Author'] || '',
            authorAvatar: parsedInfo.authorAvatar || '',
            profileUrl: parsedInfo.profileUrl || '',
            expectedReturnDate: row['Expected Return'] || '',
            // Import swap status if available
            swappedDate: row['Swapped Date'] || '',
            swappedChapter: row['Swapped Chapter'] || '',
            swappedChapterUrl: row['Swapped Chapter URL'] || '',
            lastSwapScanDate: row['Last Scan Date'] || ''
          };

          const newId = await db.save('shoutouts', newShoutout);
          newShoutout.id = newId;
          shoutoutsByRrFictionId.set(String(rrFictionId), newShoutout);
          imported++;

          // Broadcast that a shoutout was imported for incremental UI refresh
          broadcastToTabs({
            type: 'shoutoutImported',
            shoutout: { ...newShoutout, id: newId },
            imported,
            duplicates,
            skipped,
            current: processedRows,
            total: totalRows
          });

        } catch (rowErr) {
          console.error('[RR Companion BG] Row error:', rowErr);
          errors.push(`Row error: ${rowErr.message}`);
        }

        // Small delay to not overwhelm
        await delay(50);
      }
    }

    if (cancelled) {
      console.log('[RR Companion BG] Import cancelled by user');
      await setImportState({ status: 'idle' });
      broadcastToTabs({ type: 'importCancelled' });
      return;
    }

    await setImportState({
      status: 'complete',
      imported,
      skipped,
      duplicates,
      errors,
      completedAt: new Date().toISOString()
    });

    console.log('[RR Companion BG] Import complete:', { imported, skipped, duplicates });

    // Broadcast completion to all tabs
    broadcastToTabs({
      type: 'importComplete',
      imported,
      skipped,
      duplicates,
      errors
    });

  } catch (err) {
    console.error('[RR Companion BG] Import error:', err);
    await setImportState({ status: 'error', error: err.message });
  }
}

// ============ MESSAGE HANDLERS ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ignore messages from offscreen document
  if (sender.url?.includes('offscreen.html')) {
    return false;
  }

  console.log('[RR Companion BG] Received message:', message.type);

  // Scanner commands
  if (message.type === 'startFullScan') {
    getScanState().then(async state => {
      if (state.status === 'scanning') {
        sendResponse({ started: false, reason: 'Already scanning' });
      } else {
        await setScanState({ status: 'scanning', phase: 'init', current: 0, total: 0 });
        broadcastToTabs({ type: 'scanStarted', fictionId: message.fictionId });
        runFullScan(message.fictionId);
        sendResponse({ started: true });
      }
    }).catch(err => {
      sendResponse({ started: false, reason: err.message });
    });
    return true;
  }

  if (message.type === 'getScanState') {
    getScanState().then(state => sendResponse(state));
    return true;
  }

  if (message.type === 'cancelScan') {
    setScanState({ status: 'idle' }).then(() => sendResponse({ cancelled: true }));
    return true;
  }

  // Import commands
  if (message.type === 'startImport') {
    getImportState().then(async state => {
      if (state.status === 'importing') {
        sendResponse({ started: false, reason: 'Already importing' });
      } else {
        await setImportState({ status: 'importing', current: 0, total: 0 });
        runImport(message.workbookData);
        sendResponse({ started: true });
      }
    }).catch(err => {
      sendResponse({ started: false, reason: err.message });
    });
    return true;
  }

  if (message.type === 'getImportState') {
    getImportState().then(state => sendResponse(state));
    return true;
  }

  if (message.type === 'cancelImport') {
    setImportState({ status: 'idle' }).then(() => sendResponse({ cancelled: true }));
    return true;
  }

  // Swap check state
  if (message.type === 'getSwapCheckState') {
    getSwapCheckState().then(state => sendResponse(state));
    return true;
  }

  if (message.type === 'getShoutoutCheckState') {
    getSwapCheckState().then(state => {
      const checkState = state.checks?.[message.shoutoutId] || { status: 'idle' };
      sendResponse(checkState);
    });
    return true;
  }

  if (message.type === 'clearSwapCheckState') {
    (async () => {
      const state = await getSwapCheckState();
      if (message.shoutoutId) {
        delete state.checks?.[message.shoutoutId];
      } else {
        state.checks = {};
      }
      await setSwapCheckState(state);
      sendResponse({ success: true });
    })();
    return true;
  }

  // Auto-archive today's chapters
  if (message.type === 'autoArchiveToday') {
    autoArchiveToday().then(result => sendResponse(result));
    return true;
  }

  // Check swap return - scan their fiction for our shoutout
  if (message.type === 'checkSwapReturn') {
    console.log('[RR Companion BG] Received checkSwapReturn message:', message);
    checkSwapReturn(message.shoutoutId, message.theirFictionId, message.myFictionIds)
      .then(result => {
        console.log('[RR Companion BG] checkSwapReturn result:', result);
        sendResponse(result);
      })
      .catch(err => {
        console.error('[RR Companion BG] checkSwapReturn error:', err);
        sendResponse({ found: false, error: err.message });
      });
    return true;
  }

  // Check ALL swaps - scan all unswapped shoutouts.
  // Optional `fictionId` scopes the check to a single fiction's shoutouts.
  if (message.type === 'checkAllSwaps') {
    console.log('[RR Companion BG] Received checkAllSwaps message', message.fictionId ? { fictionId: message.fictionId } : '');
    checkAllSwaps({ fictionId: message.fictionId || null })
      .then(result => {
        console.log('[RR Companion BG] checkAllSwaps result:', result);
        sendResponse(result);
      })
      .catch(err => {
        console.error('[RR Companion BG] checkAllSwaps error:', err);
        sendResponse({ checked: 0, found: 0, error: err.message });
      });
    return true;
  }

  if (message.type === 'cancelCheckAllSwaps') {
    setCheckAllSwapsState({ status: 'idle' }).then(() => sendResponse({ cancelled: true }));
    return true;
  }

  if (message.type === 'getCheckAllSwapsState') {
    getCheckAllSwapsState().then(state => sendResponse(state));
    return true;
  }

  // ============ DB OPERATIONS ============

  if (message.type === 'db:getAll') {
    (async () => {
      try {
        await ensureDB();
        const data = await db.getAll(message.storeName);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'db:getById') {
    (async () => {
      try {
        await ensureDB();
        const data = await db.getById(message.storeName, message.id);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'db:getByIndex') {
    (async () => {
      try {
        await ensureDB();
        const data = await db.getByIndex(message.storeName, message.indexName, message.value);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'db:save') {
    (async () => {
      try {
        await ensureDB();
        const id = await db.save(message.storeName, message.data);
        sendResponse({ success: true, id });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'db:deleteById') {
    (async () => {
      try {
        await ensureDB();
        await db.deleteById(message.storeName, message.id);
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'db:upsert') {
    (async () => {
      try {
        await ensureDB();
        const result = await db.upsert(message.storeName, message.data);
        sendResponse({ success: true, data: result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'db:clearAll') {
    (async () => {
      try {
        await ensureDB();
        const stores = ['contacts', 'fictions', 'shoutouts', 'myFictions', 'myCodes'];
        for (const storeName of stores) {
          const items = await db.getAll(storeName);
          for (const item of items) {
            await db.deleteById(storeName, item.id);
          }
        }
        // Also clear scan/import states in chrome.storage.local
        await chrome.storage.local.remove([SCAN_STATE_KEY, IMPORT_STATE_KEY, SWAP_CHECK_STATE_KEY]);
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Writers Guild import
  if (message.type === 'importGuildShoutouts') {
    (async () => {
      try {
        await ensureDB();
        const entries = message.entries || [];
        let imported = 0;

        // Get existing shoutouts to check for duplicates
        const existingShoutouts = await db.getAll('shoutouts');

        for (const entry of entries) {
          try {
            // Extract fiction ID from the shoutout code
            const fictionIdMatch = entry.code.match(/\/fiction\/(\d+)/);
            if (!fictionIdMatch) continue;

            const fictionId = fictionIdMatch[1];

            // Check for duplicate (same fictionId and date)
            const isDuplicate = existingShoutouts.some(s =>
              s.fictionId === fictionId &&
              s.schedules?.some(sch => sch.date === entry.date)
            );

            if (isDuplicate) continue;

            // Fetch fiction details
            const details = await fetchFictionDetails(fictionId);

            // Create shoutout entry (without scheduling to a specific fiction)
            const shoutout = {
              code: entry.code,
              fictionId,
              fictionTitle: details?.fictionTitle || '',
              fictionUrl: `https://www.royalroad.com/fiction/${fictionId}`,
              coverUrl: details?.coverUrl || '',
              authorName: details?.authorName || '',
              authorAvatar: details?.authorAvatar || '',
              profileUrl: details?.profileUrl || '',
              schedules: [{
                fictionId: null, // User will assign later
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
            imported++;
          } catch (err) {
            console.error('[RR Companion BG] Error importing guild entry:', err);
          }
        }

        sendResponse({ success: true, count: imported });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  return false;
});

// Initialize on install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('[RR Companion] Service worker installed');
  setScanState({ status: 'idle' });
});
