// Route detection for Royal Road pages
import { log } from '../common/logging/core.js';

const logger = log.scope('router');

/**
 * Route patterns and their handlers
 */
const routes = [
  {
    pattern: /\/author-dashboard\/dashboard\/(\d+)/,
    name: 'fiction-dashboard',
    extract: (match) => ({ fictionId: match[1] })
  },
  {
    pattern: /\/author-dashboard\/?$/,
    name: 'main-dashboard',
    extract: () => ({ isDashboardMode: true })
  },
  {
    pattern: /\/chapters\/(new|edit|editdraft)\/(\d+)/,
    name: 'chapter-editor',
    extract: (match) => ({ mode: match[1], chapterId: match[2] })
  },
  {
    pattern: /\/chapters\/drafts\/(\d+)/,
    name: 'drafts',
    extract: (match) => ({ fictionId: match[1] })
  },
  {
    pattern: /\/author-dashboard\/analytics\/followers/,
    name: 'followers-analytics',
    extract: () => ({})
  }
];

/**
 * Detect current route
 */
export function detectRoute() {
  const path = window.location.pathname;

  for (const route of routes) {
    const match = path.match(route.pattern);
    if (match) {
      const data = route.extract(match);
      logger.info(`Route detected: ${route.name}`, data);
      return { name: route.name, ...data };
    }
  }

  logger.debug('No matching route', { path });
  return null;
}

/**
 * Check if we're on a scheduler-enabled page
 * Scheduler only shows on main dashboard and fiction-specific dashboard
 */
export function isSchedulerPage() {
  const route = detectRoute();
  return route && ['fiction-dashboard', 'main-dashboard'].includes(route.name);
}

/**
 * Check if we're on the chapter editor
 */
export function isChapterEditor() {
  const route = detectRoute();
  return route?.name === 'chapter-editor';
}

export default { detectRoute, isSchedulerPage, isChapterEditor };
