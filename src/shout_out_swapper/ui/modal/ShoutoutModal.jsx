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
  currentFictionId = null
}) {
  const [code, setCode] = useState(shoutout?.code || '');
  const [expectedReturn, setExpectedReturn] = useState(shoutout?.expectedReturnDate || '');
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

  // Reset state when modal opens or shoutout ID changes (not on data refresh)
  useEffect(() => {
    if (!isOpen) return;

    // Only reset swap-related state when shoutout ID changes
    const shoutoutIdChanged = shoutout?.id !== lastShoutoutIdRef.current;
    lastShoutoutIdRef.current = shoutout?.id;

    const newCode = shoutout?.code || '';
    setCode(newCode);
    setExpectedReturn(shoutout?.expectedReturnDate || '');
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

    // Update textarea directly since we use defaultValue
    if (textareaRef.current) {
      textareaRef.current.value = newCode;
    }
  }, [isOpen, shoutout, date, currentFictionId, myFictions]);

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

  // Parse code when it changes (only for new code, not cached)
  useEffect(() => {
    // Skip if we already have cached author info from shoutout
    if (shoutout?.fictionTitle || shoutout?.authorName) {
      return;
    }

    if (!code.trim()) {
      setAuthorInfo(null);
      setLoading(false);
      return;
    }

    // Immediately parse to get basic info (sync)
    const basicInfo = parseShoutoutCode(code);

    // If we have a fictionId, set loading immediately and fetch full details
    if (basicInfo.fictionId) {
      setLoading(true);
      setAuthorInfo(basicInfo); // Show basic info while loading

      const fetchDetails = async () => {
        const data = await parseShoutoutCodeAsync(code);
        setAuthorInfo(data);
        setLoading(false);
      };

      const timeout = setTimeout(fetchDetails, 100);
      return () => {
        clearTimeout(timeout);
        setLoading(false);
      };
    } else {
      // No fictionId found
      setAuthorInfo(basicInfo.fictionTitle ? basicInfo : null);
      setLoading(false);
    }
  }, [code, shoutout]);

  const handleSave = useCallback(() => {
    // Read directly from textarea ref like we do for preview
    const actualCode = textareaRef.current?.value || code;
    onSave?.({
      id: shoutout?.id,
      code: actualCode,
      expectedReturnDate: expectedReturn,
      schedules: schedules,
      ...authorInfo
    });
    onClose();
  }, [code, expectedReturn, authorInfo, shoutout, schedules, onSave, onClose]);

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
                  info={authorInfo}
                  loading={loading}
                  shoutout={shoutout}
                  schedules={shoutout?.schedules || []}
                  myFictions={myFictions}
                  onCheckSwap={handleCheckSwap}
                  checkingSwap={checkingSwap}
                  checkProgress={checkProgress}
                  swapResult={swapResult}
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
                  defaultValue={code}
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
          </div>

          <div class="rr-modal-author-panel">
            <AuthorInfo
              info={authorInfo}
              loading={loading}
              shoutout={shoutout}
              schedules={schedules}
              myFictions={myFictions}
              onCheckSwap={handleCheckSwap}
              checkingSwap={checkingSwap}
              checkProgress={checkProgress}
              swapResult={swapResult}
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

function AuthorInfo({ info, loading, shoutout, schedules = [], myFictions = [], onCheckSwap, checkingSwap, checkProgress, swapResult }) {
  if (loading) {
    return <div class="rr-author-empty">Loading...</div>;
  }

  if (!info || (!info.fictionTitle && !info.authorName)) {
    return <div class="rr-author-empty">Paste code to see author info</div>;
  }

  // Check both saved state AND fresh result from just-completed check
  const wePosted = shoutout?.schedules?.some(s => s.chapter); // We posted their shoutout
  const theyReturned = !!shoutout?.swappedDate || swapResult?.found;
  const lastScan = shoutout?.lastSwapScanDate;
  // Check if we just completed a scan (swapResult exists without error)
  const justScanned = swapResult !== null && !swapResult?.error;
  const foundChapter = shoutout?.swappedChapter || swapResult?.chapter;
  const foundChapterUrl = shoutout?.swappedChapterUrl || swapResult?.chapterUrl;

  // Determine swap state
  // SWAPPED = Us AND Them (both posted) - green
  // NOT FOUND = Us NOT Them AND scanned - red
  // NOT SCANNED = Us posted but not scanned - grey hourglass
  // SHOUTED = Them NOT Us - cyan
  // SCHEDULED = neither posted - orange
  const hasScanned = lastScan || justScanned;
  let swapState = 'SCHEDULED';

  if (wePosted && theyReturned) {
    swapState = 'SWAPPED';
  } else if (wePosted && !theyReturned && hasScanned) {
    swapState = 'NOT FOUND';
  } else if (wePosted && !theyReturned && !hasScanned) {
    swapState = 'NOT SCANNED';
  } else if (theyReturned) {
    swapState = 'SHOUTED';
  }
  // else stays SCHEDULED

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
      {info.fictionUrl && (
        <a href={info.fictionUrl} target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary rr-view-fiction-btn">
          View Fiction
        </a>
      )}

      {/* Scheduled for section - shows which of user's fictions this is scheduled on */}
      {schedules.length > 0 && (
        <div class="rr-scheduled-for-section">
          <div class="rr-scheduled-for-label">Scheduled for:</div>
          <div class="rr-scheduled-for-list">
            {schedules.map((sched, idx) => {
              const fiction = myFictions.find(f => String(f.fictionId) === String(sched.fictionId));
              const fictionTitle = fiction?.title || `Fiction #${sched.fictionId}`;
              const isArchived = !!sched.chapter;
              return (
                <div key={idx} class={`rr-scheduled-for-item ${isArchived ? 'rr-archived' : ''}`}>
                  <span class="rr-scheduled-fiction-title">{fictionTitle}</span>
                  {sched.date && <span class="rr-scheduled-date">{sched.date}</span>}
                  {!sched.date && <span class="rr-scheduled-date rr-unscheduled">Unscheduled</span>}
                  {isArchived && <i class="fa fa-check-circle rr-archived-icon" title="Archived"></i>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Swap Status Section - only in view mode when shoutout exists */}
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
          ) : swapState === 'SWAPPED' ? (
            <div class="rr-swap-badge rr-swap-badge-swapped">SWAPPED</div>
          ) : swapState === 'NOT FOUND' ? (
            <button
              class="rr-swap-badge rr-swap-badge-not-found rr-swap-badge-clickable"
              onClick={onCheckSwap}
              title="Click to check again"
            >
              NOT FOUND
            </button>
          ) : swapState === 'NOT SCANNED' ? (
            <button
              class="rr-swap-badge rr-swap-badge-not-scanned rr-swap-badge-clickable"
              onClick={onCheckSwap}
              title="Click to scan for their shoutout"
            >
              NOT SCANNED
            </button>
          ) : swapState === 'SHOUTED' ? (
            <button
              class="rr-swap-badge rr-swap-badge-shouted rr-swap-badge-clickable"
              onClick={onCheckSwap}
              title="Click to verify"
            >
              THEY SHOUTED YOU
            </button>
          ) : (
            <button
              class="rr-swap-badge rr-swap-badge-scheduled rr-swap-badge-clickable"
              onClick={onCheckSwap}
              title="Click to check if they shouted you"
            >
              SCHEDULED
            </button>
          )}
          {lastScan && !checkingSwap && swapState !== 'RETURNED' && (
            <div class="rr-swap-last-scan">Last scan: {lastScan}</div>
          )}
        </div>
      )}

      {/* Found in chapter info */}
      {foundChapter && (
        <div class="rr-swap-found">
          <div class="rr-swap-found-label">
            <i class="fa fa-check-circle"></i> Found in "{foundChapter}"
          </div>
          {foundChapterUrl && (
            <a href={foundChapterUrl} target="_blank" rel="noopener" class="rr-swap-view-link">
              <i class="fa fa-external-link"></i> View Chapter
            </a>
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
