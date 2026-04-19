// Contacts component - React version matching v1's contacts/core.js
import { h } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { log } from '../../../common/logging/core.js';

const logger = log.scope('contacts');

// Format date for upcoming shoutouts
function formatShoutoutDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Contacts({
  contacts = [],
  shoutouts = [],
  onClose,
  onUpcomingClick,
  onContactClick,
  onContactDelete
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Get upcoming shoutouts (next 7 days, not archived)
  const upcomingShoutouts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const upcoming = [];
    for (const shoutout of shoutouts) {
      const schedules = shoutout.schedules || [];
      for (const schedule of schedules) {
        // Skip archived (already posted)
        if (schedule.chapter) continue;
        if (!schedule.date) continue;

        const schedDate = new Date(schedule.date + 'T00:00:00');
        if (schedDate >= today && schedDate <= weekFromNow) {
          upcoming.push({
            id: shoutout.id,
            authorName: shoutout.authorName,
            authorAvatar: shoutout.authorAvatar,
            upcomingDate: schedule.date
          });
        }
      }
    }

    // Sort by date
    upcoming.sort((a, b) => a.upcomingDate.localeCompare(b.upcomingDate));
    return upcoming;
  }, [shoutouts]);

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const query = searchQuery.toLowerCase();
    return contacts.filter(c =>
      (c.authorName || '').toLowerCase().includes(query) ||
      (c.fictionTitle || '').toLowerCase().includes(query)
    );
  }, [contacts, searchQuery]);

  return (
    <div class="rr-contact-list">
      <div class="rr-contact-header">
        <span class="rr-contact-title">Contacts</span>
        <button class="btn btn-sm btn-icon rr-contacts-close" onClick={onClose} title="Close contacts">
          &times;
        </button>
      </div>
      <div class="rr-contact-search">
        <input
          type="text"
          class="form-control rr-contact-search-input"
          placeholder="Search contacts..."
          value={searchQuery}
          onInput={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div class="rr-contact-sections">
        {/* Upcoming Shoutouts */}
        <div class="rr-contact-section rr-upcoming-section">
          <div class="rr-section-header">Upcoming Shoutouts</div>
          <div class="rr-upcoming-items">
            {upcomingShoutouts.length === 0 ? (
              <div class="rr-contact-empty">No upcoming shoutouts.</div>
            ) : (
              upcomingShoutouts.map(s => (
                <div
                  key={`${s.id}-${s.upcomingDate}`}
                  class="rr-contact-item rr-upcoming-item"
                  onClick={() => onUpcomingClick?.(s.id, s.upcomingDate)}
                >
                  {s.authorAvatar ? (
                    <img src={s.authorAvatar} class="rr-contact-avatar" alt="" />
                  ) : (
                    <div class="rr-contact-avatar rr-contact-avatar-placeholder">
                      {(s.authorName || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div class="rr-contact-info">
                    <div class="rr-contact-name">{s.authorName || 'Unknown'}</div>
                    <div class="rr-contact-date">{formatShoutoutDate(s.upcomingDate)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* All Contacts */}
        <div class="rr-contact-section rr-all-section">
          <div class="rr-section-header">All Contacts</div>
          <div class="rr-contact-items">
            {filteredContacts.length === 0 ? (
              <div class="rr-contact-empty">No contacts yet.</div>
            ) : (
              filteredContacts.map(c => (
                <div
                  key={c.id}
                  class="rr-contact-item"
                  onClick={() => onContactClick?.(c.authorName)}
                >
                  {c.authorAvatar ? (
                    <img src={c.authorAvatar} class="rr-contact-avatar" alt="" />
                  ) : (
                    <div class="rr-contact-avatar rr-contact-avatar-placeholder">
                      {(c.authorName || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div class="rr-contact-info">
                    <div class="rr-contact-name">{c.authorName || 'Unknown'}</div>
                    {c.fictionTitle && <div class="rr-contact-fiction">{c.fictionTitle}</div>}
                  </div>
                  <button
                    class="rr-contact-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onContactDelete?.(c.id);
                    }}
                    title="Remove contact"
                  >
                    &times;
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default Contacts;
