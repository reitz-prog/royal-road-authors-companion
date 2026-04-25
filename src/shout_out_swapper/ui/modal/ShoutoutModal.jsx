import { h } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { Modal } from '../../../common/ui/modal/Modal.jsx';
import { DangerConfirmDialog } from '../../../common/ui/dialog/Dialog.jsx';
import { parseShoutoutCode, parseShoutoutCodeAsync } from '../../services/parser.js';
import { checkSwapReturn, getShoutoutCheckState } from '../../services/scanner.js';
import { log } from '../../../common/logging/core.js';

const logger = log.scope('shoutout-modal');

// Get swap status text
function getSwapStatusText(shoutout) {
  if (shoutout?.swappedDate) {
    return `Swapped on ${shoutout.swappedDate}`;
  }
  if (shoutout?.lastSwapScanDate) {
    return `Not found (scanned ${shoutout.lastSwapScanDate})`;
  }
  return 'Pending scan';
}

// Sanitize HTML - remove scripts and event handlers, keep structure/styling
function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Remove script tags
  doc.querySelectorAll('script').forEach(el => el.remove());

  // Remove event handlers from all elements
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
    // Remove javascript: URLs
    ['href', 'src', 'action'].forEach(attr => {
      const val = el.getAttribute(attr);
      if (val && val.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttribute(attr);
      }
    });
  });

  return doc.body.innerHTML;
}

export function ShoutoutModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  onReload,
  date,
  shoutout = null,
  mode = 'add',
  myFictions = [],
  currentFictionId = null,
  contacts = [],
  onSaveContactDiscord,
  onSaveScheduleField
}) {
  const [code, setCode] = useState(shoutout?.code || '');
  const [expectedReturn, setExpectedReturn] = useState(shoutout?.expectedReturnDate || '');
  // Discord username lives on the contact (keyed by author name) so it's
  // shared across every shoutout from the same author. Look it up whenever
  // the modal's effective author name changes; the user can override.
  const [discordUsername, setDiscordUsername] = useState('');
  const [notes, setNotes] = useState(shoutout?.notes || '');
  const [authorInfo, setAuthorInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [hideCode, setHideCode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newScheduleFictionId, setNewScheduleFictionId] = useState('');
  const [newScheduleDate, setNewScheduleDate] = useState('');
  const [checkingSwap, setCheckingSwap] = useState(false);
  const [checkProgress, setCheckProgress] = useState(null);
  const [swapResult, setSwapResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);
  const previewRef = useRef(null);
  const lastShoutoutIdRef = useRef(null);
  // Paste events skip the parse-debounce so the preview swaps in right
  // away. Typing keeps the debounce so we don't hammer fetchFictionDetails
  // on every keystroke.
  const justPastedRef = useRef(false);

  // Reset state when modal opens or shoutout ID changes (not on data refresh)
  useEffect(() => {
    if (!isOpen) return;

    // Only reset swap-related state when shoutout ID changes
    const shoutoutIdChanged = shoutout?.id !== lastShoutoutIdRef.current;
    lastShoutoutIdRef.current = shoutout?.id;

    const newCode = shoutout?.code || '';
    setCode(newCode);
    setExpectedReturn(shoutout?.expectedReturnDate || '');
    setNotes(shoutout?.notes || '');
    // Discord username is filled from the matching contact in a separate
    // effect so contacts-store updates don't clobber the rest of the modal.
    setShowPreview(false);
    setHideCode(false);
    setLoading(false);
    setShowAddSchedule(false);
    setNewScheduleFictionId('');
    setNewScheduleDate('');
    setCopied(false);

    // Only reset swap state when opening a different shoutout
    if (shoutoutIdChanged) {
      setCheckingSwap(false);
      setCheckProgress(null);
      setSwapResult(null);
    }

    // Initialize schedules from shoutout or create default
    // In "all" mode (no currentFictionId), auto-assign unassigned schedules to primary fiction
    const primaryFictionId = myFictions[0]?.fictionId || '';

    if (shoutout?.schedules?.length > 0) {
      // Auto-fix any schedules without fictionId when in "all" mode
      const fixedSchedules = shoutout.schedules.map(sched => {
        if (!sched.fictionId && !currentFictionId && primaryFictionId) {
          return { ...sched, fictionId: primaryFictionId };
        }
        return sched;
      });
      setSchedules(fixedSchedules);
    } else if (date) {
      // Default schedule: use current fiction or primary fiction
      const defaultFictionId = currentFictionId || primaryFictionId;
      setSchedules([{ fictionId: defaultFictionId, date: date }]);
    } else {
      // No date provided - still assign to primary in "all" mode
      if (!currentFictionId && primaryFictionId) {
        setSchedules([{ fictionId: primaryFictionId, date: null }]);
      } else {
        setSchedules([]);
      }
    }

    // Default new schedule fiction to first available (not already assigned)
    // Will be updated when showAddSchedule opens
    setNewScheduleFictionId('');

    // Use cached data if available (edit mode)
    if (shoutout?.fictionTitle || shoutout?.authorName || shoutout?.coverUrl) {
      setAuthorInfo({
        fictionId: shoutout.fictionId,
        fictionTitle: shoutout.fictionTitle,
        fictionUrl: shoutout.fictionUrl,
        coverUrl: shoutout.coverUrl,
        authorName: shoutout.authorName,
        profileUrl: shoutout.profileUrl
      });
    } else {
      setAuthorInfo(null);
    }

    // Textarea is now controlled via `value={code}`; no manual sync needed.
  }, [isOpen, shoutout, date, currentFictionId, myFictions]);

  // Pull the Discord username from the matching contact whenever the active
  // author or the contacts data changes. This is the single source of truth —
  // when the contact is saved (here or elsewhere), this re-fires and the
  // displayed value updates. Doesn't reset on contacts-only changes thanks
  // to being in its own effect, so other modal state is untouched.
  useEffect(() => {
    if (!isOpen) return;
    const author = shoutout?.authorName || authorInfo?.authorName;
    if (!author) return;
    const contact = contacts.find(c => c.authorName === author);
    if (contact) {
      setDiscordUsername(contact.discordUsername || '');
    } else if (shoutout?.discordUsername) {
      // Legacy shoutouts (pre-contact-migration) carried it on the shoutout itself.
      setDiscordUsername(shoutout.discordUsername);
    }
  }, [isOpen, shoutout?.id, shoutout?.authorName, authorInfo?.authorName, contacts]);

  // Check for ongoing swap check when modal opens (for scans started from calendar)
  useEffect(() => {
    if (!isOpen || !shoutout?.id) return;

    let pollInterval = null;

    const checkForOngoingScan = async () => {
      try {
        const state = await getShoutoutCheckState(shoutout.id);
        if (state?.status === 'checking') {
          setCheckingSwap(true);
          setCheckProgress({
            current: state.current || 0,
            total: state.total || 0,
            chapter: state.chapter || ''
          });

          // Start polling if not already
          if (!pollInterval) {
            pollInterval = setInterval(checkForOngoingScan, 500);
          }
        } else if (state?.status === 'complete') {
          setCheckingSwap(false);
          setCheckProgress(null);
          if (state.found) {
            setSwapResult({ found: true, chapter: state.chapter, chapterUrl: state.chapterUrl });
          }
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        } else {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      } catch (err) {
        logger.error('Failed to check swap state', err);
      }
    };

    // Initial check
    checkForOngoingScan();

    // Listen for progress messages
    const handleMessage = (message) => {
      if (message.type === 'swapCheckProgress' && message.shoutoutId === shoutout.id) {
        setCheckingSwap(true);
        setCheckProgress({
          current: message.current,
          total: message.total,
          chapter: message.chapter
        });
      }
      if (message.type === 'swapCheckComplete' && message.shoutoutId === shoutout.id) {
        setCheckingSwap(false);
        setCheckProgress(null);
        onReload?.();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isOpen, shoutout?.id]);

  // Parse code when it changes. We keep the cached author info on the
  // first render of an edit so we don't burn a fetch to re-derive what we
  // already know — but once the user actually edits the code (so it no
  // longer matches the stored code), fall through and re-parse. Otherwise
  // the preview panel gets stuck showing the old fiction even after the
  // code has been replaced with a different shoutout's code.
  //
  // A `cancelled` flag also guards against a stale parseShoutoutCodeAsync
  // resolving after the user has already switched to a different shoutout
  // — without it, the preview would briefly flash the previous card's
  // data.
  //
  // NOTE: deps are `[code]` only. When the user switches shoutouts the
  // reset effect above fires first and setCode(newShoutout.code); the
  // parse effect then re-runs on the resulting code change and sees
  // codeUnchanged=true, so it doesn't clobber the freshly-set authorInfo.
  // Including `shoutout` in the deps would cause a stale-code re-parse
  // during the shoutout-change tick (code still holds the previous
  // shoutout's value at that moment) and overwrite the cached authorInfo.
  useEffect(() => {
    const hasCache = shoutout?.fictionTitle || shoutout?.authorName;
    const codeUnchanged = (shoutout?.code || '').trim() === code.trim();
    if (hasCache && codeUnchanged) {
      return;
    }

    if (!code.trim()) {
      setAuthorInfo(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const basicInfo = parseShoutoutCode(code);

    if (basicInfo.fictionId) {
      setLoading(true);
      setAuthorInfo(basicInfo);

      const fetchDetails = async () => {
        const data = await parseShoutoutCodeAsync(code);
        if (cancelled) return;
        setAuthorInfo(data);
        setLoading(false);
      };

      // Paste → no debounce. Keystrokes → 100ms debounce so rapid typing
      // doesn't fire a fetch per character.
      const delay = justPastedRef.current ? 0 : 100;
      justPastedRef.current = false;
      const timeout = setTimeout(fetchDetails, delay);
      return () => {
        cancelled = true;
        clearTimeout(timeout);
        setLoading(false);
      };
    } else {
      setAuthorInfo(basicInfo.fictionTitle ? basicInfo : null);
      setLoading(false);
    }
  }, [code]);

  // In view mode the preview should mirror whatever's stored on the
  // current shoutout record — no async parsing, no stale authorInfo.
  // Quickly switching between cards won't flash the previous card's data.
  const effectiveAuthorInfo = mode === 'view' && shoutout
    ? {
        fictionId: shoutout.fictionId,
        fictionTitle: shoutout.fictionTitle,
        fictionUrl: shoutout.fictionUrl,
        coverUrl: shoutout.coverUrl,
        authorName: shoutout.authorName,
        profileUrl: shoutout.profileUrl,
      }
    : authorInfo;

  const handleSave = useCallback(() => {
    // Read directly from textarea ref like we do for preview
    const actualCode = textareaRef.current?.value || code;
    onSave?.({
      id: shoutout?.id,
      code: actualCode,
      expectedReturnDate: expectedReturn,
      discordUsername,
      notes,
      schedules: schedules,
      ...authorInfo
    });
    onClose();
  }, [code, expectedReturn, discordUsername, notes, authorInfo, shoutout, schedules, onSave, onClose]);

  const handleRemoveSchedule = (index) => {
    setSchedules(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateScheduleDate = (index, newDate) => {
    setSchedules(prev => prev.map((sched, i) =>
      i === index ? { ...sched, date: newDate } : sched
    ));
  };

  const handleAddSchedule = () => {
    if (!newScheduleFictionId || !newScheduleDate) return;

    // Check if this fiction+date combo already exists
    const exists = schedules.some(
      s => s.fictionId === newScheduleFictionId && s.date === newScheduleDate
    );
    if (exists) return;

    setSchedules(prev => [...prev, { fictionId: newScheduleFictionId, date: newScheduleDate }]);
    setShowAddSchedule(false);
    setNewScheduleFictionId('');
    setNewScheduleDate('');
  };

  // Get fiction title by ID
  const getFictionTitle = (fictionId) => {
    if (!fictionId) return 'Unassigned';
    const fiction = myFictions.find(f => String(f.fictionId) === String(fictionId));
    return fiction?.title || `Fiction #${fictionId}`;
  };

  const handleCopy = async () => {
    const actualCode = textareaRef.current?.value || code;
    if (!actualCode) return;

    try {
      await navigator.clipboard.writeText(actualCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logger.error('Copy failed', err);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    onDelete?.(shoutout?.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  // Check if the other author has posted our shoutout
  const handleCheckSwap = async () => {
    logger.info('Check swap clicked', { shoutoutId: shoutout?.id, fictionId: shoutout?.fictionId });

    if (!shoutout?.id || !shoutout?.fictionId) {
      logger.error('Missing shoutout data', { shoutout });
      setSwapResult({ error: 'Missing shoutout data' });
      return;
    }

    // Get all our fiction IDs
    const myFictionIds = myFictions.map(f => f.fictionId);
    logger.info('My fiction IDs', { myFictionIds });
    if (myFictionIds.length === 0) {
      setSwapResult({ error: 'No fictions found to check against' });
      return;
    }

    setCheckingSwap(true);
    setCheckProgress(null);
    setSwapResult(null);

    // Listen for progress updates
    const progressListener = (message) => {
      if (message.type === 'swapCheckProgress' && message.shoutoutId === shoutout.id) {
        setCheckProgress({
          current: message.current,
          total: message.total,
          chapter: message.chapter
        });
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);

    try {
      logger.info('Calling checkSwapReturn...', { shoutoutId: shoutout.id, theirFictionId: shoutout.fictionId, myFictionIds });
      const result = await checkSwapReturn(shoutout.id, shoutout.fictionId, myFictionIds);
      logger.info('Check swap result', result);
      setSwapResult(result);

      // Background service already saves the result to the database
      // Trigger a data reload to refresh the UI
      if (!result.error) {
        logger.info('Swap check complete, triggering reload');
        onReload?.();
      }
    } catch (err) {
      logger.error('Check swap failed', err);
      setSwapResult({ error: err.message });
    } finally {
      chrome.runtime.onMessage.removeListener(progressListener);
      setCheckingSwap(false);
      setCheckProgress(null);
    }
  };

  const title = mode === 'add' ? 'Add Shoutout' : mode === 'edit' ? 'Edit Shoutout' : 'View Shoutout';
  const lineCount = code.split('\n').length;

  // Find the schedule for the current date or first archived schedule
  const currentSchedule = shoutout?.schedules?.find(s => s.date === date) ||
                          shoutout?.schedules?.find(s => s.chapter) ||
                          shoutout?.schedules?.[0];

  // Check if has archived schedules (for delete button logic)
  const hasArchivedSchedule = shoutout?.schedules?.some(s => s.chapter);

  const footer = (
    <>
      {mode === 'view' && (
        <button class="btn btn-outline-danger me-auto" onClick={handleDeleteClick}>
          Untrack
        </button>
      )}
      {mode === 'edit' && !hasArchivedSchedule && (
        <button class="btn btn-outline-danger me-auto" onClick={handleDeleteClick}>
          Delete
        </button>
      )}
      <button class="btn btn-secondary" onClick={onClose}>
        {mode === 'view' ? 'Close' : 'Cancel'}
      </button>
      {mode !== 'view' && (
        <button class="btn btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? 'Loading...' : 'Save'}
        </button>
      )}
    </>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        className="rr-modal-xlarge"
        footer={footer}
      >
        {mode === 'view' ? (
          /* View mode - matches v1 layout */
          <>
            {/* Date header */}
            {currentSchedule?.date && (
              <div class="rr-modal-date">{formatDate(currentSchedule.date)}</div>
            )}

            <div class="rr-modal-edit-layout">
              {/* Left side - shoutout preview and chapter info */}
              <div class="rr-modal-edit-code">
                {/* Shoutout code preview */}
                {shoutout?.code && (
                  <div class="rr-view-code">
                    <label class="rr-label">Shoutout Preview:</label>
                    <div
                      class="rr-code-preview"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(shoutout.code) }}
                    />
                  </div>
                )}

                <div class="rr-view-details">
                  <div class="rr-view-row">
                    <span class="rr-label">Our Chapter:</span>
                    <span>{currentSchedule?.chapter || 'Not archived'}</span>
                  </div>
                  <div class="rr-view-row">
                    <span class="rr-label">Swapped for:</span>
                    <span>{authorInfo?.fictionTitle || 'Unknown'}</span>
                  </div>
                  {currentSchedule?.chapterUrl && (
                    <a
                      href={currentSchedule.chapterUrl}
                      target="_blank"
                      rel="noopener"
                      class="btn btn-sm btn-primary rr-goto-chapter-btn"
                    >
                      <i class="fa fa-external-link"></i> Go to Chapter
                    </a>
                  )}
                </div>

                {/* Swap check error result */}
                {swapResult?.error && (
                  <div class="rr-swap-result rr-swap-not-found">
                    <i class="fa fa-exclamation-circle"></i> Error: {swapResult.error}
                  </div>
                )}
              </div>

              {/* Right side - author panel with swap status */}
              <div class="rr-modal-author-panel">
                <AuthorInfo
                  info={effectiveAuthorInfo}
                  loading={loading}
                  shoutout={shoutout}
                  schedules={shoutout?.schedules || []}
                  myFictions={myFictions}
                  onCheckSwap={handleCheckSwap}
                  checkingSwap={checkingSwap}
                  checkProgress={checkProgress}
                  swapResult={swapResult}
                  mode={mode}
                  discordUsername={discordUsername}
                  onDiscordUsernameChange={(next) => {
                    setDiscordUsername(next);
                    const author = effectiveAuthorInfo?.authorName || shoutout?.authorName;
                    if (!author) return;
                    onSaveContactDiscord?.(author, next);
                  }}
                  onSaveScheduleField={(idx, fields) => {
                    if (shoutout?.id != null) onSaveScheduleField?.(shoutout.id, idx, fields);
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          /* Edit/Add mode */
          <>
            {date && <div class="rr-modal-date">{formatDate(date)}</div>}

            <div class="rr-modal-edit-layout">
          <div class="rr-modal-edit-code">
            <div class="rr-modal-code-header">
              <label class="rr-modal-label">Shoutout Code</label>
              <div class="rr-modal-code-toggles">
                <button
                  class={`rr-toggle-btn ${copied ? 'active' : ''}`}
                  onClick={handleCopy}
                  title={copied ? 'Copied!' : 'Copy to clipboard'}
                >
                  <i class={`fa ${copied ? 'fa-check' : 'fa-clipboard'}`}></i>
                </button>
                <button
                  class={`rr-toggle-btn ${!hideCode ? 'active' : ''}`}
                  onClick={() => setHideCode(!hideCode)}
                  title={hideCode ? 'Show Code' : 'Hide Code'}
                >
                  <i class="fa fa-code"></i>
                </button>
                <button
                  class={`rr-toggle-btn ${showPreview ? 'active' : ''}`}
                  onClick={() => {
                    const newShowPreview = !showPreview;
                    setShowPreview(newShowPreview);

                    if (newShowPreview) {
                      const val = textareaRef.current?.value || code;
                      setTimeout(() => {
                        if (previewRef.current) {
                          previewRef.current.innerHTML = sanitizeHtml(val);
                        }
                      }, 0);
                    }
                  }}
                  title={showPreview ? 'Hide Preview' : 'Show Preview'}
                >
                  <i class="fa fa-eye"></i>
                </button>
              </div>
            </div>
            {!hideCode && (
              <div class="rr-textarea-wrapper">
                <div class="rr-line-numbers">
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  class="rr-modal-textarea form-control"
                  placeholder="Paste your shoutout code here..."
                  value={code}
                  onPaste={() => { justPastedRef.current = true; }}
                  onInput={(e) => setCode(e.target.value)}
                />
              </div>
            )}
            {showPreview && (
              <div class="rr-modal-preview-container">
                <div ref={previewRef} class="rr-modal-preview" />
              </div>
            )}
            <div class="rr-expected-date-row">
              <label class="rr-modal-label">Expected return:</label>
              <input
                type="date"
                class="form-control form-control-sm"
                value={expectedReturn}
                onInput={(e) => setExpectedReturn(e.target.value)}
              />
            </div>

            {/* Schedules section - tags UI */}
            <div class="rr-schedules-section">
              <label class="rr-modal-label">Scheduled for:</label>
              <div class="rr-schedules-list">
                {schedules.length === 0 ? (
                  <span class="rr-no-schedules">No schedules yet</span>
                ) : (
                  schedules.map((sched, idx) => {
                    const isArchived = !!sched.chapter;
                    return (
                      <div key={idx} class={`rr-schedule-tag ${isArchived ? 'rr-schedule-archived' : ''}`}>
                        <span class="rr-schedule-fiction">{getFictionTitle(sched.fictionId)}</span>
                        {isArchived ? (
                          <span class="rr-schedule-date">{sched.date}</span>
                        ) : (
                          <input
                            type="date"
                            class="rr-schedule-date-input"
                            value={sched.date || ''}
                            onChange={(e) => handleUpdateScheduleDate(idx, e.target.value)}
                          />
                        )}
                        {isArchived && <i class="fa fa-check rr-schedule-archived-icon" title="Archived"></i>}
                        {!isArchived && (
                          <button
                            class="rr-schedule-remove"
                            onClick={() => handleRemoveSchedule(idx)}
                            title="Remove schedule"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
                {!showAddSchedule && (
                  <button
                    class="rr-schedule-show-add-btn"
                    onClick={() => {
                      // Default to first fiction not already assigned
                      const availableFictions = myFictions.filter(
                        f => !schedules.some(s => String(s.fictionId) === String(f.fictionId))
                      );
                      setNewScheduleFictionId(availableFictions[0]?.fictionId || '');
                      setShowAddSchedule(true);
                    }}
                    title="Add schedule"
                  >
                    +
                  </button>
                )}
              </div>
              {showAddSchedule && (
                <div class="rr-schedule-add">
                  <select
                    class="form-control form-control-sm"
                    value={newScheduleFictionId}
                    onChange={(e) => setNewScheduleFictionId(e.target.value)}
                  >
                    <option value="">Select fiction...</option>
                    {myFictions
                      .filter(f => !schedules.some(s => String(s.fictionId) === String(f.fictionId)))
                      .map(f => (
                        <option key={f.fictionId} value={f.fictionId}>
                          {f.title || `Fiction ${f.fictionId}`}
                        </option>
                      ))}
                  </select>
                  <input
                    type="date"
                    class="form-control form-control-sm"
                    value={newScheduleDate}
                    onChange={(e) => setNewScheduleDate(e.target.value)}
                  />
                  <button class="btn btn-sm btn-primary" onClick={handleAddSchedule}>
                    Add
                  </button>
                  <button class="btn btn-sm btn-secondary" onClick={() => setShowAddSchedule(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div class="rr-notes-section">
              <label class="rr-modal-label">Notes:</label>
              <textarea
                class="form-control rr-notes-textarea"
                placeholder="Notes (optional)"
                rows="3"
                value={notes}
                onInput={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div class="rr-modal-author-panel">
            <AuthorInfo
              info={effectiveAuthorInfo}
              loading={loading}
              shoutout={shoutout}
              schedules={schedules}
              myFictions={myFictions}
              onCheckSwap={handleCheckSwap}
              checkingSwap={checkingSwap}
              checkProgress={checkProgress}
              swapResult={swapResult}
              mode={mode}
              discordUsername={discordUsername}
              onDiscordUsernameChange={(next) => {
                setDiscordUsername(next);
                const author = effectiveAuthorInfo?.authorName || shoutout?.authorName;
                if (!author) return;
                onSaveContactDiscord?.(author, next);
              }}
              onSaveScheduleField={(idx, fields) => {
                if (shoutout?.id != null) onSaveScheduleField?.(shoutout.id, idx, fields);
              }}
            />
          </div>
        </div>
          </>
        )}
      </Modal>

      <DangerConfirmDialog
        isOpen={showDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        title="Delete Shoutout"
        message="Are you sure you want to delete this shoutout? This action cannot be undone."
        confirmLabel="Delete"
      />
    </>
  );
}

// Compute per-schedule swap state. Pure function of one `sched` entry.
// States mirror the archive/list view vocabulary.
function getSchedulePillState(sched) {
  const wePosted = !!sched.chapter;
  const theyPosted = !!sched.swappedDate;
  const scanned = !!sched.lastSwapScanDate;
  if (wePosted && theyPosted) return 'SWAPPED';
  if (theyPosted) return 'SHOUTED';
  // PENDING — user set an expected swap date and we haven't reached it yet.
  // Beats NOT SCANNED / SCHEDULED so the UI clearly says "we're waiting".
  if (sched.expectedSwapDate) {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (todayStr < sched.expectedSwapDate) return 'PENDING';
  }
  if (wePosted && scanned) return 'NOT FOUND';
  if (wePosted) return 'NOT SCANNED';
  return 'SCHEDULED';
}

function SchedulePill({ state, sched }) {
  const classByState = {
    SWAPPED: 'rr-swap-badge-swapped',
    'NOT FOUND': 'rr-swap-badge-not-found',
    'NOT SCANNED': 'rr-swap-badge-not-scanned',
    SHOUTED: 'rr-swap-badge-shouted',
    SCHEDULED: 'rr-swap-badge-scheduled',
    PENDING: 'rr-swap-badge-pending',
  };
  const cls = classByState[state] || 'rr-swap-badge-scheduled';
  const clickable = state === 'SWAPPED' && !!sched.swappedChapterUrl;
  const titleParts = [state];
  if (state === 'SWAPPED' && sched.swappedChapter) titleParts.push(`in "${sched.swappedChapter}"`);
  if (state === 'NOT FOUND' && sched.lastSwapScanDate) titleParts.push(`scanned ${sched.lastSwapScanDate}`);
  if (state === 'PENDING' && sched.expectedSwapDate) titleParts.push(`expected by ${sched.expectedSwapDate}`);
  const title = titleParts.join(' — ');

  if (clickable) {
    return (
      <a
        class={`rr-swap-pill ${cls} rr-swap-badge-clickable`}
        href={sched.swappedChapterUrl}
        target="_blank"
        rel="noopener"
        title={title}
        onClick={(e) => e.stopPropagation()}
      >
        {state}
      </a>
    );
  }
  return <span class={`rr-swap-pill ${cls}`} title={title}>{state}</span>;
}

// Per-schedule "expected swap date" pill. Read-only display + edit pencil
// by default; on edit, swaps to a date input + ✓ confirm + × cancel. Saves
// inline via the onSave callback so it persists from view mode (archived
// shoutouts) too.
function ExpectedDatePill({ value, onSave }) {
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value || '');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(value || '');
    setEditing(!value);
  }, [value]);

  const openPicker = useCallback((evt) => {
    const el = inputRef.current;
    console.log('[ExpectedDatePill] openPicker', {
      hasEl: !!el,
      hasShowPicker: typeof el?.showPicker === 'function',
      isTrusted: evt?.isTrusted,
    });
    if (!el) return;
    try {
      el.focus();
      if (typeof el.showPicker === 'function') {
        el.showPicker();
      } else {
        // Fallback: simulate a click on the input itself.
        el.click();
      }
    } catch (e) {
      console.warn('[ExpectedDatePill] showPicker failed', e);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    const trimmed = (draft || '').trim();
    onSave?.(trimmed);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [draft, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(value || '');
    setEditing(!value);
  }, [value]);

  if (editing) {
    return (
      <span class="rr-expected-pill rr-expected-pill-editing">
        <i class="fa fa-clock-o" aria-hidden="true"></i>
        <span class="rr-expected-pill-label">Expected:</span>
        <input
          ref={inputRef}
          type="date"
          class="rr-expected-pill-input"
          value={draft}
          onInput={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
            if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
          }}
          autoFocus
        />
        <button type="button" class="rr-expected-pill-btn rr-expected-pill-confirm" onClick={handleConfirm} title="Save">
          <i class="fa fa-check"></i>
        </button>
        {!!value && (
          <button type="button" class="rr-expected-pill-btn" onClick={handleCancel} title="Cancel">
            <i class="fa fa-times"></i>
          </button>
        )}
      </span>
    );
  }

  return (
    <span class="rr-expected-pill" title={`Expected by ${value}`}>
      <i class="fa fa-clock-o" aria-hidden="true"></i>
      <span class="rr-expected-pill-label">Expected:</span>
      <span class="rr-expected-pill-date">{value}</span>
      {saved && <span class="rr-expected-pill-saved">Saved</span>}
      <button type="button" class="rr-expected-pill-btn" onClick={() => setEditing(true)} title="Edit expected date">
        <i class="fa fa-pencil"></i>
      </button>
    </span>
  );
}

function DiscordBadge({ value, onSave }) {
  // Self-managed edit toggle: read-only by default (show + copy + edit), or
  // edit (input + confirm + cancel). Default to edit when there's nothing yet.
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value || '');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync draft + editing when the source value changes (e.g. switching to a
  // different shoutout / contact updates externally).
  useEffect(() => {
    setDraft(value || '');
    setEditing(!value);
  }, [value]);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) { /* clipboard blocked */ }
  }, [value]);

  const handleConfirm = useCallback(() => {
    const trimmed = (draft || '').trim();
    console.log('[DiscordBadge] confirm save', { trimmed, hasOnSave: typeof onSave === 'function' });
    onSave?.(trimmed);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [draft, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(value || '');
    setEditing(!value);
  }, [value]);

  return (
    <div class="rr-discord-row">
      <span class="rr-discord-row-icon" aria-hidden="true" title="Discord username">
        {/* Inline SVG so we don't depend on Font Awesome's brands subset. */}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M19.27 5.33a18.18 18.18 0 0 0-4.55-1.43.07.07 0 0 0-.07.04c-.2.36-.42.83-.57 1.2a16.85 16.85 0 0 0-5.16 0c-.15-.38-.38-.84-.58-1.2a.08.08 0 0 0-.07-.04c-1.6.27-3.13.75-4.55 1.43a.07.07 0 0 0-.03.03C.83 9.61.18 13.78.51 17.9a.08.08 0 0 0 .03.05 18.34 18.34 0 0 0 5.55 2.84.08.08 0 0 0 .08-.03c.43-.59.81-1.21 1.13-1.86a.08.08 0 0 0-.04-.1 12.1 12.1 0 0 1-1.74-.83.08.08 0 0 1 0-.13c.12-.09.24-.18.35-.27a.08.08 0 0 1 .08-.01 13.07 13.07 0 0 0 11.16 0 .08.08 0 0 1 .08.01l.35.27a.08.08 0 0 1 0 .13c-.55.32-1.13.6-1.74.83a.08.08 0 0 0-.04.11c.32.65.71 1.27 1.13 1.85a.08.08 0 0 0 .08.03 18.27 18.27 0 0 0 5.56-2.84.08.08 0 0 0 .03-.05c.39-4.78-.65-8.91-2.76-12.55a.06.06 0 0 0-.03-.03ZM8.02 15.39c-1.1 0-2-1-2-2.24 0-1.23.88-2.24 2-2.24 1.13 0 2.02 1.02 2 2.24 0 1.24-.88 2.24-2 2.24Zm7.39 0c-1.1 0-2-1-2-2.24 0-1.23.88-2.24 2-2.24 1.13 0 2.02 1.02 2 2.24 0 1.24-.87 2.24-2 2.24Z"/>
        </svg>
      </span>

      {editing ? (
        <>
          <input
            type="text"
            class="form-control form-control-sm rr-discord-row-input"
            placeholder="Discord username"
            value={draft}
            onInput={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
              if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
            }}
            autoFocus
          />
          <button
            type="button"
            class="rr-discord-row-btn rr-discord-row-confirm"
            onClick={handleConfirm}
            title="Save"
            aria-label="Save Discord username"
          >
            <i class="fa fa-check"></i>
          </button>
          {!!value && (
            <button
              type="button"
              class="rr-discord-row-btn"
              onClick={handleCancel}
              title="Cancel"
              aria-label="Cancel"
            >
              <i class="fa fa-times"></i>
            </button>
          )}
        </>
      ) : (
        <>
          <span class="rr-discord-row-text">{value}</span>
          {saved && <span class="rr-discord-row-saved" aria-live="polite">Saved</span>}
          <button
            type="button"
            class="rr-discord-row-btn"
            onClick={handleCopy}
            title={copied ? 'Copied' : 'Copy username'}
            aria-label="Copy Discord username"
          >
            <i class={copied ? 'fa fa-check' : 'fa fa-copy'}></i>
          </button>
          <button
            type="button"
            class="rr-discord-row-btn"
            onClick={() => setEditing(true)}
            title="Edit"
            aria-label="Edit Discord username"
          >
            <i class="fa fa-pencil"></i>
          </button>
        </>
      )}
    </div>
  );
}

function AuthorInfo({ info, loading, shoutout, schedules = [], myFictions = [], onCheckSwap, checkingSwap, checkProgress, swapResult, mode = 'edit', discordUsername = '', onDiscordUsernameChange, onSaveScheduleField }) {
  if (loading) {
    return <div class="rr-author-empty">Loading...</div>;
  }

  if (!info || (!info.fictionTitle && !info.authorName)) {
    return <div class="rr-author-empty">Paste code to see author info</div>;
  }

  const lastScan = shoutout?.lastSwapScanDate;
  // Any schedule that still needs checking gates the "Check Swap" button.
  const needsCheck = (schedules || []).some(s => {
    const st = getSchedulePillState(s);
    return st === 'NOT SCANNED' || st === 'NOT FOUND' || st === 'SCHEDULED' || st === 'SHOUTED';
  });

  return (
    <div class="rr-author-card-large">
      {info.coverUrl && <img src={info.coverUrl} alt="" class="rr-author-cover-large" />}
      <div class="rr-author-fiction-large">{info.fictionTitle || 'Unknown'}</div>
      <div class="rr-author-name">
        {info.profileUrl ? (
          <>by <a href={info.profileUrl} target="_blank" rel="noopener">{info.authorName || 'Unknown'}</a></>
        ) : (
          <>by {info.authorName || 'Unknown'}</>
        )}
      </div>
      <DiscordBadge
        value={discordUsername}
        onSave={onDiscordUsernameChange}
      />

      {info.fictionUrl && (
        <a href={info.fictionUrl} target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary rr-view-fiction-btn">
          View Fiction
        </a>
      )}

      {/* Scheduled for section — each item carries its own per-schedule pill */}
      {schedules.length > 0 && (
        <div class="rr-scheduled-for-section">
          <div class="rr-scheduled-for-label">Scheduled for:</div>
          <div class="rr-scheduled-for-list">
            {schedules.map((sched, idx) => {
              const fiction = myFictions.find(f => String(f.fictionId) === String(sched.fictionId));
              const fictionTitle = fiction?.title || `Fiction #${sched.fictionId}`;
              const isArchived = !!sched.chapter;
              const state = getSchedulePillState(sched);
              return (
                <div key={idx} class={`rr-scheduled-for-item ${isArchived ? 'rr-archived' : ''}`}>
                  <span class="rr-scheduled-fiction-title">{fictionTitle}</span>
                  {sched.date && <span class="rr-scheduled-date">{sched.date}</span>}
                  {!sched.date && <span class="rr-scheduled-date rr-unscheduled">Unscheduled</span>}
                  {shoutout && <SchedulePill state={state} sched={sched} />}
                  {shoutout && !(sched.swappedDate && !sched.expectedSwapDate) && (
                    <ExpectedDatePill
                      value={sched.expectedSwapDate || ''}
                      onSave={(next) => onSaveScheduleField?.(idx, { expectedSwapDate: next })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scan progress / action — only when viewing an existing shoutout */}
      {shoutout && (
        <div class="rr-swap-section">
          {checkingSwap ? (
            <div class="rr-swap-checking">
              <div class="rr-swap-badge rr-swap-badge-checking">
                <i class="fa fa-spinner fa-spin"></i> CHECKING
              </div>
              {checkProgress && (
                <>
                  <div class="rr-swap-progress-bar">
                    <div
                      class="rr-swap-progress-fill"
                      style={{ width: `${(checkProgress.current / checkProgress.total) * 100}%` }}
                    />
                  </div>
                  <div class="rr-swap-progress-text">
                    {checkProgress.current}/{checkProgress.total} chapters
                  </div>
                  <div class="rr-swap-progress-chapter" title={checkProgress.chapter}>
                    {checkProgress.chapter}
                  </div>
                </>
              )}
            </div>
          ) : needsCheck ? (
            <button
              class="btn btn-sm btn-outline-primary rr-check-swap-btn"
              onClick={onCheckSwap}
              title="Scan their fiction for return shoutouts"
            >
              <i class="fa fa-search"></i> Check for swap returns
            </button>
          ) : null}
          {lastScan && !checkingSwap && (
            <div class="rr-swap-last-scan">Last scan: {lastScan}</div>
          )}
          {swapResult?.error && (
            <div class="rr-swap-result rr-swap-not-found">
              <i class="fa fa-exclamation-circle"></i> Error: {swapResult.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
