import { h, render } from 'preact';
import { setup } from 'goober';
import { log } from '../common/logging/core.js';
import { Layout } from '../shout_out_swapper/ui/layout/Layout.jsx';
import { TodayBanner } from '../shout_out_swapper/ui/banner/TodayBanner.jsx';
import { Followers } from '../analytics/followers/Followers.jsx';

// Common UI styles
import overlayStyles from '../common/ui/overlay/Overlay.css';
import modalStyles from '../common/ui/modal/Modal.css';
import dialogStyles from '../common/ui/dialog/Dialog.css';

// Feature-specific styles
import layoutStyles from '../shout_out_swapper/ui/layout/Layout.css';
import calendarStyles from '../shout_out_swapper/ui/calendar/Calendar.css';
import calendarCardStyles from '../shout_out_swapper/ui/calendar/CalendarCard.css';
import dropMenuStyles from '../shout_out_swapper/ui/calendar/DropMenu.css';
import contactsStyles from '../shout_out_swapper/ui/contacts/Contacts.css';
import contactModalStyles from '../shout_out_swapper/ui/contacts/ContactModal.css';
import shoutoutModalStyles from '../shout_out_swapper/ui/modal/ShoutoutModal.css';
import scannerModalStyles from '../shout_out_swapper/ui/scanner/ScannerModal.css';
import exportImportStyles from '../shout_out_swapper/ui/export/ExportImportModal.css';
import settingsStyles from '../common/settings/ui/SettingsModal.css';
import bannerStyles from '../shout_out_swapper/ui/banner/TodayBanner.css';
import followersStyles from '../analytics/followers/Followers.css';

// Setup goober with Preact
setup(h);

const logger = log.scope('content');

// Inject all CSS styles
function injectStyles() {
  if (document.getElementById('rr-companion-styles')) return;

  const style = document.createElement('style');
  style.id = 'rr-companion-styles';
  style.textContent = [
    // Base UI (order matters - overlay first, then modal, then dialog)
    overlayStyles,
    modalStyles,
    dialogStyles,
    // Layout and features
    layoutStyles,
    calendarStyles,
    calendarCardStyles,
    dropMenuStyles,
    contactsStyles,
    contactModalStyles,
    shoutoutModalStyles,
    scannerModalStyles,
    exportImportStyles,
    settingsStyles,
    bannerStyles,
    followersStyles,
  ].join('\n');
  document.head.appendChild(style);
  logger.debug('Styles injected');
}

// Find the fictions carousel card (main dashboard) or fallback cards
function findCarouselCard() {
  // Primary: fictions carousel
  const carousel = document.querySelector('.fictions-carousel');
  if (carousel) {
    return carousel.closest('.card.card-custom');
  }
  // Fallback: second card in layout (fiction-specific dashboard)
  const cards = document.querySelectorAll('.card.card-custom');
  if (cards.length >= 2) {
    return cards[1];
  }
  // Last fallback: first card
  if (cards.length >= 1) {
    return cards[0];
  }
  return null;
}

// Wait for element to appear (polling)
function waitForElement(finder, timeout = 10000) {
  return new Promise(resolve => {
    const check = setInterval(() => {
      const element = finder();
      if (element) {
        clearInterval(check);
        resolve(element);
      }
    }, 200);
    setTimeout(() => {
      clearInterval(check);
      resolve(null);
    }, timeout);
  });
}

// Check route type
function getRouteType() {
  const path = window.location.pathname;
  // Analytics pages — matches both /followers/123 and /followers?id=123
  if (path.match(/\/author-dashboard\/analytics\/followers(\/|$)/)) return 'analytics-followers';
  // Chapter edit pages - show banner only (under /author-dashboard/chapters/)
  if (path.includes('/author-dashboard/chapters/new/') ||
      path.includes('/author-dashboard/chapters/edit/') ||
      path.includes('/author-dashboard/chapters/editdraft/')) {
    return 'chapter-edit';
  }
  // Fiction-specific dashboard (must check before main dashboard)
  if (path.match(/\/author-dashboard\/dashboard\/\d+/)) return 'fiction-dashboard';
  // Main dashboard only - exact match for /author-dashboard or /author-dashboard/
  if (path.match(/^\/author-dashboard\/?$/)) return 'main-dashboard';
  return null;
}

// Mount the app
async function mount() {
  const routeType = getRouteType();
  if (!routeType) {
    logger.debug('Not on supported page, skipping');
    return;
  }

  logger.info('Route type:', routeType);

  // Handle analytics pages
  if (routeType === 'analytics-followers') {
    await mountFollowers();
    return;
  }

  // Handle chapter edit pages - banner only
  if (routeType === 'chapter-edit') {
    await mountBanner();
    return;
  }

  let insertBefore = null;

  if (routeType === 'main-dashboard' || routeType === 'fiction-dashboard') {
    // Wait for fictions carousel card
    insertBefore = await waitForElement(findCarouselCard);
  }

  if (!insertBefore) {
    logger.warn('Could not find insertion point');
    return;
  }

  // Small delay after element appears (same as V1)
  await new Promise(r => setTimeout(r, 300));

  logger.info('Mounting RR Companion');

  // Inject styles first
  injectStyles();

  // Remove existing if any
  document.querySelector('#rr-companion-root')?.remove();

  // Create root container
  const root = document.createElement('div');
  root.id = 'rr-companion-root';

  // Insert before the target card
  insertBefore.parentNode.insertBefore(root, insertBefore);

  // Render the app with route type for per-page settings
  render(<Layout routeType={routeType} />, root);

  logger.info('RR Companion mounted');
}

// Mount the Today Banner on chapter edit pages
async function mountBanner() {
  // Wait for the page content to load
  const pageContent = await waitForElement(() => document.querySelector('.page-content-inner'));

  if (!pageContent) {
    logger.warn('Could not find page content');
    return;
  }

  // Small delay
  await new Promise(r => setTimeout(r, 300));

  logger.info('Mounting Today Banner');

  // Inject styles
  injectStyles();

  // Remove existing if any
  document.querySelector('#rr-banner-root')?.remove();

  // Create root container
  const root = document.createElement('div');
  root.id = 'rr-banner-root';

  // Insert at the beginning of page content (before first child)
  const firstChild = pageContent.firstChild;
  if (firstChild) {
    pageContent.insertBefore(root, firstChild);
  } else {
    pageContent.appendChild(root);
  }

  logger.info('Banner root inserted into DOM', { parent: pageContent.className });

  // Open calendar handler - navigate to author dashboard
  const handleOpenCalendar = () => {
    window.open('/author-dashboard', '_blank');
  };

  // Render the banner
  render(<TodayBanner onOpenCalendar={handleOpenCalendar} />, root);

  logger.info('Today Banner mounted');
}

// Mount the Follower Analytics on analytics pages
async function mountFollowers() {
  // Wait for the follower chart card to appear
  const chartCard = await waitForElement(() => {
    const chart = document.querySelector('#follower-history');
    return chart?.closest('.card');
  });

  if (!chartCard) {
    logger.warn('Could not find follower chart card');
    return;
  }

  // Small delay
  await new Promise(r => setTimeout(r, 300));

  logger.info('Mounting Follower Analytics');

  // Inject styles
  injectStyles();

  // Remove existing if any
  document.querySelector('#rr-followers-root')?.remove();

  // Create root container
  const root = document.createElement('div');
  root.id = 'rr-followers-root';

  // Insert after the chart card
  chartCard.parentNode.insertBefore(root, chartCard.nextSibling);

  // Render the component
  render(<Followers />, root);

  logger.info('Follower Analytics mounted');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
