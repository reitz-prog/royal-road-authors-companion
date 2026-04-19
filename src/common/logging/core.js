// Logging core - stores to chrome.storage for popup viewer
// Format: [RR] [HH:MM:SS.mmm] [LEVEL] [MODULE] Message

const MAX_LOGS = 10000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const isDev = typeof chrome !== 'undefined' && chrome.runtime?.getManifest
  ? !('update_url' in chrome.runtime.getManifest())
  : true;

// In-memory buffer
let logs = [];
let flushTimeout = null;

function formatTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function createEntry(level, module, msg, data) {
  return {
    t: Date.now(),
    time: formatTime(),
    level,
    module,
    msg,
    data: data !== undefined ? safeStringify(data) : undefined
  };
}

function safeStringify(data) {
  try {
    return JSON.stringify(data, (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (val instanceof Error) return { message: val.message, stack: val.stack };
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
  const args = data !== undefined ? [formatted, data] : [formatted];

  switch (level) {
    case 'ERROR': console.error(...args); break;
    case 'WARN': console.warn(...args); break;
    default: console.log(...args);
  }
}

function scheduleFlush() {
  if (flushTimeout) return;
  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushToStorage();
  }, 1000);
}

async function flushToStorage() {
  if (logs.length === 0) return;

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get('rrLogs');
      let stored = result.rrLogs || [];

      // Add new logs
      stored.push(...logs);
      logs = [];

      // Prune old (>7 days) and excess (>10k)
      const cutoff = Date.now() - SEVEN_DAYS;
      stored = stored.filter(e => e.t > cutoff).slice(-MAX_LOGS);

      await chrome.storage.local.set({ rrLogs: stored });
    }
  } catch (e) {
    console.error('[RR] Log flush failed:', e);
  }
}

function logAt(level, module, msg, data) {
  const entry = createEntry(level, module, msg, data);

  // Console output
  toConsole(level, module, msg, data);

  // Store (skip debug in production)
  if (level !== 'DEBUG' || isDev) {
    logs.push(entry);
    scheduleFlush();
  }
}

export const log = {
  error: (module, msg, data) => logAt('ERROR', module, msg, data),
  warn: (module, msg, data) => logAt('WARN', module, msg, data),
  info: (module, msg, data) => logAt('INFO', module, msg, data),
  debug: (module, msg, data) => { if (isDev) logAt('DEBUG', module, msg, data); },

  scope(module) {
    return {
      error: (msg, data) => log.error(module, msg, data),
      warn: (msg, data) => log.warn(module, msg, data),
      info: (msg, data) => log.info(module, msg, data),
      debug: (msg, data) => log.debug(module, msg, data)
    };
  },

  flush: flushToStorage,
  isDev
};

export default log;
