// Contact Modal - View/Edit contact profile
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Modal } from '../../../common/ui/modal/Modal.jsx';
import * as db from '../../../common/db/proxy.js';
import { log } from '../../../common/logging/core.js';

const logger = log.scope('contact-modal');

function formatSwapDate(dateStr) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return null;
  }
}

export function ContactModal({
  isOpen,
  onClose,
  contact,
  onSave
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [discord, setDiscord] = useState('');
  const [discordId, setDiscordId] = useState('');
  const [email, setEmail] = useState('');
  const [fictionsWithShoutouts, setFictionsWithShoutouts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load data when modal opens
  useEffect(() => {
    if (!isOpen || !contact) return;

    setIsEditing(false);
    setDiscord(contact.discord || '');
    setDiscordId(contact.discordId || '');
    setEmail(contact.email || '');
    setLoading(true);

    // Load fictions with shoutouts for this contact
    loadFictionsWithShoutouts();
  }, [isOpen, contact]);

  async function loadFictionsWithShoutouts() {
    if (!contact?.authorName) {
      setFictionsWithShoutouts([]);
      setLoading(false);
      return;
    }

    try {
      // Get all shoutouts for this author (by author name)
      const allShoutouts = await db.getAll('shoutouts');
      const authorShoutouts = (allShoutouts || []).filter(s =>
        s.authorName === contact.authorName
      );

      // Group shoutouts by fiction
      const fictionMap = new Map();
      for (const shoutout of authorShoutouts) {
        const key = shoutout.fictionId;
        if (!fictionMap.has(key)) {
          fictionMap.set(key, {
            fictionId: shoutout.fictionId,
            fictionTitle: shoutout.fictionTitle,
            fictionUrl: shoutout.fictionUrl,
            coverUrl: shoutout.coverUrl,
            shoutouts: []
          });
        }

        // Add schedule dates
        for (const schedule of (shoutout.schedules || [])) {
          if (schedule.date || schedule.chapter) {
            fictionMap.get(key).shoutouts.push({
              date: schedule.date,
              chapter: schedule.chapter,
              isArchived: !!schedule.chapter
            });
          }
        }
      }

      // Sort by most recent date
      const result = Array.from(fictionMap.values()).sort((a, b) => {
        const aDate = a.shoutouts[0]?.date || '';
        const bDate = b.shoutouts[0]?.date || '';
        return bDate.localeCompare(aDate);
      });

      setFictionsWithShoutouts(result);
    } catch (err) {
      logger.error('Failed to load fictions with shoutouts', err);
      setFictionsWithShoutouts([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const updatedContact = {
      ...contact,
      discord,
      discordId,
      email,
      updatedAt: new Date().toISOString()
    };

    try {
      await db.save('contacts', updatedContact);
      logger.info('Contact saved', { id: contact.id });
      onSave?.(updatedContact);
      setIsEditing(false);
    } catch (err) {
      logger.error('Failed to save contact', err);
    }
  }

  if (!contact) return null;

  const footer = isEditing ? (
    <>
      <button class="btn btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
      <button class="btn btn-primary" onClick={handleSave}>Save</button>
    </>
  ) : (
    <>
      <button class="btn btn-secondary" onClick={onClose}>Close</button>
      <button class="btn btn-primary" onClick={() => setIsEditing(true)}>Edit</button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={contact.authorName || 'Contact'}
      footer={footer}
    >
      <div class="rr-contact-modal-content">
        <div class="rr-contact-modal-header">
          {contact.authorAvatar ? (
            <img src={contact.authorAvatar} class="rr-contact-modal-avatar" alt="" />
          ) : (
            <div class="rr-contact-modal-avatar rr-contact-avatar-placeholder">
              {(contact.authorName || '?')[0].toUpperCase()}
            </div>
          )}
          <div class="rr-contact-modal-name">{contact.authorName || 'Unknown'}</div>
        </div>

        <div class="rr-contact-modal-links">
          {contact.profileUrl && (
            <>
              <a href={contact.profileUrl} target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary">
                <i class="fa fa-user"></i> Profile
              </a>
              <a href={contact.profileUrl.replace('/profile/', '/private/send/')} target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary">
                <i class="fa fa-comments"></i> Message
              </a>
            </>
          )}
        </div>

        {loading ? (
          <div class="rr-contact-loading">Loading...</div>
        ) : fictionsWithShoutouts.length > 0 && (
          <div class="rr-contact-fiction-section">
            <label class="rr-section-label">Swapped Fictions ({fictionsWithShoutouts.length})</label>
            {fictionsWithShoutouts.map(f => {
              const archivedCount = f.shoutouts.filter(s => s.isArchived).length;
              const pendingCount = f.shoutouts.filter(s => !s.isArchived).length;
              return (
                <a
                  key={f.fictionId}
                  href={f.fictionUrl || '#'}
                  target="_blank"
                  rel="noopener"
                  class="rr-contact-fiction-card"
                >
                  {f.coverUrl ? (
                    <img src={f.coverUrl} class="rr-fiction-cover" alt="" />
                  ) : (
                    <div class="rr-fiction-cover rr-fiction-cover-placeholder">
                      {(f.fictionTitle || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div class="rr-fiction-info">
                    <div class="rr-fiction-title">{f.fictionTitle || 'Unknown Fiction'}</div>
                    <div class="rr-fiction-stats">
                      {archivedCount > 0 && (
                        <span class="rr-fiction-stat rr-stat-archived">
                          <i class="fa fa-check-circle"></i> {archivedCount} posted
                        </span>
                      )}
                      {pendingCount > 0 && (
                        <span class="rr-fiction-stat rr-stat-pending">
                          <i class="fa fa-clock"></i> {pendingCount} scheduled
                        </span>
                      )}
                    </div>
                    {f.shoutouts.length > 0 && (
                      <div class="rr-fiction-dates">
                        {f.shoutouts
                          .filter(s => s.date)
                          .slice(0, 3)
                          .map(s => formatSwapDate(s.date))
                          .filter(Boolean)
                          .join(', ')}
                        {f.shoutouts.length > 3 && ` +${f.shoutouts.length - 3} more`}
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}

        <div class="rr-contact-methods">
          <div class="rr-contact-method">
            <i class="fab fa-discord rr-method-icon"></i>
            {isEditing ? (
              <div class="rr-discord-fields">
                <input
                  type="text"
                  class="form-control"
                  placeholder="Username"
                  value={discord}
                  onInput={(e) => setDiscord(e.target.value)}
                />
                <input
                  type="text"
                  class="form-control"
                  placeholder="User ID (for link)"
                  value={discordId}
                  onInput={(e) => setDiscordId(e.target.value)}
                />
              </div>
            ) : (
              <span class="rr-contact-value">
                {discord ? (
                  discordId ? (
                    <a href={`https://discord.com/channels/@me/${discordId}`} target="_blank" rel="noopener" class="rr-discord-link">
                      {discord}
                    </a>
                  ) : discord
                ) : (
                  <span class="rr-contact-empty-value">Not set</span>
                )}
              </span>
            )}
          </div>

          <div class="rr-contact-method">
            <i class="fas fa-envelope rr-method-icon"></i>
            {isEditing ? (
              <input
                type="email"
                class="form-control"
                placeholder="Email address"
                value={email}
                onInput={(e) => setEmail(e.target.value)}
              />
            ) : (
              <span class="rr-contact-value">
                {email ? (
                  <a href={`mailto:${email}`}>{email}</a>
                ) : (
                  <span class="rr-contact-empty-value">Not set</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ContactModal;
