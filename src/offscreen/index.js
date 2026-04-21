// Royal Road Companion - Offscreen Document for DOM Parsing
import { parseFictionDetails } from '../common/utils/fictionDetails.js';

console.log('[RR Companion Offscreen] Loaded');

// Parse fiction page to get title and chapter list
function parseChapterList(html, fictionId) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let fictionTitle = '';
  const h3Title = doc.querySelector('h3.text-on-surface-strong');
  if (h3Title) fictionTitle = h3Title.textContent.trim();
  if (!fictionTitle) {
    const h1Title = doc.querySelector('h1.font-white');
    if (h1Title) fictionTitle = h1Title.textContent.trim();
  }
  if (!fictionTitle) {
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      fictionTitle = ogTitle.getAttribute('content')?.replace(/\s*\|\s*Royal Road.*$/i, '').trim() || '';
    }
  }
  fictionTitle = fictionTitle || 'Unknown Fiction';

  const chapters = [];
  const seen = new Set();

  // Strategy 1: the chapter list table — most reliable when RR's current layout is intact.
  for (const row of doc.querySelectorAll('#chapters tbody tr[data-url]')) {
    const url = row.dataset.url;
    if (!url || seen.has(url)) continue;
    const titleEl = row.querySelector('td:first-child a');
    const dateEl = row.querySelector('td:last-child time, time[datetime]');
    if (!titleEl) continue;

    let chapterDate = null;
    const datetime = dateEl?.getAttribute('datetime');
    if (datetime) chapterDate = new Date(datetime).toLocaleDateString('en-CA');

    seen.add(url);
    chapters.push({
      url: url.startsWith('http') ? url : `https://www.royalroad.com${url}`,
      title: (titleEl.textContent || '').trim() || 'Untitled',
      date: chapterDate,
    });
  }

  // Strategy 2 (fallback): URL pattern + nearby <time>. Only runs if the table
  // selector found nothing (RR likely restructured the layout). The time
  // requirement filters out buttons like "Continue Reading" which share the
  // /fiction/<id>/.../chapter/<n> URL pattern but have no associated time.
  if (chapters.length === 0) {
    const chapterHrefRe = new RegExp(`^/fiction/${fictionId}/[^/]+/chapter/\\d+`);
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (!chapterHrefRe.test(href)) continue;
      if (seen.has(href)) continue;

      const block = a.closest('tr, li, article, .chapter-row');
      const timeEl =
        block?.querySelector('time[datetime]') ||
        a.closest('div')?.querySelector('time[datetime]') ||
        a.parentElement?.querySelector('time[datetime]');
      if (!timeEl) continue;

      seen.add(href);
      const chapterDate = timeEl.getAttribute('datetime')
        ? new Date(timeEl.getAttribute('datetime')).toLocaleDateString('en-CA')
        : null;

      chapters.push({
        url: href.startsWith('http') ? href : `https://www.royalroad.com${href}`,
        title: (a.textContent || '').trim() || 'Untitled',
        date: chapterDate,
      });
    }
  }

  return { fictionId, fictionTitle, chapters };
}

// Parse chapter page to get author notes (only notes with fiction URLs)
function parseChapterNotes(html, chapterUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let combined = '';

  const selectors = [
    '.author-note',
    '.author-note-card',
    '.author-note-portlet',
    '.portlet-body',
    '[class*="author-note"]',
    '.chapter-inner > div:first-child',
    '.chapter-inner > div:last-child',
    '.post-note',
    '.pre-note',
  ];

  for (const selector of selectors) {
    doc.querySelectorAll(selector).forEach((el) => {
      if (el.querySelector('a[href*="/fiction/"]')) {
        combined += el.innerHTML + '\n';
      }
    });
  }

  if (!combined.trim()) {
    doc.querySelectorAll('a[href*="/fiction/"]').forEach((link) => {
      const parent = link.closest('div, p, section');
      if (parent) combined += parent.outerHTML + '\n';
    });
  }

  return { combined, url: chapterUrl };
}

function isStyledContainer(el) {
  const style = el.getAttribute('style') || '';
  return /border(-left|-right|-top|-bottom)?:\s*\d+px/i.test(style) ||
    /padding:\s*\d{2,}px/i.test(style) ||
    /border-radius/i.test(style);
}

function extractShoutouts(html, excludeFictionId) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstChild;

  const results = {};
  const links = container.querySelectorAll('a[href*="/fiction/"]');

  for (const link of links) {
    const match = link.href.match(/\/fiction\/(\d+)/);
    if (!match) continue;

    const fictionId = match[1];
    if (fictionId === String(excludeFictionId)) continue;
    if (results[fictionId]) continue;

    let codeElement = link;
    let styledAncestor = null;

    while (codeElement.parentElement && codeElement.parentElement !== container) {
      const parent = codeElement.parentElement;
      if (isStyledContainer(parent)) styledAncestor = parent;
      codeElement = parent;
    }

    const finalElement = styledAncestor || codeElement;
    results[fictionId] = finalElement.outerHTML || '';
  }

  return results;
}

if (typeof window !== 'undefined') {
  window.__rrParsers = { parseChapterList, parseChapterNotes, extractShoutouts, parseFictionDetails };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handlers = {
    parseChapterList: () => parseChapterList(request.html, request.fictionId),
    parseChapterNotes: () => parseChapterNotes(request.html, request.chapterUrl),
    extractShoutouts: () => extractShoutouts(request.html, request.excludeFictionId),
    parseFictionDetails: () => parseFictionDetails(request.html, request.fictionId),
  };

  const handler = handlers[request.type];
  if (!handler) return;

  try {
    sendResponse({ success: true, data: handler() });
  } catch (err) {
    console.error('[RR Companion Offscreen] Parse error:', err);
    sendResponse({ success: false, error: err.message });
  }
  return true;
});
