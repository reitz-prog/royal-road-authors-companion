(() => {
  // src/common/utils/fictionDetails.js
  function parseFictionDetails(html, fictionId) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fictionTitle = extractTitle(doc);
    const coverUrl = extractCover(doc);
    const { authorName, profileId, profileUrl, authorAvatar } = extractAuthor(doc);
    return {
      fictionId: String(fictionId),
      fictionTitle: fictionTitle || "Unknown",
      fictionUrl: `https://www.royalroad.com/fiction/${fictionId}`,
      coverUrl,
      authorName,
      authorAvatar,
      profileId,
      profileUrl
    };
  }
  function extractTitle(doc) {
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    if (ogTitle)
      return ogTitle.replace(/\s*\|\s*Royal Road.*$/i, "").trim();
    const coverAlt = doc.querySelector('img[data-type="cover"]')?.getAttribute("alt");
    if (coverAlt)
      return coverAlt.trim();
    const h3 = doc.querySelector("h3.text-on-surface-strong")?.textContent?.trim();
    if (h3)
      return h3;
    const h1 = doc.querySelector("h1.font-white")?.textContent?.trim();
    if (h1)
      return h1;
    return "";
  }
  function extractCover(doc) {
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content");
    if (ogImage)
      return ogImage;
    const coverImg = doc.querySelector('img[data-type="cover"]')?.getAttribute("src");
    if (coverImg)
      return coverImg;
    const fallback = doc.querySelector("img.cover-art-image, .fiction-header img, .cover-art img")?.getAttribute("src");
    return fallback || "";
  }
  function extractAuthor(doc) {
    const metaAuthor = doc.querySelector('meta[property="books:author"], meta[name="author"]')?.getAttribute("content")?.trim() || "";
    const avatarImgs = doc.querySelectorAll('a[href*="/profile/"] img[data-type="avatar"][alt]');
    for (const img of avatarImgs) {
      const alt = (img.getAttribute("alt") || "").trim();
      if (!alt)
        continue;
      if (metaAuthor && alt !== metaAuthor)
        continue;
      const link = img.closest('a[href*="/profile/"]');
      const m = (link?.getAttribute("href") || "").match(/\/profile\/(\d+)/);
      if (!m)
        continue;
      const src = img.getAttribute("src") || "";
      const avatarUrl = src.includes("royalroadcdn.com") && src.includes("/avatars/avatar-") ? src : "";
      return {
        authorName: alt,
        profileId: m[1],
        profileUrl: `https://www.royalroad.com/profile/${m[1]}`,
        authorAvatar: avatarUrl
      };
    }
    if (metaAuthor) {
      for (const link of doc.querySelectorAll('a[href*="/profile/"]')) {
        const text = (link.textContent || "").trim();
        if (text && (text === metaAuthor || text.includes(metaAuthor) || metaAuthor.includes(text))) {
          const m = (link.getAttribute("href") || "").match(/\/profile\/(\d+)/);
          if (m) {
            return {
              authorName: metaAuthor,
              profileId: m[1],
              profileUrl: `https://www.royalroad.com/profile/${m[1]}`,
              authorAvatar: ""
            };
          }
        }
      }
      return { authorName: metaAuthor, profileId: null, profileUrl: "", authorAvatar: "" };
    }
    for (const link of doc.querySelectorAll('a[href*="/profile/"]')) {
      const h4 = link.querySelector("h4");
      if (!h4)
        continue;
      const m = (link.getAttribute("href") || "").match(/\/profile\/(\d+)/);
      if (m) {
        return {
          authorName: h4.textContent.trim(),
          profileId: m[1],
          profileUrl: `https://www.royalroad.com/profile/${m[1]}`,
          authorAvatar: ""
        };
      }
    }
    return { authorName: "", profileId: null, profileUrl: "", authorAvatar: "" };
  }

  // src/offscreen/index.js
  console.log("[RR Companion Offscreen] Loaded");
  function parseChapterList(html, fictionId) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    let fictionTitle = "";
    const h3Title = doc.querySelector("h3.text-on-surface-strong");
    if (h3Title)
      fictionTitle = h3Title.textContent.trim();
    if (!fictionTitle) {
      const h1Title = doc.querySelector("h1.font-white");
      if (h1Title)
        fictionTitle = h1Title.textContent.trim();
    }
    if (!fictionTitle) {
      const ogTitle = doc.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        fictionTitle = ogTitle.getAttribute("content")?.replace(/\s*\|\s*Royal Road.*$/i, "").trim() || "";
      }
    }
    fictionTitle = fictionTitle || "Unknown Fiction";
    const chapters = [];
    const seen = /* @__PURE__ */ new Set();
    for (const row of doc.querySelectorAll("#chapters tbody tr[data-url]")) {
      const url = row.dataset.url;
      if (!url || seen.has(url))
        continue;
      const titleEl = row.querySelector("td:first-child a");
      const dateEl = row.querySelector("td:last-child time, time[datetime]");
      if (!titleEl)
        continue;
      let chapterDate = null;
      const datetime = dateEl?.getAttribute("datetime");
      if (datetime)
        chapterDate = new Date(datetime).toLocaleDateString("en-CA");
      seen.add(url);
      chapters.push({
        url: url.startsWith("http") ? url : `https://www.royalroad.com${url}`,
        title: (titleEl.textContent || "").trim() || "Untitled",
        date: chapterDate
      });
    }
    if (chapters.length === 0) {
      const chapterHrefRe = new RegExp(`^/fiction/${fictionId}/[^/]+/chapter/\\d+`);
      for (const a of doc.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href") || "";
        if (!chapterHrefRe.test(href))
          continue;
        if (seen.has(href))
          continue;
        const block = a.closest("tr, li, article, .chapter-row");
        const timeEl = block?.querySelector("time[datetime]") || a.closest("div")?.querySelector("time[datetime]") || a.parentElement?.querySelector("time[datetime]");
        if (!timeEl)
          continue;
        seen.add(href);
        const chapterDate = timeEl.getAttribute("datetime") ? new Date(timeEl.getAttribute("datetime")).toLocaleDateString("en-CA") : null;
        chapters.push({
          url: href.startsWith("http") ? href : `https://www.royalroad.com${href}`,
          title: (a.textContent || "").trim() || "Untitled",
          date: chapterDate
        });
      }
    }
    return { fictionId, fictionTitle, chapters };
  }
  function parseChapterNotes(html, chapterUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    let combined = "";
    const selectors = [
      ".author-note",
      ".author-note-card",
      ".author-note-portlet",
      ".portlet-body",
      '[class*="author-note"]',
      ".chapter-inner > div:first-child",
      ".chapter-inner > div:last-child",
      ".post-note",
      ".pre-note"
    ];
    for (const selector of selectors) {
      doc.querySelectorAll(selector).forEach((el) => {
        if (el.querySelector('a[href*="/fiction/"]')) {
          combined += el.innerHTML + "\n";
        }
      });
    }
    if (!combined.trim()) {
      doc.querySelectorAll('a[href*="/fiction/"]').forEach((link) => {
        const parent = link.closest("div, p, section");
        if (parent)
          combined += parent.outerHTML + "\n";
      });
    }
    return { combined, url: chapterUrl };
  }
  function isStyledContainer(el) {
    const style = el.getAttribute("style") || "";
    return /border(-left|-right|-top|-bottom)?:\s*\d+px/i.test(style) || /padding:\s*\d{2,}px/i.test(style) || /border-radius/i.test(style);
  }
  function extractShoutouts(html, excludeFictionId) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
    const container = doc.body.firstChild;
    const results = {};
    const links = container.querySelectorAll('a[href*="/fiction/"]');
    for (const link of links) {
      const match = link.href.match(/\/fiction\/(\d+)/);
      if (!match)
        continue;
      const fictionId = match[1];
      if (fictionId === String(excludeFictionId))
        continue;
      if (results[fictionId])
        continue;
      let codeElement = link;
      let styledAncestor = null;
      while (codeElement.parentElement && codeElement.parentElement !== container) {
        const parent = codeElement.parentElement;
        if (isStyledContainer(parent))
          styledAncestor = parent;
        codeElement = parent;
      }
      const finalElement = styledAncestor || codeElement;
      results[fictionId] = finalElement.outerHTML || "";
    }
    return results;
  }
  if (typeof window !== "undefined") {
    window.__rrParsers = { parseChapterList, parseChapterNotes, extractShoutouts, parseFictionDetails };
  }
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handlers = {
      parseChapterList: () => parseChapterList(request.html, request.fictionId),
      parseChapterNotes: () => parseChapterNotes(request.html, request.chapterUrl),
      extractShoutouts: () => extractShoutouts(request.html, request.excludeFictionId),
      parseFictionDetails: () => parseFictionDetails(request.html, request.fictionId)
    };
    const handler = handlers[request.type];
    if (!handler)
      return;
    try {
      sendResponse({ success: true, data: handler() });
    } catch (err) {
      console.error("[RR Companion Offscreen] Parse error:", err);
      sendResponse({ success: false, error: err.message });
    }
    return true;
  });
})();
//# sourceMappingURL=offscreen.js.map
