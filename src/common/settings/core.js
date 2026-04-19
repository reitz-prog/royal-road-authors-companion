// Global settings storage
import { log } from '../logging/core.js';

const logger = log.scope('settings');
const SETTINGS_KEY = 'rr-companion-settings';

const DEFAULT_SETTINGS = {
  // Behavior settings
  placement: 'post',           // 'pre' or 'post' chapter
  notifyAuthor: false,         // future feature

  // Global preferences
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,  // User's local timezone by default

  // UI state
  schedulerCollapsed: false,
  contactsOpen: true,
  unscheduledClosed: false
};

/**
 * Get all settings
 */
export function getSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    logger.error('Error reading settings', e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Get a single setting
 */
export function getSetting(key) {
  return getSettings()[key];
}

/**
 * Set a single setting
 */
export function setSetting(key, value) {
  saveSettings({ [key]: value });
}

/**
 * Save settings
 */
export function saveSettings(settings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    logger.info('Settings saved', settings);
  } catch (e) {
    logger.error('Error saving settings', e);
  }
}

/**
 * Reset to defaults
 */
export function resetSettings() {
  localStorage.removeItem(SETTINGS_KEY);
  logger.info('Settings reset to defaults');
}

export default { getSettings, getSetting, setSetting, saveSettings, resetSettings };
