// Calendar card component - displays shoutout in calendar day
// Matches v1's .rr-swap-card structure
import { h } from 'preact';

function handleDragStart(e, shoutout, sourceDate) {
  e.dataTransfer.setData('text/plain', shoutout.id);
  e.dataTransfer.effectAllowed = 'move';
  // Pass source date so drop handler knows which schedule to update
  if (sourceDate) {
    e.dataTransfer.setData('application/x-source-date', sourceDate);
  }
}

// Get swap status icon class
// States:
// SWAPPED  = Us AND Them (both posted) - green retweet
// PENDING  = expected swap date set + not yet reached (we hold off scanning) - purple hourglass-start
// NOT FOUND = Us NOT Them AND scanned (we posted, scanned, they didn't) - red X
// SHOUTED  = Them NOT Us (they posted, we didn't) - cyan message
// SCHEDULED = NOT Us AND NOT Them (neither posted) - orange clock
// NOT SCANNED = Us posted but not scanned yet - grey hourglass
function getSwapIconClass(shoutout, isChecking = false) {
  if (isChecking) {
    return { class: 'rr-swap-icon-checking', icon: 'fa-spinner fa-spin', title: 'Checking for swap...' };
  }

  const wePosted = shoutout.schedules?.some(s => s.chapter);
  const theyPosted = !!shoutout.swappedDate;
  const hasScanned = !!shoutout.lastSwapScanDate;
  const todayStr = new Date().toISOString().slice(0, 10);
  const anyPending = (shoutout.schedules || []).some(
    s => s.expectedSwapDate && !s.swappedDate && todayStr < s.expectedSwapDate,
  );

  // SWAPPED takes priority — done is done.
  if (wePosted && theyPosted) {
    return { class: 'rr-swap-icon-swapped', icon: 'fa-retweet', title: 'Swapped!' };
  }

  // PENDING — user set an expected date and we're waiting. Beats NOT FOUND
  // / NOT SCANNED / SCHEDULED so the card clearly shows "we're holding off".
  if (anyPending) {
    return { class: 'rr-swap-icon-pending', icon: 'fa-hourglass-start', title: 'Pending — expected date not yet reached' };
  }

  if (wePosted && !theyPosted && hasScanned) {
    return { class: 'rr-swap-icon-notfound', icon: 'fa-times', title: 'Not found - they haven\'t shouted you' };
  }

  if (wePosted && !theyPosted && !hasScanned) {
    return { class: 'rr-swap-icon-notscanned', icon: 'fa-hourglass-half', title: 'Not scanned yet' };
  }

  if (theyPosted) {
    return { class: 'rr-swap-icon-shouted', icon: 'fa-comment', title: 'They shouted you!' };
  }

  return { class: 'rr-swap-icon-scheduled', icon: 'fa-clock', title: 'Scheduled' };
}

export function CalendarCard({ shoutout, onClick, isArchived = false, checkState = null, sourceDate = null }) {
  const isChecking = checkState?.status === 'checking';
  const swapIcon = getSwapIconClass(shoutout, isChecking);
  // Use RR's `card` class so the card picks up the host site's light/dark
  // theme automatically instead of hardcoding a background colour.
  const cardClass = `card rr-swap-card${isArchived ? ' rr-archived' : ''}${isChecking ? ' rr-checking' : ''}`;

  return (
    <div
      class={cardClass}
      onClick={onClick}
      draggable={!isArchived}
      onDragStart={(e) => !isArchived && handleDragStart(e, shoutout, sourceDate)}
      data-shoutout-id={shoutout.id}
      data-author-name={shoutout.authorName}
    >
      <div class="rr-swap-card-cover">
        {shoutout.coverUrl ? (
          <img src={shoutout.coverUrl} alt={shoutout.fictionTitle || ''} />
        ) : (
          <div class="rr-swap-card-placeholder">
            {(shoutout.fictionTitle || '?')[0].toUpperCase()}
          </div>
        )}
      </div>
      <span class="rr-swap-card-title">{shoutout.fictionTitle || 'Shoutout'}</span>
      <span class="rr-swap-card-author">
        <i class="fa fa-user"></i> {shoutout.authorName || 'Unknown'}
      </span>
      <span class={`rr-swap-icon ${swapIcon.class}`} title={swapIcon.title}>
        <i class={`fa ${swapIcon.icon}`}></i>
      </span>
      {isChecking && checkState.total > 0 && (
        <div class="rr-card-progress">
          <div
            class="rr-card-progress-bar"
            style={{ width: `${(checkState.current / checkState.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default CalendarCard;
