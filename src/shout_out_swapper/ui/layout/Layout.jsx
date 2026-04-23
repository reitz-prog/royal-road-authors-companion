// Main scheduler layout - React version of v2's layout/core.js
// Same visual as v1/v2, React architecture

import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { log } from '../../../common/logging/core.js';
import { getSetting, setSetting } from '../../../common/settings/core.js';
import { Select, IconButton } from '../../../common/ui/components/index.jsx';
import { Calendar } from '../calendar/Calendar.jsx';
import { Contacts } from '../contacts/Contacts.jsx';
import { MyCodes } from '../contacts/MyCodes.jsx';
import { ContactModal } from '../contacts/ContactModal.jsx';
import { ShoutoutModal } from '../modal/ShoutoutModal.jsx';
import { MyCodeModal } from '../modal/MyCodeModal.jsx';
import { SettingsModal } from '../../../common/settings/ui/SettingsModal.jsx';
import { ExportImportModal } from '../export/ExportImportModal.jsx';
import * as db from '../../../common/db/proxy.js';
import { syncMyFictions } from '../../services/myFictions.js';
import { autoArchiveToday } from '../../services/scanner.js';

const logger = log.scope('layout');

// Detect current fiction from URL (e.g., /author-dashboard/dashboard/12345)
function detectCurrentFictionId() {
  const match = window.location.pathname.match(/\/author-dashboard\/dashboard\/(\d+)/);
  return match ? match[1] : null;
}

export function Layout({ routeType = 'main-dashboard' }) {
  // Use route-specific collapse setting so each page can be minimized independently
  const collapseKey = `schedulerCollapsed_${routeType === 'fiction-dashboard' ? 'fiction' : 'main'}`;
  const [collapsed, setCollapsed] = useState(() => getSetting(collapseKey) || false);
  const [contactsOpen, setContactsOpen] = useState(true);

  // Auto-detect fiction from URL, or null for "All"
  const [filterFictionId, setFilterFictionId] = useState(() => detectCurrentFictionId());

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [modalShoutout, setModalShoutout] = useState(null);
  const [modalMode, setModalMode] = useState('add');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportImportOpen, setExportImportOpen] = useState(false);

  // MyCode modal state
  const [myCodeModalOpen, setMyCodeModalOpen] = useState(false);
  const [editingMyCode, setEditingMyCode] = useState(null);

  // Contact modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);

  // Shoutouts state - loaded from IndexedDB
  const [shoutouts, setShoutouts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [myFictions, setMyFictions] = useState([]);
  const [myCodes, setMyCodes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Resizer ref
  const layoutRef = useRef(null);
  const calendarRef = useRef(null);
  const contactsRef = useRef(null);

  // Load data from IndexedDB on mount
  useEffect(() => {
    logger.info('Layout mounted, loading data from IndexedDB');
    loadData();

    // Sync user's fictions from dashboard DOM (async, non-blocking)
    syncMyFictions().then(async fictions => {
      setMyFictions(fictions || []);
      logger.info('MyFictions synced', { count: fictions?.length });

      // Auto-archive: check if any chapters were published today that match scheduled shoutouts
      try {
        const result = await autoArchiveToday();
        if (result.archived > 0) {
          logger.info('Auto-archived shoutouts', result);
          // Reload data to reflect archived shoutouts
          loadData();
        }
      } catch (err) {
        logger.warn('Auto-archive failed', err);
      }
    }).catch(err => {
      logger.warn('Could not sync myFictions', err);
    });

    // Listen for swap check or scan completion to re-run auto-archive and
    // reload data. A scan can publish today's chapter in the middle of a
    // session — without this, the user would have to refresh the page to
    // see today's scheduled shoutout moved into the archive.
    const handleMessage = async (message) => {
      if (message.type === 'swapCheckComplete') {
        logger.info('Swap check complete, reloading data');
        loadData();
      } else if (message.type === 'scanComplete') {
        logger.info('Scan complete, re-running auto-archive + reloading data');
        try {
          await autoArchiveToday();
        } catch (err) {
          logger.warn('Post-scan auto-archive failed', err);
        }
        loadData();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const loadData = async (resyncFictions = false) => {
    try {
      // If resync requested (after clear/import), re-sync myFictions from DOM first
      if (resyncFictions) {
        const synced = await syncMyFictions();
        setMyFictions(synced || []);
        logger.info('MyFictions re-synced after clear/import', { count: synced?.length });
      }

      const [loadedShoutouts, loadedContacts, loadedFictions, loadedMyFictions, loadedMyCodes] = await Promise.all([
        db.getAll('shoutouts'),
        db.getAll('contacts'),
        db.getAll('fictions'),
        resyncFictions ? Promise.resolve(null) : db.getAll('myFictions'),
        db.getAll('myCodes')
      ]);

      // Enrich contacts with fiction count and first fiction title
      const enrichedContacts = (loadedContacts || []).map(contact => {
        const contactFictions = (loadedFictions || []).filter(f => f.contactId === contact.id);
        return {
          ...contact,
          fictionCount: contactFictions.length,
          fictionTitle: contactFictions[0]?.fictionTitle || ''
        };
      });

      setShoutouts(loadedShoutouts || []);
      setContacts(enrichedContacts);
      // Sort myCodes by order field
      const sortedMyCodes = (loadedMyCodes || []).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      setMyCodes(sortedMyCodes);
      if (!resyncFictions) {
        setMyFictions(loadedMyFictions || []);
      }
      const sampleShoutouts = (loadedShoutouts || []).slice(0, 5).map(s => ({
        id: s.id,
        fictionTitle: s.fictionTitle,
        schedules: (s.schedules || []).map(sch => ({
          date: sch.date,
          dateType: typeof sch.date,
          fictionId: sch.fictionId,
          chapter: sch.chapter || null,
        })),
      }));
      logger.info(
        `Data loaded: shoutouts=${loadedShoutouts?.length} contacts=${enrichedContacts?.length} myFictions=${resyncFictions ? 'resynced' : loadedMyFictions?.length}`
      );
      logger.info(`Data loaded sampleShoutouts: ${JSON.stringify(sampleShoutouts)}`);
    } catch (err) {
      logger.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCollapse = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    setSetting(collapseKey, newState);
  };

  const handleDayClick = (date, dayShoutouts) => {
    logger.info('Day clicked', { date, count: dayShoutouts.length });
    if (dayShoutouts.length === 0) {
      setModalDate(date);
      setModalShoutout(null);
      setModalMode('add');
      setModalOpen(true);
    } else {
      const shoutout = dayShoutouts[0];
      // Check if this shoutout is archived for this date
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
    logger.info('Saving shoutout', data);

    try {
      // Auto-populate contact if we have author info
      let contactId = null;
      if (data.authorName) {
        // Check if contact exists
        const existingContacts = await db.getAll('contacts');
        let contact = existingContacts.find(c => c.authorName === data.authorName);

        if (!contact) {
          // Create new contact
          contactId = await db.save('contacts', {
            authorName: data.authorName,
            profileUrl: data.profileUrl || '',
            authorAvatar: data.authorAvatar || ''
          });
          logger.info('Created new contact', { contactId, authorName: data.authorName });
        } else {
          contactId = contact.id;
          // Update contact info if we have better data
          const needsUpdate = (data.profileUrl && !contact.profileUrl) ||
                              (data.authorAvatar && !contact.authorAvatar);
          if (needsUpdate) {
            await db.save('contacts', {
              ...contact,
              profileUrl: data.profileUrl || contact.profileUrl,
              authorAvatar: data.authorAvatar || contact.authorAvatar
            });
          }
        }

        // Auto-populate fiction if we have fiction info
        if (data.fictionId) {
          const existingFictions = await db.getAll('fictions');
          let fiction = existingFictions.find(f => String(f.fictionId) === String(data.fictionId));

          if (!fiction) {
            // Create new fiction linked to contact
            await db.save('fictions', {
              fictionId: data.fictionId,
              fictionTitle: data.fictionTitle || '',
              fictionUrl: data.fictionUrl || '',
              coverUrl: data.coverUrl || '',
              contactId: contactId
            });
            logger.info('Created new fiction', { fictionId: data.fictionId, contactId });
          } else {
            // Update fiction info if needed
            if (data.fictionTitle && fiction.fictionTitle !== data.fictionTitle) {
              await db.save('fictions', {
                ...fiction,
                fictionTitle: data.fictionTitle,
                fictionUrl: data.fictionUrl || fiction.fictionUrl,
                coverUrl: data.coverUrl || fiction.coverUrl
              });
            }
          }
        }
      }

      // Save shoutout with all cached data - no FK, just flat.
      // On CREATE, if schedules weren't supplied default to the modal's
      // date+fiction. On EDIT, trust whatever the user submitted — an
      // empty array means they explicitly removed every schedule to
      // unschedule the shoutout.
      const isEdit = !!data.id;
      const schedules = isEdit
        ? (data.schedules || [])
        : (data.schedules && data.schedules.length > 0
            ? data.schedules
            : [{ date: modalDate, fictionId: filterFictionId }]);

      const shoutoutData = {
        id: data.id,
        code: data.code,
        expectedReturnDate: data.expectedReturnDate || '',
        schedules,
        // Cached parsed data
        fictionId: data.fictionId || '',
        fictionTitle: data.fictionTitle || '',
        fictionUrl: data.fictionUrl || '',
        coverUrl: data.coverUrl || '',
        authorName: data.authorName || '',
        profileUrl: data.profileUrl || '',
        // Swap tracking fields (preserve existing)
        swappedDate: data.swappedDate || '',
        swappedChapter: data.swappedChapter || '',
        swappedChapterUrl: data.swappedChapterUrl || '',
        lastSwapScanDate: data.lastSwapScanDate || ''
      };

      const savedId = await db.save('shoutouts', shoutoutData);
      logger.info('Shoutout saved to IndexedDB', { id: savedId });

      // Update modalShoutout with the saved data so UI reflects changes
      const updatedShoutout = { ...shoutoutData, id: savedId };
      setModalShoutout(updatedShoutout);

      // Reload all data including contacts
      await loadData();
    } catch (err) {
      logger.error('Failed to save shoutout', err);
    }
  };

  const handleDelete = async (id) => {
    logger.info('Deleting shoutout', { id });

    try {
      await db.deleteById('shoutouts', id);
      setShoutouts(prev => prev.filter(s => s.id !== id));
      logger.info('Shoutout deleted from IndexedDB', { id });
    } catch (err) {
      logger.error('Failed to delete shoutout', err);
    }
  };

  // Helper: get next day as YYYY-MM-DD string (timezone-safe)
  const getNextDay = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  // Helper: build map of date -> shoutouts for cascading
  const buildShoutoutsByDate = () => {
    const map = new Map();
    shoutouts.forEach(s => {
      (s.schedules || []).forEach(sched => {
        if (filterFictionId && sched.fictionId !== filterFictionId) return;
        if (!map.has(sched.date)) map.set(sched.date, []);
        map.get(sched.date).push(s);
      });
    });
    return map;
  };

  // Helper: find the schedule that matches a date (considering filter)
  const findScheduleForDate = (schedules, date) => {
    return (schedules || []).findIndex(sched => {
      if (filterFictionId && sched.fictionId !== filterFictionId) return false;
      return sched.date === date;
    });
  };

  const handleShoutoutDrop = async (shoutoutId, newDate, action = 'move', existingShoutouts = [], sourceDate = null) => {
    logger.info('Shoutout dropped', { shoutoutId, newDate, action, sourceDate });

    try {
      // Find the dragged shoutout
      const shoutout = shoutouts.find(s => s.id === shoutoutId);
      if (!shoutout) {
        logger.error('Shoutout not found', { shoutoutId });
        return;
      }

      // Use sourceDate if provided, otherwise try to find the schedule
      let oldDate = sourceDate;
      let draggedSchedIdx = -1;

      if (sourceDate) {
        // Find schedule matching the source date
        draggedSchedIdx = findScheduleForDate(shoutout.schedules, sourceDate);
      } else {
        // Fallback: try to find the first non-archived schedule matching filter
        draggedSchedIdx = (shoutout.schedules || []).findIndex(sched => {
          if (filterFictionId && sched.fictionId !== filterFictionId) return false;
          return !sched.chapter; // Skip archived schedules
        });
        if (draggedSchedIdx >= 0) {
          oldDate = shoutout.schedules[draggedSchedIdx].date;
        }
      }

      // Check if trying to unschedule an archived item
      if (newDate === null && sourceDate) {
        const isArchived = shoutout.schedules?.some(sched =>
          sched.date === sourceDate && sched.chapter
        );
        if (isArchived) {
          logger.info('Cannot unschedule archived shoutout', { shoutoutId, sourceDate });
          return;
        }
      }

      switch (action) {
        case 'switch':
          // Swap dates: dragged gets new date, existing gets old date
          if (existingShoutouts.length > 0 && oldDate) {
            const existingShoutout = existingShoutouts[0];
            const existingSchedIdx = findScheduleForDate(existingShoutout.schedules, newDate);
            if (existingSchedIdx >= 0) {
              const updatedSchedules = [...existingShoutout.schedules];
              updatedSchedules[existingSchedIdx] = { ...updatedSchedules[existingSchedIdx], date: oldDate };
              await db.save('shoutouts', { ...existingShoutout, schedules: updatedSchedules });
            }
          }
          break;

        case 'shift':
          // Cascade shift: collect all shoutouts from target until empty slot
          const shoutoutsByDate = buildShoutoutsByDate();
          const toShift = [];
          const shiftedIds = new Set(); // Track already-collected shoutouts
          let currentDate = newDate;

          logger.info('Shift: starting cascade', { newDate, shoutoutId });

          // Collect dates to shift (max 100 to prevent infinite loop)
          for (let i = 0; i < 100; i++) {
            const atDate = shoutoutsByDate.get(currentDate) || [];
            // Find first shoutout at this date that isn't the dragged one AND hasn't been shifted already
            const toMove = atDate.find(s => s.id !== shoutoutId && !shiftedIds.has(s.id));
            if (toMove) {
              logger.info('Shift: will move', { id: toMove.id, from: currentDate, to: getNextDay(currentDate) });
              toShift.push({ shoutoutId: toMove.id, fromDate: currentDate, toDate: getNextDay(currentDate) });
              shiftedIds.add(toMove.id);
              currentDate = getNextDay(currentDate);
            } else {
              logger.info('Shift: empty slot found at', { currentDate });
              break; // Empty slot found
            }
          }

          logger.info('Shift: collected', { count: toShift.length });

          // Save shifts in reverse order (last first to avoid conflicts)
          for (let i = toShift.length - 1; i >= 0; i--) {
            const { shoutoutId: sid, fromDate, toDate } = toShift[i];
            // Get fresh data from current shoutouts state
            const fresh = shoutouts.find(s => s.id === sid);
            if (!fresh) {
              logger.error('Shift: shoutout not found', { sid });
              continue;
            }

            logger.info('Shift: before', { id: sid, schedules: JSON.stringify(fresh.schedules) });

            // Update schedule matching fromDate
            const updatedSchedules = (fresh.schedules || []).map(sched =>
              sched.date === fromDate ? { ...sched, date: toDate } : sched
            );

            logger.info('Shift: after', { id: sid, schedules: JSON.stringify(updatedSchedules) });

            const result = await db.save('shoutouts', { ...fresh, schedules: updatedSchedules });
            logger.info('Shift: saved', { id: sid, result });
          }
          break;

        case 'stack':
          // Both on same date - nothing to do with existing
          break;

        case 'move':
        default:
          // Just move to new date
          break;
      }

      // Update the dragged shoutout's schedule
      let newSchedules = [...(shoutout.schedules || [])];
      const schedIdx = findScheduleForDate(newSchedules, oldDate);
      if (schedIdx >= 0) {
        newSchedules[schedIdx] = { ...newSchedules[schedIdx], date: newDate };
      } else if (newSchedules.length > 0) {
        newSchedules[0] = { ...newSchedules[0], date: newDate };
      } else {
        newSchedules = [{ date: newDate, fictionId: filterFictionId }];
      }

      await db.save('shoutouts', { ...shoutout, schedules: newSchedules });
      logger.info('Shoutout schedule updated', { shoutoutId, newDate, action });

      // Reload data
      await loadData();
    } catch (err) {
      logger.error('Failed to update shoutout schedule', err);
    }
  };

  // Handle reordering shoutouts within a day
  const handleReorder = async (date, newOrder) => {
    try {
      for (const { shoutoutId, order } of newOrder) {
        const shoutout = shoutouts.find(s => s.id === shoutoutId);
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

  // Sync contacts height with calendar
  useEffect(() => {
    const syncHeights = () => {
      // Use double RAF + setTimeout to ensure DOM is fully updated after transitions
      setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const calendar = calendarRef.current;
            const contacts = contactsRef.current;
            if (!calendar || !contacts || !contactsOpen) return;

            const calendarHeight = calendar.offsetHeight;
            if (calendarHeight > 0) {
              contacts.style.height = `${calendarHeight}px`;
            }
          });
        });
      }, 50);
    };

    // Sync on mount and when data changes
    syncHeights();

    // Also sync on window resize
    window.addEventListener('resize', syncHeights);

    // Use ResizeObserver for size changes
    let resizeObserver;
    if (window.ResizeObserver && calendarRef.current) {
      resizeObserver = new ResizeObserver(syncHeights);
      resizeObserver.observe(calendarRef.current);
    }

    // Use MutationObserver to detect DOM changes (like unscheduled toggle)
    let mutationObserver;
    if (window.MutationObserver && calendarRef.current) {
      mutationObserver = new MutationObserver(syncHeights);
      mutationObserver.observe(calendarRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }

    return () => {
      window.removeEventListener('resize', syncHeights);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [contactsOpen, shoutouts, loading]);

  // Resizer logic
  useEffect(() => {
    const layout = layoutRef.current;
    const calendarPane = calendarRef.current;
    if (!layout || !calendarPane) return;

    const resizer = layout.querySelector('.rr-scheduler-resizer');
    if (!resizer) return;

    let isResizing = false;

    const onMouseDown = () => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e) => {
      if (!isResizing) return;
      const layoutRect = layout.getBoundingClientRect();
      const newWidth = e.clientX - layoutRect.left;
      const minWidth = 400;
      const maxWidth = layoutRect.width - 200;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        calendarPane.style.flex = `0 0 ${newWidth}px`;
      }
    };

    const onMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    resizer.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      resizer.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <>
      <div class={`rr-scheduler card card-custom gutter-b ${collapsed ? 'rr-collapsed' : ''}`}>
        <div class="card-header">
          <div class="card-title">
            <span class="card-icon">
              <i class="fa fa-calendar"></i>
            </span>
            <span class="card-label">Shoutout Swap Scheduler</span>
          </div>
          <div class="card-toolbar">
            <Select
              size="sm"
              value={filterFictionId || ''}
              onChange={(e) => setFilterFictionId(e.target.value || null)}
            >
              <option value="">All Fictions</option>
              {myFictions.map(f => (
                <option key={f.fictionId} value={f.fictionId}>
                  {f.title || `Fiction ${f.fictionId}`}
                </option>
              ))}
            </Select>
            {!contactsOpen && (
              <IconButton
                icon="fa-address-book"
                title="Show contacts"
                onClick={() => setContactsOpen(true)}
              />
            )}
            <IconButton icon="fa-cog" title="Settings" onClick={() => setSettingsOpen(true)} />
            <button
              class="btn btn-sm btn-icon btn-light rr-collapse-toggle"
              title={collapsed ? 'Expand' : 'Minimize'}
              onClick={toggleCollapse}
            >
              <i class={`fa fa-chevron-${collapsed ? 'down' : 'up'}`}></i>
            </button>
          </div>
        </div>

        <div class="card-body rr-collapsible-body" style={{ display: collapsed ? 'none' : 'block' }}>
          <div class={`rr-scheduler-layout ${!contactsOpen ? 'rr-scheduler-no-contacts' : ''}`} ref={layoutRef}>
            <div class="rr-scheduler-calendar" ref={calendarRef}>
              <Calendar
                shoutouts={shoutouts}
                filterFictionId={filterFictionId}
                myFictions={myFictions}
                onDayClick={handleDayClick}
                onShoutoutClick={handleShoutoutClick}
                onShoutoutDrop={handleShoutoutDrop}
                onReorder={handleReorder}
                onScanComplete={() => loadData()}
                onDeleteShoutout={handleDelete}
              />
            </div>
            <div class="rr-scheduler-resizer"></div>
            <div class="rr-scheduler-contacts" ref={contactsRef}>
              <div class="rr-contacts-toolbar">
                <button class="btn btn-sm btn-light rr-export-btn" title="Export / Import" onClick={() => setExportImportOpen(true)}>
                  <i class="fa fa-file-excel"></i> Export / Import
                </button>
              </div>
              <MyCodes
                myCodes={myCodes}
                myFictions={myFictions}
                onMyCodeAdd={() => {
                  setEditingMyCode(null);
                  setMyCodeModalOpen(true);
                }}
                onMyCodeEdit={(id) => {
                  const code = myCodes.find(c => c.id === id);
                  setEditingMyCode(code || null);
                  setMyCodeModalOpen(true);
                }}
                onMyCodeCopy={(code) => logger.info('My code copied', { id: code.id })}
                onMyCodeDelete={async (id) => {
                  await db.deleteById('myCodes', id);
                  await loadData();
                }}
                onMyCodeReorder={async (newOrder) => {
                  // Save new order to each code
                  for (let i = 0; i < newOrder.length; i++) {
                    const code = newOrder[i];
                    await db.save('myCodes', { ...code, order: i });
                  }
                  setMyCodes(newOrder);
                }}
              />
              <Contacts
                contacts={contacts}
                shoutouts={shoutouts}
                onClose={() => setContactsOpen(false)}
                onContactClick={(authorName) => {
                  // Find contact by authorName and open modal
                  const contact = contacts.find(c => c.authorName === authorName);
                  if (contact) {
                    setSelectedContact(contact);
                    setContactModalOpen(true);
                  }
                }}
                onUpcomingClick={(shoutoutId, date) => {
                  // Open contact profile modal for this author
                  const shoutout = shoutouts.find(s => s.id === shoutoutId);
                  if (shoutout?.authorName) {
                    const contact = contacts.find(c => c.authorName === shoutout.authorName);
                    if (contact) {
                      setSelectedContact(contact);
                      setContactModalOpen(true);
                    } else {
                      // Create a temporary contact from shoutout data
                      setSelectedContact({
                        authorName: shoutout.authorName,
                        authorAvatar: shoutout.authorAvatar,
                        profileUrl: shoutout.profileUrl
                      });
                      setContactModalOpen(true);
                    }
                  }
                }}
                onContactDelete={async (id) => {
                  await db.deleteById('contacts', id);
                  await loadData();
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <ShoutoutModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        onReload={() => loadData()}
        date={modalDate}
        shoutout={modalShoutout}
        mode={modalMode}
        myFictions={myFictions}
        currentFictionId={filterFictionId}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onClearAll={() => loadData(true)}
      />

      <ExportImportModal
        isOpen={exportImportOpen}
        onClose={() => setExportImportOpen(false)}
        onComplete={() => loadData(true)}
        currentFictionId={filterFictionId}
      />

      <MyCodeModal
        isOpen={myCodeModalOpen}
        onClose={() => {
          setMyCodeModalOpen(false);
          setEditingMyCode(null);
        }}
        onSave={async (data) => {
          try {
            await db.save('myCodes', data);
            logger.info('MyCode saved', { id: data.id, name: data.name });
            await loadData();
          } catch (err) {
            logger.error('Failed to save myCode', err);
          }
        }}
        onDelete={async (id) => {
          try {
            await db.deleteById('myCodes', id);
            logger.info('MyCode deleted', { id });
            await loadData();
          } catch (err) {
            logger.error('Failed to delete myCode', err);
          }
        }}
        myCode={editingMyCode}
        myFictions={myFictions}
      />

      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => {
          setContactModalOpen(false);
          setSelectedContact(null);
        }}
        contact={selectedContact}
        onSave={async (updatedContact) => {
          await loadData();
          setSelectedContact(updatedContact);
        }}
      />
    </>
  );
}

export default Layout;
