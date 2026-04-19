// HTML utilities

/**
 * Escape HTML special characters
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parse HTML string to DOM
 */
export function parseHtml(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

/**
 * Extract fiction ID from Royal Road URL
 */
export function extractFictionId(url) {
  if (!url) return null;
  const match = url.match(/\/fiction\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract fiction links from HTML
 */
export function extractFictionLinks(html) {
  if (!html) return [];
  const doc = parseHtml(html);
  const links = doc.querySelectorAll('a[href*="/fiction/"]');

  return Array.from(links).map(link => ({
    fictionId: extractFictionId(link.getAttribute('href') || ''),
    url: link.getAttribute('href') || '',
    text: link.textContent?.trim() || ''
  })).filter(item => item.fictionId);
}

/**
 * Create element from HTML string
 */
export function createElement(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}
