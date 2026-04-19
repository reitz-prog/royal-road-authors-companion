// Royal Road Companion - Offscreen Document for DOM Parsing
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
  const chapterRows = doc.querySelectorAll('#chapters tbody tr[data-url]');

  chapterRows.forEach(row => {
    const url = row.dataset.url;
    const titleEl = row.querySelector('td:first-child a');
    const dateEl = row.querySelector('td:last-child time');

    let chapterDate = null;
    const datetime = dateEl?.getAttribute('datetime');
    if (datetime) {
      const localDate = new Date(datetime);
      chapterDate = localDate.toLocaleDateString('en-CA');
    }

    if (url && titleEl) {
      chapters.push({
        url: url.startsWith('http') ? url : `https://www.royalroad.com${url}`,
        title: titleEl.textContent?.trim() || 'Untitled',
        date: chapterDate
      });
    }
  });

  return { fictionId, fictionTitle, chapters };
}

// Parse chapter page to get author notes (only notes with fiction URLs)
function parseChapterNotes(html, chapterUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let combined = '';

  // Try multiple selectors for author notes (Royal Road changes these)
  const selectors = [
    '.author-note',
    '.author-note-card',
    '.author-note-portlet',
    '.portlet-body',
    '[class*="author-note"]',
    '.chapter-inner > div:first-child', // Pre-chapter note
    '.chapter-inner > div:last-child',  // Post-chapter note
    '.post-note',
    '.pre-note'
  ];

  for (const selector of selectors) {
    const elements = doc.querySelectorAll(selector);
    elements.forEach(el => {
      // Include if it has fiction links
      if (el.querySelector('a[href*="/fiction/"]')) {
        combined += el.innerHTML + '\n';
      }
    });
  }

  // Fallback: search entire page for fiction links if nothing found
  if (!combined.trim()) {
    const allFictionLinks = doc.querySelectorAll('a[href*="/fiction/"]');
    allFictionLinks.forEach(link => {
      // Get parent container
      const parent = link.closest('div, p, section');
      if (parent) {
        combined += parent.outerHTML + '\n';
      }
    });
  }

  console.log('[RR Offscreen] parseChapterNotes:', chapterUrl, 'found links:', combined.includes('/fiction/'));

  return { combined, url: chapterUrl };
}

// Check if element has styled container appearance (borders, significant padding)
function isStyledContainer(el) {
  const style = el.getAttribute('style') || '';
  // Look for border, padding, or margin styling that suggests a styled block
  return /border(-left|-right|-top|-bottom)?:\s*\d+px/i.test(style) ||
         /padding:\s*\d{2,}px/i.test(style) ||
         /border-radius/i.test(style);
}

// Extract shoutouts (fiction links) from HTML
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

    // Walk up to find the outermost styled container (or direct child of container)
    while (codeElement.parentElement && codeElement.parentElement !== container) {
      const parent = codeElement.parentElement;

      // Track if this is a styled container
      if (isStyledContainer(parent)) {
        styledAncestor = parent;
      }

      codeElement = parent;
    }

    // Use the styled ancestor if found, otherwise the element right before container
    const finalElement = styledAncestor || codeElement;
    const code = finalElement.outerHTML || '';
    results[fictionId] = code;
  }

  return results;
}

// Parse fiction page for details (title, author, cover)
function parseFictionDetails(html, fictionId) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Get fiction title
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

  // Get cover image
  let coverUrl = '';
  const coverImg = doc.querySelector('img.cover-art-image, .fiction-header img, .cover-art img');
  if (coverImg) {
    coverUrl = coverImg.getAttribute('src') || '';
  }
  if (!coverUrl) {
    const ogImage = doc.querySelector('meta[property="og:image"]');
    if (ogImage) {
      coverUrl = ogImage.getAttribute('content') || '';
    }
  }

  // Get author info
  let authorName = '';
  let authorAvatar = '';
  let profileUrl = '';
  let profileId = null;

  // Step 1: Get author name from meta tag (most reliable)
  const authorMeta = doc.querySelector('meta[property="books:author"], meta[name="author"]');
  if (authorMeta) {
    authorName = authorMeta.getAttribute('content') || '';
    console.log('[RR Offscreen] Got author name from meta:', authorName);
  }

  // Step 2: Find profile link containing the author name to get profileId
  if (authorName) {
    const allProfileLinks = doc.querySelectorAll('a[href*="/profile/"]');
    for (const link of allProfileLinks) {
      const text = link.textContent.trim();
      if (text === authorName || text.includes(authorName)) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/profile\/(\d+)/);
        if (match) {
          profileId = match[1];
          profileUrl = `https://www.royalroad.com/profile/${profileId}`;
          console.log('[RR Offscreen] Found profile link for author:', { authorName, profileId });
          break;
        }
      }
    }
  }

  // Step 3: Find avatar matching the profileId
  if (profileId) {
    const avatarPattern = new RegExp(`avatars/avatar-${profileId}-[^"'\\s]+`);
    const avatarMatch = html.match(avatarPattern);
    if (avatarMatch) {
      authorAvatar = 'https://www.royalroadcdn.com/public/' + avatarMatch[0];
      console.log('[RR Offscreen] Found matching avatar for profileId:', profileId);
    }
  }

  // Fallback: if no profileId yet, try finding from profile links with h4
  if (!profileId) {
    const authorLinks = doc.querySelectorAll('a[href*="/profile/"]');
    for (const link of authorLinks) {
      const h4 = link.querySelector('h4');
      if (h4) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/profile\/(\d+)/);
        if (match) {
          profileId = match[1];
          profileUrl = `https://www.royalroad.com/profile/${profileId}`;
          if (!authorName) authorName = h4.textContent.trim();
          console.log('[RR Offscreen] Found author from h4 fallback:', { authorName, profileId });
          break;
        }
      }
    }
  }

  console.log('[RR Offscreen] parseFictionDetails result:', { fictionId, fictionTitle, authorName, profileId, hasAvatar: !!authorAvatar });

  return {
    fictionId,
    fictionTitle: fictionTitle || 'Unknown',
    fictionUrl: `https://www.royalroad.com/fiction/${fictionId}`,
    coverUrl,
    authorName,
    authorAvatar,
    profileUrl
  };
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[RR Companion Offscreen] Received:', request.type);

  if (request.type === 'parseChapterList') {
    try {
      const result = parseChapterList(request.html, request.fictionId);
      sendResponse({ success: true, data: result });
    } catch (err) {
      console.error('[RR Companion Offscreen] Parse error:', err);
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (request.type === 'parseChapterNotes') {
    try {
      const result = parseChapterNotes(request.html, request.chapterUrl);
      sendResponse({ success: true, data: result });
    } catch (err) {
      console.error('[RR Companion Offscreen] Parse error:', err);
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (request.type === 'extractShoutouts') {
    try {
      const result = extractShoutouts(request.html, request.excludeFictionId);
      sendResponse({ success: true, data: result });
    } catch (err) {
      console.error('[RR Companion Offscreen] Parse error:', err);
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (request.type === 'parseFictionDetails') {
    try {
      const result = parseFictionDetails(request.html, request.fictionId);
      sendResponse({ success: true, data: result });
    } catch (err) {
      console.error('[RR Companion Offscreen] Parse error:', err);
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }
});
