// Royal Road Companion - Offscreen Document for DOM Parsing.
// Parser logic lives in ../common/parsers/index.js so the background
// event page can also call it directly on browsers that don't support
// chrome.offscreen (e.g. Firefox).
import {
  parseChapterList,
  parseChapterNotes,
  extractShoutouts,
  parseFictionDetails,
} from '../common/parsers/index.js';

console.log('[RR Companion Offscreen] Loaded');

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
