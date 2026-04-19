// Date utilities

/**
 * Get today's date as YYYY-MM-DD
 */
export function today() {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * Get current ISO timestamp
 */
export function timestamp() {
  return new Date().toISOString();
}

/**
 * Format date for display
 * @param {string|Date} date - Date string (YYYY-MM-DD) or Date object
 * @param {string} style - 'short' | 'long' | 'full'
 */
export function formatDate(date, style = 'short') {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;

  const options = {
    short: { month: 'short', day: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
  };

  return d.toLocaleDateString('en-US', options[style] || options.short);
}

/**
 * Parse date string to Date object
 * @param {string} dateStr - YYYY-MM-DD format
 */
export function parseDate(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

/**
 * Get next day from date string
 * @param {string} dateStr - YYYY-MM-DD format
 */
export function nextDay(dateStr) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA');
}

/**
 * Get days in month
 */
export function getDaysInMonth(month, year) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get first day of month (0 = Sunday)
 */
export function getFirstDayOfMonth(month, year) {
  return new Date(year, month, 1).getDay();
}

/**
 * Check if date is today
 */
export function isToday(dateStr) {
  return dateStr === today();
}

/**
 * Check if date is in the past
 */
export function isPast(dateStr) {
  return dateStr < today();
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
