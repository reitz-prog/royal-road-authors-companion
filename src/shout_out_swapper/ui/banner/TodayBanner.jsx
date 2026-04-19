// Today Banner - Shows today's scheduled shoutouts on chapter edit pages
// Calendar button opens calendar overlay (no contacts)

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { log } from '../../../common/logging/core.js';
import { getSetting, setSetting } from '../../../common/settings/core.js';
import { Overlay } from '../../../common/ui/overlay/Overlay.jsx';
import { Calendar } from '../calendar/Calendar.jsx';
import { ShoutoutModal } from '../modal/ShoutoutModal.jsx';
import * as db from '../../../common/db/proxy.js';

const logger = log.scope('banner');

// Format date as "Mon DD" (e.g., "Apr 19")
function formatDateShort(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get today's date as YYYY-MM-DD
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Get scheduled release date from form, or today if not scheduled
function getPublishDate() {
  const form = document.getElementById('chapterEditor');
  if (!form) return getToday();

  const formData = new FormData(form);
  const scheduledRelease = formData.get('ScheduledRelease') || '';

  if (scheduledRelease) {
    // Format is like "2024-04-19 12:00" - extract just the date
    const datePart = scheduledRelease.split(' ')[0];
    if (datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return datePart;
    }
  }

  return getToday();
}

// Extract fiction ID from URL path
function extractFictionIdFromPath() {
  const path = window.location.pathname;
  // Match patterns like /author-dashboard/chapters/new/12345
  const match = path.match(/\/author-dashboard\/chapters\/(?:new|edit|editdraft)\/(\d+)/);
  return match ? match[1] : null;
}

export function TodayBanner() {
  const [minimized, setMinimized] = useState(() => getSetting('bannerMinimized') || false);
  const [todayShoutouts, setTodayShoutouts] = useState([]);
  const [allShoutouts, setAllShoutouts] = useState([]);
  const [myFictions, setMyFictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [insertingId, setInsertingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [targetDate, setTargetDate] = useState(getToday());

  // Calendar overlay state
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Shoutout modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalShoutout, setModalShoutout] = useState(null);
  const [modalDate, setModalDate] = useState(null);
  const [modalMode, setModalMode] = useState('edit');

  const today = getToday();
  const fictionId = extractFictionIdFromPath();

  // Load data and check for scheduled release date
  useEffect(() => {
    loadData();

    // Watch for changes to ScheduledRelease field
    const checkScheduledDate = () => {
      const newDate = getPublishDate();
      setTargetDate(prev => {
        if (prev !== newDate) {
          logger.info('Publish date changed', { from: prev, to: newDate });
          return newDate;
        }
        return prev;
      });
    };

    // Check initially after a delay (form might not be ready)
    const initialCheck = setTimeout(checkScheduledDate, 500);

    // Also listen for changes on the form
    const form = document.getElementById('chapterEditor');
    if (form) {
      form.addEventListener('change', checkScheduledDate);
    }

    return () => {
      clearTimeout(initialCheck);
      if (form) {
        form.removeEventListener('change', checkScheduledDate);
      }
    };
  }, []);

  // Reload shoutouts when target date changes
  useEffect(() => {
    if (!loading) {
      loadData();
    }
  }, [targetDate]);

  const loadData = async () => {
    try {
      const [shoutouts, fictions] = await Promise.all([
        db.getAll('shoutouts'),
        db.getAll('myFictions')
      ]);

      setAllShoutouts(shoutouts || []);
      setMyFictions(fictions || []);

      // Get the publish date (scheduled or today)
      const publishDate = getPublishDate();
      setTargetDate(publishDate);

      // Filter shoutouts scheduled for the publish date AND this fiction
      const filtered = (shoutouts || []).filter(shoutout => {
        const schedules = shoutout.schedules || [];
        return schedules.some(s => {
          const matchesDate = s.date === publishDate;
          const matchesFiction = !fictionId || s.fictionId === fictionId;
          const notArchived = !s.chapter;
          return matchesDate && matchesFiction && notArchived;
        });
      });

      setTodayShoutouts(filtered);
      logger.info('Data loaded', { targetDate: publishDate, count: filtered.length, total: shoutouts?.length });
    } catch (err) {
      logger.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleMinimize = () => {
    const newState = !minimized;
    setMinimized(newState);
    setSetting('bannerMinimized', newState);
  };

  // Helper to get editor elements for a field
  const getEditorElements = (fieldId) => {
    const formField = document.getElementById(fieldId);
    if (!formField) return null;

    const parentDiv = formField.parentElement;
    const rxContainer = parentDiv?.querySelector('.rx-container');
    const rxEditor = rxContainer?.querySelector('.rx-editor[contenteditable="true"]');
    const rxSource = rxContainer?.querySelector('textarea.rx-source');

    return { formField, rxContainer, rxEditor, rxSource };
  };

  // Helper to check if code exists in an editor
  const codeExistsIn = (elements, code) => {
    if (!elements || !code) return false;
    const html = elements.rxEditor?.innerHTML || '';
    const value = elements.formField?.value || '';
    // Check if the code (or a significant part of it) exists
    return html.includes(code) || value.includes(code);
  };

  // Helper to remove code from an editor
  const removeCodeFrom = (elements, code) => {
    if (!elements) return;

    const { formField, rxEditor, rxSource } = elements;

    // Remove from visual editor
    if (rxEditor) {
      let html = rxEditor.innerHTML || '';
      // Remove the code and any surrounding <br> tags
      html = html.replace(code, '');
      html = html.replace(/<br\s*\/?>\s*<br\s*\/?>\s*$/i, '');
      html = html.replace(/^\s*<br\s*\/?>\s*<br\s*\/?>/i, '');
      html = html.replace(/<br\s*\/?>\s*<br\s*\/?>\s*<br\s*\/?>\s*<br\s*\/?>/gi, '<br><br>');
      rxEditor.innerHTML = html.trim() || '<p data-rx-type="text" contenteditable="true" data-rx-first-level="true"></p>';

      if (!html.trim()) {
        rxEditor.classList.add('rx-empty', 'rx-placeholder');
      }
    }

    // Remove from form field
    if (formField) {
      let value = formField.value || '';
      value = value.replace(code, '');
      value = value.replace(/\n\n\s*$/g, '');
      value = value.replace(/^\s*\n\n/g, '');
      value = value.replace(/\n\n\n\n/g, '\n\n');
      formField.value = value.trim();
    }

    // Remove from rx-source
    if (rxSource) {
      let value = rxSource.value || '';
      value = value.replace(code, '');
      value = value.replace(/\n\n\s*$/g, '');
      value = value.replace(/^\s*\n\n/g, '');
      value = value.replace(/\n\n\n\n/g, '\n\n');
      rxSource.value = value.trim();
    }

    // Trigger events
    rxEditor?.dispatchEvent(new Event('input', { bubbles: true }));
    formField?.dispatchEvent(new Event('input', { bubbles: true }));
    rxSource?.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Helper to add code to an editor
  const addCodeTo = (elements, code) => {
    if (!elements) return;

    const { formField, rxEditor, rxSource } = elements;

    // Add to visual editor
    if (rxEditor) {
      const currentHtml = rxEditor.innerHTML || '';
      const isEmpty = !currentHtml.trim() ||
                      currentHtml === '<p><br></p>' ||
                      currentHtml === '<p></p>' ||
                      /^<p[^>]*><\/p>$/.test(currentHtml);

      rxEditor.innerHTML = isEmpty ? code : currentHtml + '<br><br>' + code;
      rxEditor.classList.remove('rx-empty', 'rx-placeholder');
    }

    // Add to form field
    if (formField) {
      const currentValue = formField.value || '';
      formField.value = !currentValue.trim() ? code : currentValue + '\n\n' + code;
    }

    // Add to rx-source
    if (rxSource) {
      const currentSource = rxSource.value || '';
      rxSource.value = !currentSource.trim() ? code : currentSource + '\n\n' + code;
    }

    // Trigger events
    rxEditor?.dispatchEvent(new Event('input', { bubbles: true }));
    formField?.dispatchEvent(new Event('input', { bubbles: true }));
    rxSource?.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Copy shoutout code to clipboard
  const copyToClipboard = async (shoutout) => {
    try {
      await navigator.clipboard.writeText(shoutout.code || '');
      setCopiedId(shoutout.id);
      setTimeout(() => setCopiedId(null), 1500);
      logger.info('Copied to clipboard', { id: shoutout.id });
    } catch (err) {
      logger.error('Failed to copy', err);
    }
  };

  // Insert shoutout into author notes
  // If already in target, do nothing. If in other field, switch it.
  const insertShoutout = async (shoutout, placement) => {
    setInsertingId(shoutout.id);

    try {
      const code = shoutout.code || '';
      const targetField = placement === 'pre' ? 'PreAuthorNotes' : 'PostAuthorNotes';
      const otherField = placement === 'pre' ? 'PostAuthorNotes' : 'PreAuthorNotes';

      const targetElements = getEditorElements(targetField);
      const otherElements = getEditorElements(otherField);

      if (!targetElements?.rxEditor) {
        logger.warn('Could not find target editor', { targetField });
        return;
      }

      // Check if already in target - do nothing
      if (codeExistsIn(targetElements, code)) {
        logger.info('Code already in target, skipping', { placement });
        return;
      }

      // Check if in other field - remove it (switch)
      if (codeExistsIn(otherElements, code)) {
        logger.info('Switching from other field', { from: otherField, to: targetField });
        removeCodeFrom(otherElements, code);
      }

      // Add to target
      addCodeTo(targetElements, code);
      logger.info('Shoutout inserted successfully', { id: shoutout.id, placement });

    } catch (err) {
      logger.error('Failed to insert shoutout', err);
    } finally {
      setInsertingId(null);
    }
  };

  // Calendar handlers
  const handleDayClick = (date, dayShoutouts) => {
    if (dayShoutouts.length === 0) {
      setModalDate(date);
      setModalShoutout(null);
      setModalMode('add');
      setModalOpen(true);
    } else {
      const shoutout = dayShoutouts[0];
      const isArchived = shoutout.schedules?.some(s => s.date === date && s.chapter);
      setModalDate(date);
      setModalShoutout(shoutout);
      setModalMode(isArchived ? 'view' : 'edit');
      setModalOpen(true);
    }
  };

  const handleShoutoutClick = (shoutout, date, mode = 'edit') => {
    setModalDate(date);
    setModalShoutout(shoutout);
    setModalMode(mode);
    setModalOpen(true);
  };

  const handleSave = async (data) => {
    try {
      const shoutoutData = {
        id: data.id,
        code: data.code,
        expectedReturnDate: data.expectedReturnDate || '',
        schedules: data.schedules || [{ date: modalDate, fictionId }],
        fictionId: data.fictionId || '',
        fictionTitle: data.fictionTitle || '',
        fictionUrl: data.fictionUrl || '',
        coverUrl: data.coverUrl || '',
        authorName: data.authorName || '',
        profileUrl: data.profileUrl || '',
        swappedDate: data.swappedDate || '',
        swappedChapter: data.swappedChapter || '',
        swappedChapterUrl: data.swappedChapterUrl || '',
        lastSwapScanDate: data.lastSwapScanDate || ''
      };

      await db.save('shoutouts', shoutoutData);
      await loadData();
    } catch (err) {
      logger.error('Failed to save shoutout', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await db.deleteById('shoutouts', id);
      await loadData();
      setModalOpen(false);
    } catch (err) {
      logger.error('Failed to delete shoutout', err);
    }
  };

  // Handle reordering shoutouts within a day
  const handleReorder = async (date, newOrder) => {
    try {
      for (const { shoutoutId, order } of newOrder) {
        const shoutout = allShoutouts.find(s => s.id === shoutoutId);
        if (!shoutout) continue;

        // Update the order for the matching schedule
        const schedules = (shoutout.schedules || []).map(sch => {
          if (sch.date === date && !sch.chapter) {
            return { ...sch, order };
          }
          return sch;
        });

        await db.save('shoutouts', { ...shoutout, schedules });
      }
      await loadData();
      logger.info('Reordered shoutouts', { date, newOrder });
    } catch (err) {
      logger.error('Failed to reorder shoutouts', err);
    }
  };

  // Handle dropping shoutout to a new date (or null for unscheduled)
  const handleShoutoutDrop = async (shoutoutId, newDate, action = 'move') => {
    try {
      // Ensure numeric comparison
      const numId = typeof shoutoutId === 'string' ? parseInt(shoutoutId) : shoutoutId;
      const shoutout = allShoutouts.find(s => s.id === numId);

      if (!shoutout) {
        logger.error('Shoutout not found for drop', { shoutoutId, numId, allCount: allShoutouts.length });
        return;
      }

      logger.info('Found shoutout for drop', { id: shoutout.id, schedules: shoutout.schedules });

      let schedules = [...(shoutout.schedules || [])];

      if (newDate === null) {
        // Moving to unscheduled - set date to null but keep the schedule
        schedules = schedules.map(s => {
          if (s.fictionId === fictionId && !s.chapter) {
            return { ...s, date: null };
          }
          return s;
        });
        logger.info('Moving to unscheduled', { shoutoutId });
      } else {
        // Find existing schedule for this fiction or create new
        const existingIdx = schedules.findIndex(s =>
          s.fictionId === fictionId && !s.chapter
        );

        if (existingIdx >= 0) {
          schedules[existingIdx] = { ...schedules[existingIdx], date: newDate };
        } else {
          schedules.push({ fictionId, date: newDate });
        }
        logger.info('Moving to date', { shoutoutId, newDate });
      }

      await db.save('shoutouts', { ...shoutout, schedules });
      await loadData();
    } catch (err) {
      logger.error('Failed to drop shoutout', err);
    }
  };

  return (
    <>
      <div class="rr-today-banner card card-custom gutter-b">
        <div class={`rr-today-banner-content ${todayShoutouts.length > 0 ? 'rr-today-banner-has-shoutout' : ''}`}>
          {/* Header */}
          <div class="rr-today-banner-header">
            <div class="rr-today-banner-header-left">
              <i class="fa fa-bullhorn"></i>
              <span>
                {loading ? 'Loading...' : (
                  todayShoutouts.length > 0
                    ? `Shoutout${todayShoutouts.length > 1 ? 's' : ''} for ${formatDateShort(targetDate)}${targetDate !== today ? ' (scheduled)' : ''}`
                    : `No shoutouts for ${formatDateShort(targetDate)}${targetDate !== today ? ' (scheduled)' : ''}`
                )}
              </span>
            </div>
            <div class="rr-today-banner-header-actions">
              <button
                class="btn btn-sm btn-icon btn-light rr-today-banner-calendar"
                title="View Calendar"
                onClick={() => setCalendarOpen(true)}
              >
                <i class="fa fa-calendar"></i>
              </button>
              <button
                class="btn btn-sm btn-icon btn-light rr-today-banner-minimize"
                title={minimized ? 'Expand' : 'Minimize'}
                onClick={toggleMinimize}
              >
                <i class={`fa fa-chevron-${minimized ? 'down' : 'up'}`}></i>
              </button>
            </div>
          </div>

          {/* Shoutouts list */}
          {!minimized && todayShoutouts.length > 0 && (
            <div class="rr-today-banner-shoutouts">
              {todayShoutouts.map(shoutout => (
                <div key={shoutout.id} class="rr-today-banner-shoutout" data-shoutout-id={shoutout.id}>
                  {/* Book cover with spine effect */}
                  <div class="rr-today-banner-book">
                    <div class="rr-today-banner-book-spine"></div>
                    {shoutout.coverUrl ? (
                      <img
                        src={shoutout.coverUrl}
                        class="rr-today-banner-cover"
                        alt={shoutout.fictionTitle || 'Cover'}
                      />
                    ) : (
                      <div class="rr-today-banner-cover rr-today-banner-cover-placeholder">
                        <i class="fa fa-book"></i>
                      </div>
                    )}
                  </div>

                  {/* Info section */}
                  <div class="rr-today-banner-info">
                    <div class="rr-today-banner-title">
                      {shoutout.fictionTitle || 'Unknown Fiction'}
                    </div>
                    <div class="rr-today-banner-author">
                      by {shoutout.authorName || 'Unknown Author'}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div class="rr-today-banner-actions">
                    <button
                      class="btn btn-sm btn-light rr-banner-edit"
                      title="Edit Shoutout"
                      onClick={() => handleShoutoutClick(shoutout, targetDate, 'edit')}
                    >
                      <i class="fa fa-edit"></i>
                    </button>
                    <button
                      class={`btn btn-sm btn-light rr-banner-copy ${copiedId === shoutout.id ? 'btn-success' : ''}`}
                      title="Copy Code to Clipboard"
                      onClick={() => copyToClipboard(shoutout)}
                    >
                      <i class={`fa ${copiedId === shoutout.id ? 'fa-check' : 'fa-copy'}`}></i>
                    </button>
                    <button
                      class="btn btn-sm btn-light-primary rr-banner-insert-pre"
                      title="Insert to Pre-Chapter Author Note"
                      onClick={() => insertShoutout(shoutout, 'pre')}
                      disabled={insertingId === shoutout.id}
                    >
                      {insertingId === shoutout.id ? (
                        <i class="fa fa-spinner fa-spin"></i>
                      ) : (
                        <>
                          <i class="fa fa-arrow-up"></i>
                          <span>Pre</span>
                        </>
                      )}
                    </button>
                    <button
                      class="btn btn-sm btn-light-primary rr-banner-insert-post"
                      title="Insert to Post-Chapter Author Note"
                      onClick={() => insertShoutout(shoutout, 'post')}
                      disabled={insertingId === shoutout.id}
                    >
                      {insertingId === shoutout.id ? (
                        <i class="fa fa-spinner fa-spin"></i>
                      ) : (
                        <>
                          <i class="fa fa-arrow-down"></i>
                          <span>Post</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Calendar Overlay - just calendar, no contacts */}
      <Overlay isOpen={calendarOpen} onClose={() => setCalendarOpen(false)}>
        <div class="rr-calendar-overlay card card-custom">
          <div class="card-header">
            <div class="card-title">
              <span class="card-icon"><i class="fa fa-calendar"></i></span>
              <span class="card-label">Shoutout Calendar</span>
            </div>
            <div class="card-toolbar">
              <button
                class="btn btn-sm btn-icon btn-light"
                title="Close"
                onClick={() => setCalendarOpen(false)}
              >
                <i class="fa fa-times"></i>
              </button>
            </div>
          </div>
          <div class="card-body">
            <Calendar
              shoutouts={allShoutouts}
              filterFictionId={fictionId}
              myFictions={myFictions}
              onDayClick={handleDayClick}
              onShoutoutClick={handleShoutoutClick}
              onShoutoutDrop={handleShoutoutDrop}
              onReorder={handleReorder}
              onScanComplete={() => loadData()}
            />
          </div>
        </div>
      </Overlay>

      {/* Shoutout Modal */}
      <ShoutoutModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        date={modalDate}
        shoutout={modalShoutout}
        mode={modalMode}
        myFictions={myFictions}
        currentFictionId={fictionId}
      />
    </>
  );
}

export default TodayBanner;
