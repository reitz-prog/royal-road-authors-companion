// src/common/db/core.js
var DB_NAME = "rr-companion";
var DB_VERSION = 1;
var db = null;
async function openDB() {
  if (db)
    return db;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains("contacts")) {
        const contacts = database.createObjectStore("contacts", { keyPath: "id", autoIncrement: true });
        contacts.createIndex("authorName", "authorName", { unique: false });
        contacts.createIndex("profileUrl", "profileUrl", { unique: false });
      }
      if (!database.objectStoreNames.contains("fictions")) {
        const fictions = database.createObjectStore("fictions", { keyPath: "id", autoIncrement: true });
        fictions.createIndex("fictionId", "fictionId", { unique: true });
        fictions.createIndex("contactId", "contactId", { unique: false });
      }
      if (!database.objectStoreNames.contains("shoutouts")) {
        const shoutouts = database.createObjectStore("shoutouts", { keyPath: "id", autoIncrement: true });
        shoutouts.createIndex("fictionId", "fictionId", { unique: false });
      }
      if (!database.objectStoreNames.contains("myFictions")) {
        const myFictions = database.createObjectStore("myFictions", { keyPath: "id", autoIncrement: true });
        myFictions.createIndex("fictionId", "fictionId", { unique: true });
      }
      if (!database.objectStoreNames.contains("myCodes")) {
        const myCodes = database.createObjectStore("myCodes", { keyPath: "id", autoIncrement: true });
        myCodes.createIndex("fictionId", "fictionId", { unique: false });
      }
      if (!database.objectStoreNames.contains("followerData")) {
        database.createObjectStore("followerData", { keyPath: "fictionId" });
      }
      if (!database.objectStoreNames.contains("favoritesData")) {
        database.createObjectStore("favoritesData", { keyPath: "fictionId" });
      }
    };
  });
}
async function getAll(storeName) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function getById(storeName, id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function getByIndex(storeName, indexName, value) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.get(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function save(storeName, data) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const saveData = { ...data };
    if (saveData.id === void 0 || saveData.id === null) {
      delete saveData.id;
      saveData.createdAt = now;
    }
    saveData.updatedAt = now;
    const request = saveData.id ? store.put(saveData) : store.add(saveData);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function deleteById(storeName, id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}
async function upsert(storeName, data) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// src/common/logging/core.js
var MAX_LOGS = 1e4;
var SEVEN_DAYS = 7 * 24 * 60 * 60 * 1e3;
var isDev = typeof chrome !== "undefined" && chrome.runtime?.getManifest ? !("update_url" in chrome.runtime.getManifest()) : true;
var logs = [];
var flushTimeout = null;
function formatTime() {
  const d = /* @__PURE__ */ new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}
function createEntry(level, module, msg, data) {
  return {
    t: Date.now(),
    time: formatTime(),
    level,
    module,
    msg,
    data: data !== void 0 ? safeStringify(data) : void 0
  };
}
function safeStringify(data) {
  try {
    return JSON.stringify(data, (key, val) => {
      if (typeof val === "object" && val !== null) {
        if (val instanceof Error)
          return { message: val.message, stack: val.stack };
      }
      return val;
    });
  } catch {
    return String(data);
  }
}
function format(level, module, msg) {
  return `[RR] [${formatTime()}] [${level}] [${module}] ${msg}`;
}
function toConsole(level, module, msg, data) {
  const formatted = format(level, module, msg);
  const args = data !== void 0 ? [formatted, data] : [formatted];
  switch (level) {
    case "ERROR":
      console.error(...args);
      break;
    case "WARN":
      console.warn(...args);
      break;
    default:
      console.log(...args);
  }
}
function scheduleFlush() {
  if (flushTimeout)
    return;
  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushToStorage();
  }, 1e3);
}
async function flushToStorage() {
  if (logs.length === 0)
    return;
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const result = await chrome.storage.local.get("rrLogs");
      let stored = result.rrLogs || [];
      stored.push(...logs);
      logs = [];
      const cutoff = Date.now() - SEVEN_DAYS;
      stored = stored.filter((e) => e.t > cutoff).slice(-MAX_LOGS);
      await chrome.storage.local.set({ rrLogs: stored });
    }
  } catch (e) {
    console.error("[RR] Log flush failed:", e);
  }
}
function logAt(level, module, msg, data) {
  const entry = createEntry(level, module, msg, data);
  toConsole(level, module, msg, data);
  if (level !== "DEBUG" || isDev) {
    logs.push(entry);
    scheduleFlush();
  }
}
var log = {
  error: (module, msg, data) => logAt("ERROR", module, msg, data),
  warn: (module, msg, data) => logAt("WARN", module, msg, data),
  info: (module, msg, data) => logAt("INFO", module, msg, data),
  debug: (module, msg, data) => {
    if (isDev)
      logAt("DEBUG", module, msg, data);
  },
  scope(module) {
    return {
      error: (msg, data) => log.error(module, msg, data),
      warn: (msg, data) => log.warn(module, msg, data),
      info: (msg, data) => log.info(module, msg, data),
      debug: (msg, data) => log.debug(module, msg, data)
    };
  },
  flush: flushToStorage,
  isDev,
  async getLogs() {
    await flushToStorage();
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const result = await chrome.storage.local.get("rrLogs");
      return result.rrLogs || [];
    }
    return [];
  },
  async getLogsAsText() {
    const logs2 = await this.getLogs();
    return logs2.map((e) => {
      const dataStr = e.data ? ` ${e.data}` : "";
      return `[${new Date(e.t).toISOString()}] [${e.level}] [${e.module}] ${e.msg}${dataStr}`;
    }).join("\n");
  },
  async clearLogs() {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.remove("rrLogs");
    }
    logs = [];
  }
};

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
    let avatarUrl = "";
    for (const img of doc.querySelectorAll('img[data-type="avatar"][alt]')) {
      const alt = (img.getAttribute("alt") || "").trim();
      if (alt !== metaAuthor)
        continue;
      const src = img.getAttribute("src") || "";
      if (src.includes("royalroadcdn.com") && src.includes("/avatars/avatar-")) {
        avatarUrl = src;
        break;
      }
    }
    for (const link of doc.querySelectorAll('a[href*="/profile/"]')) {
      const text = (link.textContent || "").trim();
      if (text && (text === metaAuthor || text.includes(metaAuthor) || metaAuthor.includes(text))) {
        const m = (link.getAttribute("href") || "").match(/\/profile\/(\d+)/);
        if (m) {
          return {
            authorName: metaAuthor,
            profileId: m[1],
            profileUrl: `https://www.royalroad.com/profile/${m[1]}`,
            authorAvatar: avatarUrl
          };
        }
      }
    }
    return { authorName: metaAuthor, profileId: null, profileUrl: "", authorAvatar: avatarUrl };
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

// src/common/parsers/index.js
var parseFictionDetails2 = parseFictionDetails;
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

// src/background/index.js
var logger = log.scope("background");
var authorLogger = log.scope("author-data");
console.log("[RR Companion BG] Service worker loading...");
var SCAN_STATE_KEY = "scanState";
var IMPORT_STATE_KEY = "importState";
var SWAP_CHECK_STATE_KEY = "swapCheckState";
var CHECK_ALL_SWAPS_STATE_KEY = "checkAllSwapsState";
async function getCheckAllSwapsState() {
  const result = await chrome.storage.local.get(CHECK_ALL_SWAPS_STATE_KEY);
  return result[CHECK_ALL_SWAPS_STATE_KEY] || { status: "idle" };
}
async function setCheckAllSwapsState(state) {
  await chrome.storage.local.set({ [CHECK_ALL_SWAPS_STATE_KEY]: state });
}
var dbReady = false;
function normalizeDate(value) {
  if (value === null || value === void 0 || value === "")
    return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = (value - 25569) * 86400 * 1e3;
    const d = new Date(ms);
    if (!isNaN(d.getTime()))
      return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s)
    return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s))
    return s;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime()))
    return parsed.toISOString().slice(0, 10);
  return null;
}
async function ensureDB() {
  if (!dbReady) {
    await openDB();
    dbReady = true;
    await runLegacySwapMigration();
  }
}
function today() {
  return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
}
function fictionLinkRegex(fictionId) {
  return new RegExp(`/fiction/${fictionId}(?=[/"'\\s?#]|$)`, "i");
}
function findTargetSchedule(shoutout, myFictionId) {
  return (shoutout.schedules || []).filter((s) => String(s.fictionId) === String(myFictionId) && !s.swappedDate).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))[0] || null;
}
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
function stampScanDateOnSchedules(shoutout, myFictionIdSet, day) {
  for (const sched of shoutout.schedules || []) {
    if (myFictionIdSet.has(String(sched.fictionId))) {
      sched.lastSwapScanDate = day;
    }
  }
}
function syncShoutoutSwapSummary(shoutout) {
  const schedules = shoutout.schedules || [];
  if (schedules.length === 0)
    return;
  const swapped = schedules.filter((s) => s.swappedDate).sort((a, b) => String(a.swappedDate).localeCompare(String(b.swappedDate)))[0];
  if (swapped) {
    shoutout.swappedDate = swapped.swappedDate;
    shoutout.swappedChapter = swapped.swappedChapter || null;
    shoutout.swappedChapterUrl = swapped.swappedChapterUrl || null;
  } else {
    shoutout.swappedDate = null;
    shoutout.swappedChapter = null;
    shoutout.swappedChapterUrl = null;
  }
  const scanDates = schedules.map((s) => s.lastSwapScanDate).filter(Boolean).sort();
  if (scanDates.length)
    shoutout.lastSwapScanDate = scanDates[scanDates.length - 1];
}
function migrateLegacyShoutout(shoutout) {
  const schedules = shoutout.schedules || [];
  if (schedules.length === 0)
    return false;
  const anySwap = schedules.some((s) => s.swappedDate);
  const anyScan = schedules.some((s) => s.lastSwapScanDate);
  let mutated = false;
  if (shoutout.swappedDate && !anySwap) {
    const byDate = (a, b) => String(a.date || "").localeCompare(String(b.date || ""));
    const archived = schedules.filter((s) => s.chapter).sort(byDate);
    const target = archived[0] || schedules.slice().sort(byDate)[0];
    if (target) {
      target.swappedDate = shoutout.swappedDate;
      target.swappedChapter = shoutout.swappedChapter || null;
      target.swappedChapterUrl = shoutout.swappedChapterUrl || null;
      target.lastSwapScanDate = target.lastSwapScanDate || shoutout.lastSwapScanDate || shoutout.swappedDate;
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
    const all = await getAll("shoutouts") || [];
    let migrated = 0;
    for (const s of all) {
      if (migrateLegacyShoutout(s)) {
        await save("shoutouts", s);
        migrated++;
      }
    }
    if (migrated > 0) {
      console.log("[RR Companion BG] Legacy swap migration: updated", migrated, "shoutouts");
    }
  } catch (err) {
    console.error("[RR Companion BG] Legacy swap migration failed:", err);
  }
}
async function getScanState() {
  const result = await chrome.storage.local.get(SCAN_STATE_KEY);
  return result[SCAN_STATE_KEY] || { status: "idle" };
}
async function setScanState(state) {
  await chrome.storage.local.set({ [SCAN_STATE_KEY]: state });
}
async function getImportState() {
  const result = await chrome.storage.local.get(IMPORT_STATE_KEY);
  return result[IMPORT_STATE_KEY] || { status: "idle" };
}
async function setImportState(state) {
  await chrome.storage.local.set({ [IMPORT_STATE_KEY]: state });
}
async function getSwapCheckState() {
  const result = await chrome.storage.local.get(SWAP_CHECK_STATE_KEY);
  return result[SWAP_CHECK_STATE_KEY] || { status: "idle", checks: {} };
}
async function setSwapCheckState(state) {
  await chrome.storage.local.set({ [SWAP_CHECK_STATE_KEY]: state });
}
async function updateShoutoutCheckState(shoutoutId, checkState) {
  const state = await getSwapCheckState();
  state.checks = state.checks || {};
  state.checks[shoutoutId] = checkState;
  await setSwapCheckState(state);
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchWithRetry(url, options = {}, maxRetries = 3, baseDelay = 1e3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 || response.status >= 500 && response.status < 600) {
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
  throw lastError || new Error("Fetch failed after retries");
}
async function broadcastToTabs(message) {
  try {
    const tabs = await chrome.tabs.query({ url: "*://www.royalroad.com/*" });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
      });
    }
  } catch (err) {
  }
}
var OFFSCREEN_SUPPORTED = typeof chrome !== "undefined" && !!chrome.offscreen;
var creatingOffscreen = null;
async function ensureOffscreenDocument() {
  if (!OFFSCREEN_SUPPORTED) {
    return;
  }
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
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
    reasons: ["DOM_SCRAPING"],
    justification: "Parse HTML content from Royal Road pages"
  });
  await creatingOffscreen;
  creatingOffscreen = null;
  console.log("[RR Companion BG] Offscreen document created");
}
async function parseInContext(type, payload) {
  const callers = {
    parseChapterList: () => parseChapterList(payload.html, payload.fictionId),
    parseChapterNotes: () => parseChapterNotes(payload.html, payload.chapterUrl),
    extractShoutouts: () => extractShoutouts(payload.html, payload.excludeFictionId),
    parseFictionDetails: () => parseFictionDetails2(payload.html, payload.fictionId)
  };
  if (!OFFSCREEN_SUPPORTED) {
    const fn = callers[type];
    if (!fn)
      return { success: false, error: `Unknown parse type: ${type}` };
    try {
      return { success: true, data: fn() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({ type, ...payload });
}
async function fetchChapterList(fictionId) {
  const url = `https://www.royalroad.com/fiction/${fictionId}`;
  console.log("[RR Companion BG] Fetching fiction page:", url);
  const response = await fetchWithRetry(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Failed to fetch fiction page: ${response.status}`);
  }
  const html = await response.text();
  const result = await parseInContext("parseChapterList", { html, fictionId });
  if (!result?.success) {
    throw new Error(result?.error || "Failed to parse chapter list");
  }
  console.log(`[RR Companion BG] Found ${result.data.chapters.length} chapters`);
  return result.data;
}
async function fetchChapterNotes(chapterUrl) {
  const response = await fetchWithRetry(chapterUrl, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const html = await response.text();
  const result = await parseInContext("parseChapterNotes", { html, chapterUrl });
  if (!result?.success) {
    throw new Error(result?.error || "Failed to parse chapter notes");
  }
  return result.data;
}
async function extractShoutoutsFromHtml(html, excludeFictionId) {
  const result = await parseInContext("extractShoutouts", { html, excludeFictionId });
  if (!result?.success) {
    throw new Error(result?.error || "Failed to extract shoutouts");
  }
  return new Map(Object.entries(result.data));
}
async function fetchFictionDetails(fictionId) {
  const url = `https://www.royalroad.com/fiction/${fictionId}`;
  authorLogger.info("Fetching fiction details", { fictionId, url });
  const response = await fetchWithRetry(url, { credentials: "omit" });
  if (!response.ok) {
    authorLogger.error("Failed to fetch fiction page", { fictionId, status: response.status });
    throw new Error(`Failed to fetch fiction page: ${response.status}`);
  }
  const html = await response.text();
  authorLogger.debug("Got HTML response", { fictionId, htmlLength: html.length });
  const result = await parseInContext("parseFictionDetails", { html, fictionId });
  if (!result?.success) {
    authorLogger.error("Failed to parse fiction details", { fictionId, error: result?.error });
    throw new Error(result?.error || "Failed to parse fiction details");
  }
  const data = result.data || {};
  authorLogger.info("Fiction details parsed", {
    fictionId,
    fictionTitle: data.fictionTitle || "(empty)",
    authorName: data.authorName || "(empty)",
    hasCover: !!data.coverUrl,
    hasProfile: !!data.profileUrl,
    hasAvatar: !!data.authorAvatar
  });
  if (!data.authorName) {
    authorLogger.warn("Author name is empty after parse", { fictionId, data });
  }
  const { profileId, ...rest } = data;
  return rest;
}
async function batchDownloadChapters(chapters, batchSize = 5, delayMs = 1e3, onProgress = null) {
  const results = /* @__PURE__ */ new Map();
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
  return schedules.some(
    (s) => String(s.fictionId) === String(myFictionId) && s.chapter === chapterName
  );
}
async function runFullScan(myFictionId) {
  let shoutoutsFound = 0;
  try {
    await setScanState({
      status: "scanning",
      phase: "download",
      current: 0,
      total: 0,
      currentTitle: "Initializing...",
      shoutoutsFound: 0
    });
    await ensureDB();
    await ensureOffscreenDocument();
    console.log("[RR Companion BG] Starting scan for fiction:", myFictionId);
    const fictionData = await fetchChapterList(myFictionId);
    const { chapters, fictionTitle } = fictionData;
    console.log(`[RR Companion BG] Found ${chapters.length} chapters for ${fictionTitle}`);
    const allShoutouts = await getAll("shoutouts");
    const scannedChapterUrls = /* @__PURE__ */ new Set();
    for (const shoutout of allShoutouts) {
      const schedules = shoutout.schedules || [];
      for (const sch of schedules) {
        if (String(sch.fictionId) === String(myFictionId) && sch.chapter && sch.chapterUrl) {
          scannedChapterUrls.add(sch.chapterUrl);
        }
      }
    }
    const chaptersToDownload = chapters.filter((ch) => !scannedChapterUrls.has(ch.url));
    const skippedCount = chapters.length - chaptersToDownload.length;
    console.log(`[RR Companion BG] Skipping ${skippedCount} already-scanned, downloading ${chaptersToDownload.length}`);
    await setScanState({
      status: "scanning",
      phase: "download",
      current: 0,
      total: chaptersToDownload.length,
      currentTitle: skippedCount > 0 ? `Skipped ${skippedCount} cached, downloading...` : "Downloading chapters...",
      shoutoutsFound: 0
    });
    const downloadedChapters = await batchDownloadChapters(chaptersToDownload, 5, 1e3, async (progress) => {
      await setScanState({
        status: "scanning",
        phase: "download",
        current: progress.downloaded,
        total: chaptersToDownload.length,
        currentTitle: `Downloading ${progress.downloaded}/${chaptersToDownload.length}...`,
        shoutoutsFound: 0
      });
    });
    console.log("[RR Companion BG] Downloaded", downloadedChapters.size, "chapters");
    let localShoutouts = [...allShoutouts];
    const processedInScan = /* @__PURE__ */ new Set();
    const existingContacts = await getAll("contacts") || [];
    const contactCache = new Map(existingContacts.map((c) => [c.authorName, c]));
    let scanCancelled = false;
    for (let i = 0; i < chaptersToDownload.length; i++) {
      const liveState = await getScanState();
      if (liveState.status !== "scanning") {
        scanCancelled = true;
        break;
      }
      const chapter = chaptersToDownload[i];
      await setScanState({
        status: "scanning",
        phase: "process",
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
        const combined = downloadResult.notes.combined || "";
        const shoutoutsMap = await extractShoutoutsFromHtml(combined, myFictionId);
        for (const [rrFictionId, extractedCode] of shoutoutsMap.entries()) {
          const scanKey = `${rrFictionId}|${chapter.title}`;
          if (processedInScan.has(scanKey))
            continue;
          processedInScan.add(scanKey);
          const existingShoutout = localShoutouts.find(
            (s) => String(s.fictionId) === String(rrFictionId)
          );
          if (existingShoutout && isAlreadyArchived(existingShoutout, myFictionId, chapter.title)) {
            continue;
          }
          const details = await fetchFictionDetails(rrFictionId);
          if (details?.authorName) {
            let contact = contactCache.get(details.authorName);
            if (!contact) {
              const newContact = {
                authorName: details.authorName,
                authorAvatar: details.authorAvatar || "",
                profileUrl: details.profileUrl || ""
              };
              const contactId = await save("contacts", newContact);
              contactCache.set(details.authorName, { ...newContact, id: contactId });
              console.log("[RR Companion BG] Created contact:", details.authorName);
            } else if (!contact.authorAvatar && details.authorAvatar) {
              const updated = { ...contact, authorAvatar: details.authorAvatar };
              await save("contacts", updated);
              contactCache.set(details.authorName, updated);
              console.log("[RR Companion BG] Updated contact avatar:", details.authorName);
            }
          }
          if (existingShoutout) {
            const schedules = [...existingShoutout.schedules || []];
            const alreadyArchived = schedules.some(
              (s) => String(s.fictionId) === String(myFictionId) && s.chapter === chapter.title
            );
            if (alreadyArchived)
              continue;
            let pendingIdx = schedules.findIndex(
              (s) => String(s.fictionId) === String(myFictionId) && !s.chapter && s.date === chapter.date
            );
            if (pendingIdx >= 0) {
              schedules[pendingIdx] = { ...schedules[pendingIdx], chapter: chapter.title, chapterUrl: chapter.url };
            } else {
              schedules.push({
                fictionId: String(myFictionId),
                date: chapter.date,
                chapter: chapter.title,
                chapterUrl: chapter.url
              });
            }
            const updatedCode = !existingShoutout.code && extractedCode ? extractedCode : existingShoutout.code;
            await save("shoutouts", { ...existingShoutout, schedules, code: updatedCode });
            const idx = localShoutouts.findIndex((s) => s.id === existingShoutout.id);
            if (idx >= 0) {
              localShoutouts[idx] = { ...localShoutouts[idx], schedules, code: updatedCode };
            }
          } else {
            const newSchedule = {
              fictionId: String(myFictionId),
              date: chapter.date,
              chapter: chapter.title,
              chapterUrl: chapter.url
            };
            const newShoutout = {
              fictionId: rrFictionId,
              fictionTitle: details?.fictionTitle || "Unknown",
              fictionUrl: details?.fictionUrl || `https://www.royalroad.com/fiction/${rrFictionId}`,
              coverUrl: details?.coverUrl || "",
              authorName: details?.authorName || "",
              authorAvatar: details?.authorAvatar || "",
              profileUrl: details?.profileUrl || "",
              schedules: [newSchedule],
              code: extractedCode || ""
            };
            const newId = await save("shoutouts", newShoutout);
            localShoutouts.push({ ...newShoutout, id: newId });
          }
          shoutoutsFound++;
          broadcastToTabs({
            type: "shoutoutFound",
            chapterName: chapter.title,
            fictionTitle: details?.fictionTitle || "Unknown",
            authorName: details?.authorName || "Unknown"
          });
        }
      } catch (err) {
        console.error("[RR Companion BG] Error processing chapter:", chapter.title, err);
      }
    }
    const latestShoutouts = await getAll("shoutouts") || [];
    const unswappedShoutouts = latestShoutouts.filter(
      (s) => !s.swappedDate && s.fictionId
    );
    if (unswappedShoutouts.length > 0) {
      const myFictions = await getAll("myFictions") || [];
      const myFictionIds = myFictions.map((f) => String(f.fictionId));
      let swapsChecked = 0;
      let swapsFound = 0;
      for (const shoutout of unswappedShoutouts) {
        swapsChecked++;
        if (!shoutout.authorName && shoutout.fictionId) {
          authorLogger.info("Auto-heal triggered - missing author", {
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
              await save("shoutouts", shoutout);
              authorLogger.info("Auto-heal SUCCESS", {
                shoutoutId: shoutout.id,
                before,
                after: { authorName: shoutout.authorName, fictionTitle: shoutout.fictionTitle }
              });
            } else {
              authorLogger.warn("Auto-heal FAILED - no author in response", {
                shoutoutId: shoutout.id,
                fictionId: shoutout.fictionId,
                details
              });
            }
          } catch (err) {
            authorLogger.error("Auto-heal ERROR", {
              shoutoutId: shoutout.id,
              fictionId: shoutout.fictionId,
              error: err.message
            });
          }
        }
        await setScanState({
          status: "scanning",
          phase: "checkSwaps",
          current: swapsChecked,
          total: unswappedShoutouts.length,
          currentTitle: `Checking swap: ${shoutout.authorName || shoutout.fictionTitle || "Unknown"}`,
          shoutoutsFound
        });
        try {
          const theirFictionData = await fetchChapterList(shoutout.fictionId);
          const theirChapters = theirFictionData.chapters || [];
          const shoutoutMyFictionIds = new Set(
            (shoutout.schedules || []).map((s) => String(s.fictionId)).filter(Boolean)
          );
          const relevantFictionIds = shoutoutMyFictionIds.size > 0 ? myFictionIds.filter((id) => shoutoutMyFictionIds.has(String(id))) : myFictionIds;
          const day = today();
          const allSchedulesSwapped = () => {
            const schedules = shoutout.schedules || [];
            if (schedules.length === 0)
              return !!shoutout.swappedDate;
            return schedules.filter((s) => shoutoutMyFictionIds.has(String(s.fictionId))).every((s) => s.swappedDate);
          };
          for (const chapter of theirChapters) {
            if (allSchedulesSwapped())
              break;
            try {
              const notes = await fetchChapterNotes(chapter.url);
              const combined = notes?.combined || "";
              for (const myFictionId2 of relevantFictionIds) {
                if (fictionLinkRegex(myFictionId2).test(combined)) {
                  if (assignSwap(shoutout, myFictionId2, chapter, day)) {
                    swapsFound++;
                    console.log("[RR Companion BG] Swap found:", shoutout.authorName, "for fiction", myFictionId2, "in", chapter.title);
                  }
                }
              }
            } catch (chErr) {
              console.log("[RR Companion BG] Error checking chapter:", chapter.title);
            }
            await delay(200);
          }
          stampScanDateOnSchedules(shoutout, shoutoutMyFictionIds, day);
          if (!(shoutout.schedules || []).length)
            shoutout.lastSwapScanDate = day;
          syncShoutoutSwapSummary(shoutout);
          await save("shoutouts", shoutout);
        } catch (err) {
          console.log("[RR Companion BG] Error checking swap for:", shoutout.authorName, err.message);
        }
      }
      console.log("[RR Companion BG] Swap check complete:", { checked: swapsChecked, found: swapsFound });
    }
    if (scanCancelled) {
      console.log("[RR Companion BG] Scan cancelled by user");
      await setScanState({ status: "idle" });
      broadcastToTabs({ type: "scanCancelled" });
      return;
    }
    await setScanState({
      status: "complete",
      message: `Done! Found ${shoutoutsFound} shoutout(s).`,
      shoutoutsFound,
      fictionTitle,
      completedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    broadcastToTabs({ type: "scanComplete", shoutoutsFound });
    setTimeout(() => {
      setScanState({ status: "idle" }).catch(() => {
      });
    }, 1500);
  } catch (err) {
    console.error("[RR Companion BG] Scan error:", err);
    await setScanState({ status: "error", error: err.message });
    setTimeout(() => {
      setScanState({ status: "idle" }).catch(() => {
      });
    }, 3e3);
  }
}
async function checkAllSwaps(opts = {}) {
  const { fictionId = null } = opts;
  console.log("[RR Companion BG] === CHECK ALL SWAPS ===", fictionId ? { fictionId } : "(all)");
  try {
    await ensureDB();
    const allShoutouts = await getAll("shoutouts") || [];
    const unswappedShoutouts = allShoutouts.filter((s) => {
      if (s.swappedDate || !s.fictionId)
        return false;
      if (fictionId) {
        const onOurFiction = (s.schedules || []).some(
          (sch) => String(sch.fictionId) === String(fictionId)
        );
        if (!onOurFiction)
          return false;
      }
      return true;
    });
    if (unswappedShoutouts.length === 0) {
      console.log("[RR Companion BG] No unswapped shoutouts to check");
      return { checked: 0, found: 0 };
    }
    console.log("[RR Companion BG] Checking", unswappedShoutouts.length, "unswapped shoutouts");
    const myFictions = await getAll("myFictions") || [];
    const myFictionIds = myFictions.map((f) => String(f.fictionId));
    if (myFictionIds.length === 0) {
      console.log("[RR Companion BG] No myFictions found");
      return { checked: 0, found: 0, error: "No fictions found" };
    }
    await ensureOffscreenDocument();
    await setCheckAllSwapsState({ status: "running", current: 0, total: unswappedShoutouts.length });
    let swapsChecked = 0;
    let swapsFound = 0;
    let checkAllCancelled = false;
    for (const shoutout of unswappedShoutouts) {
      const liveState = await getCheckAllSwapsState();
      if (liveState.status !== "running") {
        checkAllCancelled = true;
        break;
      }
      swapsChecked++;
      if (!shoutout.authorName && shoutout.fictionId) {
        authorLogger.info("Auto-heal triggered (checkAllSwaps) - missing author", {
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
            await save("shoutouts", shoutout);
            authorLogger.info("Auto-heal SUCCESS (checkAllSwaps)", {
              shoutoutId: shoutout.id,
              before,
              after: { authorName: shoutout.authorName, fictionTitle: shoutout.fictionTitle }
            });
          } else {
            authorLogger.warn("Auto-heal FAILED (checkAllSwaps) - no author in response", {
              shoutoutId: shoutout.id,
              fictionId: shoutout.fictionId,
              details
            });
          }
        } catch (err) {
          authorLogger.error("Auto-heal ERROR (checkAllSwaps)", {
            shoutoutId: shoutout.id,
            fictionId: shoutout.fictionId,
            error: err.message
          });
        }
      }
      await updateShoutoutCheckState(shoutout.id, {
        status: "checking",
        current: 0,
        total: 0,
        chapter: "Fetching chapters...",
        startedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      broadcastToTabs({
        type: "checkAllSwapsProgress",
        current: swapsChecked,
        total: unswappedShoutouts.length,
        authorName: shoutout.authorName || shoutout.fictionTitle || "Unknown"
      });
      broadcastToTabs({
        type: "swapCheckProgress",
        shoutoutId: shoutout.id,
        current: 0,
        total: 0,
        chapter: "Fetching chapters..."
      });
      try {
        const chapterListUrl = `https://www.royalroad.com/fiction/${shoutout.fictionId}`;
        const chapterListResponse = await fetchWithRetry(chapterListUrl, { credentials: "omit" });
        if (!chapterListResponse.ok) {
          console.log("[RR Companion BG] Failed to fetch fiction:", shoutout.fictionId);
          await updateShoutoutCheckState(shoutout.id, { status: "complete", found: false });
          continue;
        }
        const chapterListHtml = await chapterListResponse.text();
        const parseResponse = await parseInContext("parseChapterList", {
          html: chapterListHtml,
          fictionId: shoutout.fictionId
        });
        if (!parseResponse?.success) {
          console.log("[RR Companion BG] Failed to parse chapters for:", shoutout.fictionId);
          await updateShoutoutCheckState(shoutout.id, { status: "complete", found: false });
          continue;
        }
        const theirChapters = parseResponse.data?.chapters || [];
        const shoutoutMyFictionIds = new Set(
          (shoutout.schedules || []).map((s) => String(s.fictionId)).filter(Boolean)
        );
        const relevantFictionIds = shoutoutMyFictionIds.size > 0 ? myFictionIds.filter((id) => shoutoutMyFictionIds.has(String(id))) : myFictionIds;
        const day = today();
        const allSchedulesSwapped = () => {
          const schedules = shoutout.schedules || [];
          if (schedules.length === 0)
            return !!shoutout.swappedDate;
          return schedules.filter((s) => shoutoutMyFictionIds.has(String(s.fictionId))).every((s) => s.swappedDate);
        };
        for (let i = 0; i < theirChapters.length; i++) {
          if (allSchedulesSwapped())
            break;
          const chapter = theirChapters[i];
          await updateShoutoutCheckState(shoutout.id, {
            status: "checking",
            current: i + 1,
            total: theirChapters.length,
            chapter: chapter.title
          });
          broadcastToTabs({
            type: "swapCheckProgress",
            shoutoutId: shoutout.id,
            current: i + 1,
            total: theirChapters.length,
            chapter: chapter.title
          });
          try {
            const chapterResponse = await fetchWithRetry(chapter.url, { credentials: "omit" });
            if (!chapterResponse.ok)
              continue;
            const chapterHtml = await chapterResponse.text();
            const parseNotesResponse = await parseInContext("parseChapterNotes", {
              html: chapterHtml,
              chapterUrl: chapter.url
            });
            if (!parseNotesResponse?.success)
              continue;
            const authorNotes = parseNotesResponse.data?.combined || "";
            for (const myFictionId of relevantFictionIds) {
              if (fictionLinkRegex(myFictionId).test(authorNotes)) {
                if (assignSwap(shoutout, myFictionId, chapter, day)) {
                  swapsFound++;
                  console.log("[RR Companion BG] Swap found:", shoutout.authorName, "for fiction", myFictionId, "in", chapter.title);
                }
              }
            }
          } catch (chErr) {
            console.log("[RR Companion BG] Error checking chapter:", chapter.title);
          }
          await delay(200);
        }
        stampScanDateOnSchedules(shoutout, shoutoutMyFictionIds, day);
        if (!(shoutout.schedules || []).length)
          shoutout.lastSwapScanDate = day;
        syncShoutoutSwapSummary(shoutout);
        await save("shoutouts", shoutout);
        const foundSwap = (shoutout.schedules || []).some((s) => s.swappedDate) || !!shoutout.swappedDate;
        await updateShoutoutCheckState(shoutout.id, {
          status: "complete",
          found: foundSwap,
          completedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (err) {
        console.log("[RR Companion BG] Error checking swap for:", shoutout.authorName, err.message);
        await updateShoutoutCheckState(shoutout.id, {
          status: "error",
          error: err.message,
          completedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
    await setCheckAllSwapsState({ status: "idle" });
    if (checkAllCancelled) {
      console.log("[RR Companion BG] Check all swaps cancelled by user");
      broadcastToTabs({ type: "checkAllSwapsCancelled", checked: swapsChecked });
      return { checked: swapsChecked, found: swapsFound, cancelled: true };
    }
    console.log("[RR Companion BG] Check all swaps complete:", { checked: swapsChecked, found: swapsFound });
    broadcastToTabs({
      type: "swapCheckComplete",
      checked: swapsChecked,
      found: swapsFound
    });
    return { checked: swapsChecked, found: swapsFound };
  } catch (err) {
    console.error("[RR Companion BG] Check all swaps error:", err);
    await setCheckAllSwapsState({ status: "idle" });
    return { checked: 0, found: 0, error: err.message };
  }
}
async function checkSwapReturn(shoutoutId, theirFictionId, myFictionIds) {
  console.log("[RR Companion BG] === CHECKING SWAP RETURN ===");
  console.log("[RR Companion BG] shoutoutId:", shoutoutId);
  console.log("[RR Companion BG] theirFictionId:", theirFictionId);
  console.log("[RR Companion BG] myFictionIds:", myFictionIds);
  if (!theirFictionId) {
    console.error("[RR Companion BG] ERROR: theirFictionId is missing!");
    return { found: false, error: "Fiction ID is missing" };
  }
  if (!myFictionIds || myFictionIds.length === 0) {
    console.error("[RR Companion BG] ERROR: myFictionIds is empty!");
    return { found: false, error: "No fiction IDs to search for" };
  }
  await updateShoutoutCheckState(shoutoutId, {
    status: "checking",
    current: 0,
    total: 0,
    chapter: "Initializing...",
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  try {
    await ensureDB();
    console.log("[RR Companion BG] DB ready");
    await ensureOffscreenDocument();
    console.log("[RR Companion BG] Offscreen document ready");
    const shoutout = await getById("shoutouts", shoutoutId);
    const expectedReturnDate = shoutout?.expectedReturnDate;
    console.log("[RR Companion BG] Expected return date:", expectedReturnDate);
    const chapterListUrl = `https://www.royalroad.com/fiction/${theirFictionId}`;
    console.log("[RR Companion BG] Fetching fiction page:", chapterListUrl);
    const chapterListResponse = await fetchWithRetry(chapterListUrl, { credentials: "omit" });
    if (!chapterListResponse.ok) {
      console.error("[RR Companion BG] Failed to fetch fiction page:", chapterListResponse.status);
      throw new Error(`Failed to fetch fiction page: ${chapterListResponse.status}`);
    }
    const chapterListHtml = await chapterListResponse.text();
    console.log("[RR Companion BG] Got HTML, length:", chapterListHtml.length);
    console.log("[RR Companion BG] Parsing chapter list...");
    const parseChaptersResponse = await parseInContext("parseChapterList", {
      html: chapterListHtml,
      fictionId: theirFictionId
    });
    console.log("[RR Companion BG] Parse response:", parseChaptersResponse);
    if (!parseChaptersResponse?.success) {
      throw new Error(parseChaptersResponse?.error || "Failed to parse chapter list");
    }
    const allChapters = parseChaptersResponse.data?.chapters || [];
    console.log("[RR Companion BG] Found", allChapters.length, "total chapters");
    if (allChapters.length > 0) {
      console.log("[RR Companion BG] First chapter:", allChapters[0]);
    }
    if (allChapters.length === 0) {
      return { found: false, reason: "No chapters found" };
    }
    const shoutoutMyFictionIds = new Set(
      (shoutout?.schedules || []).map((s) => String(s.fictionId)).filter(Boolean)
    );
    const relevantFictionIds = shoutoutMyFictionIds.size > 0 ? myFictionIds.filter((id) => shoutoutMyFictionIds.has(String(id))) : myFictionIds;
    const day = today();
    let firstHit = null;
    const allSchedulesSwapped = () => {
      const schedules = shoutout?.schedules || [];
      if (schedules.length === 0)
        return !!shoutout?.swappedDate;
      return schedules.filter((s) => shoutoutMyFictionIds.has(String(s.fictionId))).every((s) => s.swappedDate);
    };
    const scanChapters = async (chapters, offset = 0) => {
      console.log("[RR Companion BG] Scanning", chapters.length, "chapters starting at offset", offset);
      for (let i = 0; i < chapters.length; i++) {
        if (allSchedulesSwapped())
          return;
        const chapter = chapters[i];
        console.log(`[RR Companion BG] Scanning chapter ${offset + i + 1}/${allChapters.length}: ${chapter.title}`);
        await updateShoutoutCheckState(shoutoutId, {
          status: "checking",
          current: offset + i + 1,
          total: allChapters.length,
          chapter: chapter.title
        });
        broadcastToTabs({
          type: "swapCheckProgress",
          shoutoutId,
          current: offset + i + 1,
          total: allChapters.length,
          chapter: chapter.title
        });
        const chapterResponse = await fetchWithRetry(chapter.url, { credentials: "omit" });
        if (!chapterResponse.ok) {
          console.log("[RR Companion BG] Failed to fetch chapter:", chapter.url, chapterResponse.status);
          continue;
        }
        const chapterHtml = await chapterResponse.text();
        const parseNotesResponse = await parseInContext("parseChapterNotes", {
          html: chapterHtml,
          chapterUrl: chapter.url
        });
        if (!parseNotesResponse?.success) {
          console.log("[RR Companion BG] Failed to parse notes for:", chapter.url);
          continue;
        }
        const authorNotes = parseNotesResponse.data?.combined || "";
        for (const myFictionId of relevantFictionIds) {
          if (fictionLinkRegex(myFictionId).test(authorNotes)) {
            if (assignSwap(shoutout, myFictionId, chapter, day)) {
              if (!firstHit)
                firstHit = chapter;
              console.log("[RR Companion BG] FOUND our shoutout in:", chapter.title, "for fiction:", myFictionId);
            }
          }
        }
      }
    };
    if (expectedReturnDate) {
      const startDate = new Date(expectedReturnDate);
      startDate.setDate(startDate.getDate() - 3);
      const startDateStr = startDate.toISOString().split("T")[0];
      console.log("[RR Companion BG] Smart scan starting from:", startDateStr);
      const priorityChapters = allChapters.filter((ch) => ch.date && ch.date >= startDateStr);
      const olderChapters = allChapters.filter((ch) => !ch.date || ch.date < startDateStr);
      console.log("[RR Companion BG] Priority chapters:", priorityChapters.length, "Older:", olderChapters.length);
      await scanChapters(priorityChapters, 0);
      if (!allSchedulesSwapped() && olderChapters.length > 0) {
        console.log("[RR Companion BG] Not all done in priority, scanning older chapters...");
        await scanChapters(olderChapters, priorityChapters.length);
      }
    } else {
      console.log("[RR Companion BG] No expected date, scanning all chapters");
      await scanChapters(allChapters, 0);
    }
    stampScanDateOnSchedules(shoutout, shoutoutMyFictionIds, day);
    if (!(shoutout.schedules || []).length)
      shoutout.lastSwapScanDate = day;
    syncShoutoutSwapSummary(shoutout);
    await save("shoutouts", shoutout);
    const foundAny = (shoutout.schedules || []).some((s) => s.swappedDate) || !!shoutout.swappedDate;
    broadcastToTabs({
      type: "swapCheckComplete",
      shoutoutId,
      found: foundAny,
      chapter: firstHit?.title || null
    });
    if (foundAny) {
      await updateShoutoutCheckState(shoutoutId, {
        status: "complete",
        found: true,
        chapter: firstHit?.title || shoutout.swappedChapter || null,
        chapterUrl: firstHit?.url || shoutout.swappedChapterUrl || null,
        completedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return {
        found: true,
        chapter: firstHit?.title || shoutout.swappedChapter || null,
        chapterUrl: firstHit?.url || shoutout.swappedChapterUrl || null,
        date: firstHit?.date || null
      };
    }
    await updateShoutoutCheckState(shoutoutId, {
      status: "complete",
      found: false,
      completedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { found: false, reason: "Not found in any chapters" };
  } catch (err) {
    console.error("[RR Companion BG] Check swap error:", err);
    await updateShoutoutCheckState(shoutoutId, {
      status: "error",
      error: err.message,
      completedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { found: false, error: err.message };
  }
}
async function autoArchiveToday() {
  console.log("[RR Companion BG] Auto-archiving today's chapters...");
  try {
    await ensureDB();
    const today2 = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA");
    console.log("[RR Companion BG] Today is:", today2);
    const myFictions = await getAll("myFictions") || [];
    if (myFictions.length === 0) {
      console.log("[RR Companion BG] No fictions found, skipping auto-archive");
      return { archived: 0, checked: 0 };
    }
    const shoutouts = await getAll("shoutouts") || [];
    if (shoutouts.length === 0) {
      console.log("[RR Companion BG] No shoutouts found, skipping auto-archive");
      return { archived: 0, checked: 0 };
    }
    let totalArchived = 0;
    let totalChecked = 0;
    for (const fiction of myFictions) {
      try {
        console.log("[RR Companion BG] Checking fiction:", fiction.title, fiction.fictionId);
        const todayShoutouts = shoutouts.filter(
          (s) => s.schedules?.some(
            (sch) => sch.date === today2 && String(sch.fictionId) === String(fiction.fictionId) && !sch.chapter
            // Not already archived
          )
        );
        if (todayShoutouts.length === 0) {
          console.log("[RR Companion BG] No unarchived shoutouts for today on", fiction.title);
          continue;
        }
        console.log("[RR Companion BG] Found", todayShoutouts.length, "shoutouts scheduled for today");
        const fictionData = await fetchChapterList(fiction.fictionId);
        const chapters = fictionData.chapters || [];
        const todayChapters = chapters.filter((ch) => ch.date === today2);
        console.log("[RR Companion BG] Found", todayChapters.length, "chapters published today");
        if (todayChapters.length === 0) {
          continue;
        }
        const latestChapter = todayChapters[0];
        console.log("[RR Companion BG] Latest chapter today:", latestChapter.title);
        for (const shoutout of todayShoutouts) {
          totalChecked++;
          const scheduleIdx = shoutout.schedules.findIndex(
            (sch) => sch.date === today2 && String(sch.fictionId) === String(fiction.fictionId) && !sch.chapter
          );
          if (scheduleIdx === -1)
            continue;
          const updatedSchedules = [...shoutout.schedules];
          updatedSchedules[scheduleIdx] = {
            ...updatedSchedules[scheduleIdx],
            chapter: latestChapter.title,
            chapterUrl: latestChapter.url
          };
          const updatedShoutout = { ...shoutout, schedules: updatedSchedules };
          await save("shoutouts", updatedShoutout);
          console.log("[RR Companion BG] Auto-archived shoutout:", shoutout.authorName || shoutout.fictionTitle, "in", latestChapter.title);
          totalArchived++;
        }
      } catch (err) {
        console.error("[RR Companion BG] Error checking fiction:", fiction.title, err);
      }
    }
    console.log("[RR Companion BG] Auto-archive complete:", totalArchived, "archived,", totalChecked, "checked");
    return { archived: totalArchived, checked: totalChecked };
  } catch (err) {
    console.error("[RR Companion BG] Auto-archive error:", err);
    return { archived: 0, checked: 0, error: err.message };
  }
}
async function runImport(workbookData) {
  console.log("[RR Companion BG] Starting import...");
  try {
    await ensureDB();
    await ensureOffscreenDocument();
    const myFictions = await getAll("myFictions") || [];
    const existingShoutouts = await getAll("shoutouts") || [];
    const existingContacts = await getAll("contacts") || [];
    const contactCache = new Map(existingContacts.map((c) => [c.authorName, c]));
    const shoutoutsByRrFictionId = /* @__PURE__ */ new Map();
    for (const s of existingShoutouts) {
      if (s.fictionId) {
        shoutoutsByRrFictionId.set(String(s.fictionId), s);
      } else {
        const match = (s.code || "").match(/\/fiction\/(\d+)/);
        if (match) {
          shoutoutsByRrFictionId.set(String(match[1]), s);
        }
      }
    }
    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    const errors = [];
    let totalRows = 0;
    let processedRows = 0;
    for (const sheet of workbookData.sheets) {
      totalRows += sheet.rows.length;
    }
    broadcastToTabs({
      type: "importStarted",
      total: totalRows
    });
    let cancelled = false;
    for (const sheet of workbookData.sheets) {
      if (cancelled)
        break;
      const isUnscheduled = sheet.name.toLowerCase() === "unscheduled";
      let myFiction = null;
      if (!isUnscheduled) {
        myFiction = myFictions.find((f) => {
          const sanitizedTitle = (f.title || "").substring(0, 31).replace(/[\\/*?:\[\]]/g, "");
          return sanitizedTitle === sheet.name || f.title === sheet.name;
        });
        if (!myFiction) {
          console.log(`[RR Companion BG] Sheet "${sheet.name}" doesn't match any fiction - importing as unscheduled`);
        }
      }
      for (const row of sheet.rows) {
        const liveState = await getImportState();
        if (liveState.status !== "importing") {
          cancelled = true;
          break;
        }
        processedRows++;
        if (processedRows % 5 === 0) {
          await setImportState({
            status: "importing",
            current: processedRows,
            total: totalRows,
            imported,
            duplicates,
            skipped
          });
          broadcastToTabs({
            type: "importProgress",
            current: processedRows,
            total: totalRows,
            imported,
            duplicates,
            skipped
          });
        }
        try {
          const code = row["Code"] || "";
          const date = normalizeDate(row["Date"]);
          if (!code.trim()) {
            skipped++;
            continue;
          }
          const match = code.match(/\/fiction\/(\d+)/);
          if (!match) {
            skipped++;
            continue;
          }
          const rrFictionId = match[1];
          let parsedInfo = { fictionId: rrFictionId };
          try {
            const details = await fetchFictionDetails(rrFictionId);
            if (details) {
              parsedInfo = { ...parsedInfo, ...details };
            }
          } catch (fetchErr) {
            console.log("[RR Companion BG] Could not fetch details for", rrFictionId);
          }
          if (parsedInfo.authorName) {
            let contact = contactCache.get(parsedInfo.authorName);
            if (!contact) {
              const newContact = {
                authorName: parsedInfo.authorName,
                authorAvatar: parsedInfo.authorAvatar || "",
                profileUrl: parsedInfo.profileUrl || ""
              };
              const contactId = await save("contacts", newContact);
              contactCache.set(parsedInfo.authorName, { ...newContact, id: contactId });
            } else if (!contact.authorAvatar && parsedInfo.authorAvatar) {
              const updated = { ...contact, authorAvatar: parsedInfo.authorAvatar };
              await save("contacts", updated);
              contactCache.set(parsedInfo.authorName, updated);
            }
          }
          let newSchedule = null;
          if (myFiction && date) {
            newSchedule = {
              fictionId: String(myFiction.fictionId),
              date,
              chapter: row["Chapter"] || null,
              chapterUrl: row["Chapter URL"] || null
            };
          }
          const existingShoutout = shoutoutsByRrFictionId.get(String(rrFictionId));
          if (existingShoutout) {
            const scheduleExists = newSchedule && (existingShoutout.schedules || []).some(
              (s) => String(s.fictionId) === String(newSchedule.fictionId) && s.date === newSchedule.date
            );
            if (scheduleExists) {
              duplicates++;
              continue;
            }
            if (newSchedule) {
              const updatedSchedules = [...existingShoutout.schedules || [], newSchedule];
              const updatedShoutout = {
                ...existingShoutout,
                schedules: updatedSchedules,
                // Only update swap status if existing is empty but import has it
                swappedDate: existingShoutout.swappedDate || row["Swapped Date"] || "",
                swappedChapter: existingShoutout.swappedChapter || row["Swapped Chapter"] || "",
                swappedChapterUrl: existingShoutout.swappedChapterUrl || row["Swapped Chapter URL"] || "",
                lastSwapScanDate: existingShoutout.lastSwapScanDate || row["Last Scan Date"] || ""
              };
              await save("shoutouts", updatedShoutout);
              existingShoutout.schedules = updatedSchedules;
              imported++;
              broadcastToTabs({
                type: "shoutoutImported",
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
          const newShoutout = {
            code,
            schedules: newSchedule ? [newSchedule] : [],
            fictionId: rrFictionId,
            fictionTitle: parsedInfo.fictionTitle || row["Fiction"] || "",
            fictionUrl: parsedInfo.fictionUrl || row["Fiction URL"] || "",
            coverUrl: parsedInfo.coverUrl || "",
            authorName: parsedInfo.authorName || row["Author"] || "",
            authorAvatar: parsedInfo.authorAvatar || "",
            profileUrl: parsedInfo.profileUrl || "",
            expectedReturnDate: row["Expected Return"] || "",
            // Import swap status if available
            swappedDate: row["Swapped Date"] || "",
            swappedChapter: row["Swapped Chapter"] || "",
            swappedChapterUrl: row["Swapped Chapter URL"] || "",
            lastSwapScanDate: row["Last Scan Date"] || ""
          };
          const newId = await save("shoutouts", newShoutout);
          newShoutout.id = newId;
          shoutoutsByRrFictionId.set(String(rrFictionId), newShoutout);
          imported++;
          broadcastToTabs({
            type: "shoutoutImported",
            shoutout: { ...newShoutout, id: newId },
            imported,
            duplicates,
            skipped,
            current: processedRows,
            total: totalRows
          });
        } catch (rowErr) {
          console.error("[RR Companion BG] Row error:", rowErr);
          errors.push(`Row error: ${rowErr.message}`);
        }
        await delay(50);
      }
    }
    if (cancelled) {
      console.log("[RR Companion BG] Import cancelled by user");
      await setImportState({ status: "idle" });
      broadcastToTabs({ type: "importCancelled" });
      return;
    }
    await setImportState({
      status: "complete",
      imported,
      skipped,
      duplicates,
      errors,
      completedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    console.log("[RR Companion BG] Import complete:", { imported, skipped, duplicates });
    broadcastToTabs({
      type: "importComplete",
      imported,
      skipped,
      duplicates,
      errors
    });
  } catch (err) {
    console.error("[RR Companion BG] Import error:", err);
    await setImportState({ status: "error", error: err.message });
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.url?.includes("offscreen.html")) {
    return false;
  }
  console.log("[RR Companion BG] Received message:", message.type);
  if (message.type === "startFullScan") {
    getScanState().then(async (state) => {
      if (state.status === "scanning") {
        sendResponse({ started: false, reason: "Already scanning" });
      } else {
        await setScanState({ status: "scanning", phase: "init", current: 0, total: 0 });
        broadcastToTabs({ type: "scanStarted", fictionId: message.fictionId });
        runFullScan(message.fictionId);
        sendResponse({ started: true });
      }
    }).catch((err) => {
      sendResponse({ started: false, reason: err.message });
    });
    return true;
  }
  if (message.type === "getScanState") {
    getScanState().then((state) => sendResponse(state));
    return true;
  }
  if (message.type === "cancelScan") {
    setScanState({ status: "idle" }).then(() => sendResponse({ cancelled: true }));
    return true;
  }
  if (message.type === "startImport") {
    getImportState().then(async (state) => {
      if (state.status === "importing") {
        sendResponse({ started: false, reason: "Already importing" });
      } else {
        await setImportState({ status: "importing", current: 0, total: 0 });
        runImport(message.workbookData);
        sendResponse({ started: true });
      }
    }).catch((err) => {
      sendResponse({ started: false, reason: err.message });
    });
    return true;
  }
  if (message.type === "getImportState") {
    getImportState().then((state) => sendResponse(state));
    return true;
  }
  if (message.type === "cancelImport") {
    setImportState({ status: "idle" }).then(() => sendResponse({ cancelled: true }));
    return true;
  }
  if (message.type === "getSwapCheckState") {
    getSwapCheckState().then((state) => sendResponse(state));
    return true;
  }
  if (message.type === "getShoutoutCheckState") {
    getSwapCheckState().then((state) => {
      const checkState = state.checks?.[message.shoutoutId] || { status: "idle" };
      sendResponse(checkState);
    });
    return true;
  }
  if (message.type === "clearSwapCheckState") {
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
  if (message.type === "autoArchiveToday") {
    autoArchiveToday().then((result) => sendResponse(result));
    return true;
  }
  if (message.type === "checkSwapReturn") {
    console.log("[RR Companion BG] Received checkSwapReturn message:", message);
    checkSwapReturn(message.shoutoutId, message.theirFictionId, message.myFictionIds).then((result) => {
      console.log("[RR Companion BG] checkSwapReturn result:", result);
      sendResponse(result);
    }).catch((err) => {
      console.error("[RR Companion BG] checkSwapReturn error:", err);
      sendResponse({ found: false, error: err.message });
    });
    return true;
  }
  if (message.type === "checkAllSwaps") {
    console.log("[RR Companion BG] Received checkAllSwaps message", message.fictionId ? { fictionId: message.fictionId } : "");
    checkAllSwaps({ fictionId: message.fictionId || null }).then((result) => {
      console.log("[RR Companion BG] checkAllSwaps result:", result);
      sendResponse(result);
    }).catch((err) => {
      console.error("[RR Companion BG] checkAllSwaps error:", err);
      sendResponse({ checked: 0, found: 0, error: err.message });
    });
    return true;
  }
  if (message.type === "cancelCheckAllSwaps") {
    setCheckAllSwapsState({ status: "idle" }).then(() => sendResponse({ cancelled: true }));
    return true;
  }
  if (message.type === "getCheckAllSwapsState") {
    getCheckAllSwapsState().then((state) => sendResponse(state));
    return true;
  }
  if (message.type === "db:getAll") {
    (async () => {
      try {
        await ensureDB();
        const data = await getAll(message.storeName);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  if (message.type === "db:getById") {
    (async () => {
      try {
        await ensureDB();
        const data = await getById(message.storeName, message.id);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  if (message.type === "db:getByIndex") {
    (async () => {
      try {
        await ensureDB();
        const data = await getByIndex(message.storeName, message.indexName, message.value);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  if (message.type === "db:save") {
    (async () => {
      try {
        await ensureDB();
        const id = await save(message.storeName, message.data);
        sendResponse({ success: true, id });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  if (message.type === "db:deleteById") {
    (async () => {
      try {
        await ensureDB();
        await deleteById(message.storeName, message.id);
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  if (message.type === "db:upsert") {
    (async () => {
      try {
        await ensureDB();
        const result = await upsert(message.storeName, message.data);
        sendResponse({ success: true, data: result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  if (message.type === "db:clearAll") {
    (async () => {
      try {
        await ensureDB();
        const stores = ["contacts", "fictions", "shoutouts", "myFictions", "myCodes"];
        for (const storeName of stores) {
          const items = await getAll(storeName);
          for (const item of items) {
            await deleteById(storeName, item.id);
          }
        }
        await chrome.storage.local.remove([SCAN_STATE_KEY, IMPORT_STATE_KEY, SWAP_CHECK_STATE_KEY]);
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  if (message.type === "importGuildShoutouts") {
    (async () => {
      try {
        await ensureDB();
        const entries = message.entries || [];
        let imported = 0;
        const existingShoutouts = await getAll("shoutouts");
        for (const entry of entries) {
          try {
            const fictionIdMatch = entry.code.match(/\/fiction\/(\d+)/);
            if (!fictionIdMatch)
              continue;
            const fictionId = fictionIdMatch[1];
            const isDuplicate = existingShoutouts.some(
              (s) => s.fictionId === fictionId && s.schedules?.some((sch) => sch.date === entry.date)
            );
            if (isDuplicate)
              continue;
            const details = await fetchFictionDetails(fictionId);
            const shoutout = {
              code: entry.code,
              fictionId,
              fictionTitle: details?.fictionTitle || "",
              fictionUrl: `https://www.royalroad.com/fiction/${fictionId}`,
              coverUrl: details?.coverUrl || "",
              authorName: details?.authorName || "",
              authorAvatar: details?.authorAvatar || "",
              profileUrl: details?.profileUrl || "",
              schedules: [{
                fictionId: null,
                // User will assign later
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
            await save("shoutouts", shoutout);
            imported++;
          } catch (err) {
            console.error("[RR Companion BG] Error importing guild entry:", err);
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
chrome.runtime.onInstalled.addListener(() => {
  console.log("[RR Companion] Service worker installed");
  setScanState({ status: "idle" });
});
//# sourceMappingURL=background.js.map
