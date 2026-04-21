// Scanner Proxy - Content script interface to background scanner

import { log } from '../../common/logging/core.js';

const logger = log.scope('scanner');

// Start a full scan via background service worker
export function startFullScan(fictionId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'startFullScan', fictionId }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Get current scan state from background
export function getScanState() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'getScanState' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Cancel current scan
export function cancelScan() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'cancelScan' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Check if the other author has posted our shoutout in their chapters
export function checkSwapReturn(shoutoutId, theirFictionId, myFictionIds) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'checkSwapReturn',
      shoutoutId,
      theirFictionId,
      myFictionIds
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Get all swap check states
export function getSwapCheckState() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'getSwapCheckState' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Get check state for a specific shoutout
export function getShoutoutCheckState(shoutoutId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'getShoutoutCheckState', shoutoutId }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Clear swap check state
export function clearSwapCheckState(shoutoutId = null) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'clearSwapCheckState', shoutoutId }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Auto-archive today's chapters - checks if any chapters published today match scheduled shoutouts
export function autoArchiveToday() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'autoArchiveToday' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Check all swaps - scan all unswapped shoutouts to see if they returned.
// Pass a `fictionId` to scope the check to a single fiction's shoutouts.
export function checkAllSwaps(opts = {}) {
  const message = { type: 'checkAllSwaps' };
  if (opts.fictionId) message.fictionId = String(opts.fictionId);
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

export function cancelCheckAllSwaps() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'cancelCheckAllSwaps' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Listen for scan progress updates from background
export function onScanProgress(callback) {
  const listener = (message) => {
    if (message.type === 'shoutoutFound') {
      callback({
        type: 'found',
        chapterName: message.chapterName,
        fictionTitle: message.fictionTitle,
        authorName: message.authorName
      });
    } else if (message.type === 'scanComplete') {
      callback({
        type: 'complete',
        shoutoutsFound: message.shoutoutsFound
      });
    }
  };

  chrome.runtime.onMessage.addListener(listener);

  // Return cleanup function
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}

export default { startFullScan, getScanState, cancelScan, onScanProgress, checkSwapReturn, getSwapCheckState, getShoutoutCheckState, clearSwapCheckState, autoArchiveToday, checkAllSwaps };
