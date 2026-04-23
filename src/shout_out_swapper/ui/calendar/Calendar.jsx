// Calendar component - React version of v2's calendar/core.js
import { h } from 'preact';
import { useState, useMemo, useEffect, useRef, useCallback } from 'preact/hooks';
import { log } from '../../../common/logging/core.js';
import { normalizeDate } from '../../../common/utils/date.js';
import { CalendarCard } from './CalendarCard.jsx';
import { DropMenu } from './DropMenu.jsx';
import { DayStackPopover } from './DayStackPopover.jsx';
import { DangerConfirmDialog } from '../../../common/ui/dialog/Dialog.jsx';
import { startFullScan, getScanState, onScanProgress, getSwapCheckState, checkAllSwaps, cancelCheckAllSwaps, cancelScan } from '../../services/scanner.js';
import { getImportState, cancelImport } from '../../services/exportImport.js';
import { ScannerModal } from '../scanner/ScannerModal.jsx';

const logger = log.scope('calendar');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDaysInMonth(month, year) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(month, year) {
  return new Date(year, month, 1).getDay();
}

export function Calendar({ shoutouts = [], filterFictionId, myFictions = [], onDayClick, onShoutoutClick, onShoutoutDrop, onReorder, onScanComplete, onDeleteShoutout }) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [currentView, setCurrentView] = useState('calendar'); // 'calendar' | 'archive'
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [dragOverUnscheduled, setDragOverUnscheduled] = useState(false);
  const dragOverTimeoutRef = useRef(null);
  const [dropMenu, setDropMenu] = useState({ isOpen: false, position: { x: 0, y: 0 }, shoutoutId: null, targetDate: null, existingShoutouts: [] });
  const [stackPopover, setStackPopover] = useState({ isOpen: false, date: null, shoutouts: [], position: { x: 0, y: 0 } });

  // Scanner state
  const [scanFictionId, setScanFictionId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const pollIntervalRef = useRef(null);
  const cleanupListenerRef = useRef(null);

  // Swap check states - map of shoutoutId -> checkState
  const [swapCheckStates, setSwapCheckStates] = useState({});
  const swapCheckPollRef = useRef(null);

  // Check all swaps state
  const [checkingAllSwaps, setCheckingAllSwaps] = useState(false);
  const [checkAllProgress, setCheckAllProgress] = useState(null); // { current, total, authorName }

  // Import progress state
  const [importProgress, setImportProgress] = useState(null);
  const importPollRef = useRef(null);

  // Untrack confirm dialog state
  const [untrackConfirm, setUntrackConfirm] = useState({ isOpen: false, shoutout: null });

  // Archive search state
  const [archiveSearch, setArchiveSearch] = useState('');

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(y => y - 1);
    } else {
      setMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(y => y + 1);
    } else {
      setMonth(m => m + 1);
    }
  };

  const goToToday = () => {
    const now = new Date();
    setMonth(now.getMonth());
    setYear(now.getFullYear());
  };

  // Group shoutouts by date — normalize whatever's in storage so legacy
  // entries with broken date strings (e.g. Date-stringified Excel cells)
  // still group under a usable YYYY-MM-DD key.
  const shoutoutsByDate = useMemo(() => {
    const map = new Map();
    let totalSchedules = 0;
    let normalized = 0;
    let dropped = 0;
    let filteredOut = 0;
    const rawSamples = [];
    shoutouts.forEach(s => {
      s.schedules?.forEach(sched => {
        totalSchedules++;
        if (filterFictionId && sched.fictionId !== filterFictionId) {
          filteredOut++;
          return;
        }
        const key = normalizeDate(sched.date);
        if (rawSamples.length < 5) {
          rawSamples.push({
            shoutoutId: s.id,
            rawDate: sched.date,
            rawType: typeof sched.date,
            normalizedKey: key,
            fictionId: sched.fictionId,
            chapter: sched.chapter || null,
          });
        }
        if (!key) {
          dropped++;
          return;
        }
        normalized++;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(s);
      });
    });
    logger.info(
      `Calendar grouping: shoutoutCount=${shoutouts.length} totalSchedules=${totalSchedules} normalized=${normalized} dropped=${dropped} filteredOut=${filteredOut} mapSize=${map.size} filterFictionId=${filterFictionId}`
    );
    logger.info(`Calendar grouping rawSamples: ${JSON.stringify(rawSamples)}`);
    logger.info(`Calendar grouping mapKeys: ${JSON.stringify(Array.from(map.keys()).slice(0, 20))}`);
    return map;
  }, [shoutouts, filterFictionId]);

  // Get unscheduled shoutouts (no schedules, empty schedules, or all schedules have null dates)
  const unscheduledShoutouts = useMemo(() => {
    return shoutouts.filter(s => {
      if (!s.schedules || s.schedules.length === 0) return true;
      // Also include if all non-archived schedules have null dates
      const activeSchedules = s.schedules.filter(sch => !sch.chapter);
      if (activeSchedules.length === 0) return false; // All archived, not unscheduled
      return activeSchedules.every(sch => !sch.date);
    });
  }, [shoutouts]);

  // Get archived shoutouts (have at least one schedule with chapter set)
  // Filter by filterFictionId (main fiction dropdown / URL scope) and search query
  const archivedShoutouts = useMemo(() => {
    const query = archiveSearch.toLowerCase().trim();
    return shoutouts
      .filter(s => s.schedules?.some(sched => sched.chapter))
      .map(s => ({
        ...s,
        archivedSchedules: s.schedules?.filter(sched =>
          sched.chapter && (!filterFictionId || String(sched.fictionId) === String(filterFictionId))
        ) || []
      }))
      .filter(s => s.archivedSchedules.length > 0)
      .filter(s => {
        if (!query) return true;
        const title = (s.fictionTitle || '').toLowerCase();
        const author = (s.authorName || '').toLowerCase();
        return title.includes(query) || author.includes(query);
      });
  }, [shoutouts, filterFictionId, archiveSearch]);

  // Drag and drop handlers
  const handleDragOver = (e, dateStr) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(dateStr);
  };

  const handleDragLeave = (e) => {
    setDragOverDate(null);
  };

  const handleDrop = (e, dateStr) => {
    e.preventDefault();
    setDragOverDate(null);
    const shoutoutId = e.dataTransfer.getData('text/plain');
    const sourceDate = e.dataTransfer.getData('application/x-source-date') || null;
    if (!shoutoutId) return;

    const existingShoutouts = shoutoutsByDate.get(dateStr) || [];

    // Check if this card is already on this date - if so, do nothing
    const isAlreadyOnDate = existingShoutouts.some(s => s.id === parseInt(shoutoutId));
    if (isAlreadyOnDate) {
      logger.info('Card already on this date, ignoring drop', { shoutoutId, date: dateStr });
      return;
    }

    if (existingShoutouts.length > 0) {
      // Show drop menu for conflict resolution
      setDropMenu({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
        shoutoutId: parseInt(shoutoutId),
        targetDate: dateStr,
        sourceDate,
        existingShoutouts
      });
    } else {
      // No conflict, just move
      logger.info('Dropped shoutout', { shoutoutId, date: dateStr, sourceDate });
      onShoutoutDrop?.(parseInt(shoutoutId), dateStr, 'move', [], sourceDate);
    }
  };

  const handleDropMenuSelect = (action) => {
    const { shoutoutId, targetDate, sourceDate, existingShoutouts } = dropMenu;
    logger.info('Drop menu action', { action, shoutoutId, targetDate, sourceDate });
    onShoutoutDrop?.(shoutoutId, targetDate, action, existingShoutouts, sourceDate);
    setDropMenu({ ...dropMenu, isOpen: false });
  };

  const handleDropMenuClose = () => {
    setDropMenu({ ...dropMenu, isOpen: false });
  };

  // Unscheduled drag-drop handlers with debounced close
  const handleUnscheduledDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Clear any pending close timeout
    if (dragOverTimeoutRef.current) {
      clearTimeout(dragOverTimeoutRef.current);
      dragOverTimeoutRef.current = null;
    }
    setDragOverUnscheduled(true);
  };

  const handleUnscheduledDragLeave = (e) => {
    // Only close if leaving the unscheduled section entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      // Delay closing to prevent flicker
      dragOverTimeoutRef.current = setTimeout(() => {
        setDragOverUnscheduled(false);
      }, 150);
    }
  };

  const handleUnscheduledDrop = (e) => {
    e.preventDefault();
    if (dragOverTimeoutRef.current) {
      clearTimeout(dragOverTimeoutRef.current);
      dragOverTimeoutRef.current = null;
    }
    const shoutoutId = e.dataTransfer.getData('text/plain');
    const sourceDate = e.dataTransfer.getData('application/x-source-date') || null;
    if (!shoutoutId) return;

    // Check if this shoutout is archived for the source date - can't unschedule archived items
    const shoutout = shoutouts.find(s => s.id === parseInt(shoutoutId));
    if (shoutout && sourceDate) {
      const isArchived = shoutout.schedules?.some(sched =>
        sched.date === sourceDate && sched.chapter
      );
      if (isArchived) {
        logger.info('Cannot unschedule archived shoutout', { shoutoutId, sourceDate });
        setDragOverUnscheduled(false);
        return;
      }
    }

    logger.info('Dropped to unscheduled', { shoutoutId, sourceDate });

    // null date = unscheduled, pass sourceDate so handler knows which schedule to clear
    onShoutoutDrop?.(parseInt(shoutoutId), null, 'move', [], sourceDate);

    // Delay closing for visual feedback
    setTimeout(() => {
      setDragOverUnscheduled(false);
    }, 500);
  };

  // Store callback in ref to avoid re-render loops
  const onScanCompleteRef = useRef(onScanComplete);
  onScanCompleteRef.current = onScanComplete;

  // Stop polling helper (no deps, stable)
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Scanner functions - no deps to prevent re-render loops
  const pollScanState = useCallback(async () => {
    try {
      const state = await getScanState();

      if (state.status === 'scanning') {
        setScanning(true);
        // Map 'init' phase to 'starting' for UI display
        const displayPhase = state.phase === 'init' ? 'starting' : state.phase;
        setScanProgress({
          phase: displayPhase,
          current: state.current || 0,
          total: state.total || 0,
          title: state.currentTitle || (displayPhase === 'starting' ? 'Initializing...' : ''),
          found: state.shoutoutsFound || 0
        });
        // Start polling if not already polling
        if (!pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(async () => {
            try {
              const s = await getScanState();
              if (s.status === 'scanning') {
                const displayPhase = s.phase === 'init' ? 'starting' : s.phase;
                setScanProgress({
                  phase: displayPhase,
                  current: s.current || 0,
                  total: s.total || 0,
                  title: s.currentTitle || (displayPhase === 'starting' ? 'Initializing...' : ''),
                  found: s.shoutoutsFound || 0
                });
              } else if (s.status === 'complete') {
                setScanning(false);
                setScanProgress({
                  phase: 'complete',
                  found: s.shoutoutsFound || 0,
                  message: `Done! Found ${s.shoutoutsFound || 0} shoutout(s).`
                });
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
                onScanCompleteRef.current?.();
                setTimeout(() => setScanProgress(null), 3000);
              } else if (s.status === 'error') {
                setScanning(false);
                setScanProgress({ phase: 'error', message: s.error });
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
                setTimeout(() => setScanProgress(null), 3000);
              } else {
                setScanning(false);
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            } catch (err) {
              logger.error('Poll error', err);
            }
          }, 500);
        }
      } else if (state.status === 'complete') {
        setScanning(false);
        setScanProgress({
          phase: 'complete',
          found: state.shoutoutsFound || 0,
          message: `Done! Found ${state.shoutoutsFound || 0} shoutout(s).`
        });
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        onScanCompleteRef.current?.();
        // Clear progress after 3 seconds
        setTimeout(() => setScanProgress(null), 3000);
      } else if (state.status === 'error') {
        setScanning(false);
        setScanProgress({ phase: 'error', message: state.error });
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setTimeout(() => setScanProgress(null), 3000);
      } else {
        setScanning(false);
      }
    } catch (err) {
      logger.error('Failed to get scan state', err);
    }
  }, []);

  // Check for ongoing scan on mount only
  useEffect(() => {
    pollScanState();

    cleanupListenerRef.current = onScanProgress((event) => {
      if (event.type === 'complete') {
        pollScanState();
      }
    });

    return () => {
      if (cleanupListenerRef.current) {
        cleanupListenerRef.current();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Poll for import progress - defined as callback so it can be called from message handler
  const pollImportState = useCallback(async () => {
    try {
      const state = await getImportState();
      if (state.status === 'importing') {
        setImportProgress({
          current: state.current || 0,
          total: state.total || 0,
          imported: state.imported || 0,
          duplicates: state.duplicates || 0,
          skipped: state.skipped || 0
        });
        // Start polling if not already
        if (!importPollRef.current) {
          importPollRef.current = setInterval(() => pollImportState(), 500);
        }
      } else if (state.status === 'complete') {
        setImportProgress({
          phase: 'complete',
          imported: state.imported || 0,
          duplicates: state.duplicates || 0,
          skipped: state.skipped || 0
        });
        if (importPollRef.current) {
          clearInterval(importPollRef.current);
          importPollRef.current = null;
        }
        onScanCompleteRef.current?.(); // Refresh data
        setTimeout(() => setImportProgress(null), 3000);
      } else if (state.status === 'error') {
        setImportProgress({ phase: 'error', message: state.error });
        if (importPollRef.current) {
          clearInterval(importPollRef.current);
          importPollRef.current = null;
        }
        setTimeout(() => setImportProgress(null), 3000);
      } else {
        setImportProgress(null);
        if (importPollRef.current) {
          clearInterval(importPollRef.current);
          importPollRef.current = null;
        }
      }
    } catch (err) {
      logger.error('Failed to poll import state', err);
    }
  }, []);

  // Initial poll for import progress on mount
  useEffect(() => {
    pollImportState();

    return () => {
      if (importPollRef.current) {
        clearInterval(importPollRef.current);
        importPollRef.current = null;
      }
    };
  }, [pollImportState]);

  // Swap-check poller — extracted so it can be kicked off from `handleCheckAllSwaps`
  // the moment the user starts a check, rather than relying on chrome runtime
  // messages (which can be dropped if the service worker naps). Stored on a ref
  // so its identity is stable across renders.
  const pollSwapChecksRef = useRef(async () => {});
  pollSwapChecksRef.current = async () => {
    try {
      const state = await getSwapCheckState();
      const checks = state.checks || {};

      const activeChecks = Object.entries(checks).filter(
        ([_, s]) => s.status === 'checking'
      );

      if (activeChecks.length > 0) {
        setSwapCheckStates(checks);

        if (!swapCheckPollRef.current) {
          swapCheckPollRef.current = setInterval(() => pollSwapChecksRef.current(), 500);
        }
      } else {
        // Update one last time to show completion, then stop polling.
        setSwapCheckStates(checks);
        if (swapCheckPollRef.current) {
          clearInterval(swapCheckPollRef.current);
          swapCheckPollRef.current = null;
        }
      }
    } catch (err) {
      logger.error('Failed to poll swap check states', err);
    }
  };

  // Poll for swap check states
  useEffect(() => {
    const pollSwapChecks = () => pollSwapChecksRef.current();

    // Initial poll
    pollSwapChecks();

    // Listen for swap check and import progress messages
    const handleMessage = (message) => {
      if (message.type === 'swapCheckProgress') {
        pollSwapChecks();
      }
      // Overall check all swaps progress
      if (message.type === 'checkAllSwapsProgress') {
        setCheckAllProgress({
          current: message.current,
          total: message.total,
          authorName: message.authorName
        });
        setCheckingAllSwaps(true);
      }
      if (message.type === 'swapCheckComplete' && message.checked !== undefined) {
        setCheckAllProgress(null);
        setCheckingAllSwaps(false);
      }
      if (message.type === 'checkAllSwapsCancelled') {
        setCheckAllProgress(null);
        setCheckingAllSwaps(false);
      }
      if (message.type === 'scanCancelled') {
        setScanProgress(null);
        setScanning(false);
      }
      if (message.type === 'importCancelled') {
        setImportProgress(null);
        if (importPollRef.current) {
          clearInterval(importPollRef.current);
          importPollRef.current = null;
        }
      }
      // Import progress - trigger polling
      if (message.type === 'importProgress' || message.type === 'importStarted') {
        pollImportState();
      }
      // Shoutout imported - refresh data incrementally
      if (message.type === 'shoutoutImported') {
        // Update progress display
        setImportProgress({
          current: message.current || 0,
          total: message.total || 0,
          imported: message.imported || 0,
          duplicates: message.duplicates || 0,
          skipped: message.skipped || 0
        });
        // Trigger data refresh
        onScanCompleteRef.current?.();
      }
      // Scan started from elsewhere (e.g. Scanner Modal) - start showing progress
      if (message.type === 'scanStarted') {
        pollScanState();
      }
      // Shoutout found during scan - refresh data incrementally + make sure banner is live
      if (message.type === 'shoutoutFound') {
        onScanCompleteRef.current?.();
        pollScanState();
      }
      // Import complete
      if (message.type === 'importComplete') {
        setImportProgress({
          phase: 'complete',
          imported: message.imported || 0,
          duplicates: message.duplicates || 0,
          skipped: message.skipped || 0
        });
        onScanCompleteRef.current?.();
        setTimeout(() => setImportProgress(null), 3000);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      if (swapCheckPollRef.current) {
        clearInterval(swapCheckPollRef.current);
        swapCheckPollRef.current = null;
      }
    };
  }, []);

  const handleStartScan = async () => {
    if (!scanFictionId) {
      alert('Please select a fiction to scan');
      return;
    }

    setScanning(true);
    setScanProgress({ phase: 'starting', title: 'Starting scan...' });

    try {
      const response = await startFullScan(scanFictionId);
      if (response.started) {
        // Poll will detect scanning state and start interval
        pollScanState();
      } else {
        setScanProgress({ phase: 'error', message: response.reason || 'Failed to start scan' });
        setScanning(false);
        setTimeout(() => setScanProgress(null), 3000);
      }
    } catch (err) {
      logger.error('Failed to start scan', err);
      setScanProgress({ phase: 'error', message: err.message });
      setScanning(false);
      setTimeout(() => setScanProgress(null), 3000);
    }
  };

  const handleCheckAllSwaps = async () => {
    setCheckingAllSwaps(true);
    // Kick the poller off immediately so per-shoutout check status updates
    // live instead of only on a manual refresh. The poller self-terminates
    // once no check remains in the `checking` status.
    pollSwapChecksRef.current();
    try {
      const result = await checkAllSwaps();
      logger.info('Check all swaps result', result);
      if (result.error) {
        alert(`Error: ${result.error}`);
      }
      // Final sync once the background service worker marks everything done.
      pollSwapChecksRef.current();
    } catch (err) {
      logger.error('Failed to check all swaps', err);
      alert(`Error: ${err.message}`);
    } finally {
      setCheckingAllSwaps(false);
    }
  };

  const daysInMonth = getDaysInMonth(month, year);
  const firstDay = getFirstDayOfMonth(month, year);

  // Diagnostic: log when the calendar view's visible-state meaningfully
  // changes (month, map size, or total hits). A ref-based signature check
  // prevents log spam when the parent re-renders on polling ticks but
  // nothing visible actually changed.
  const lastCalSigRef = useRef('');
  if (currentView === 'calendar') {
    const visibleDateStrs = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    });
    const hits = visibleDateStrs
      .map(ds => ({ date: ds, count: (shoutoutsByDate.get(ds) || []).length }))
      .filter(h => h.count > 0);
    const totalHits = hits.reduce((n, h) => n + h.count, 0);
    const sig = `${year}-${month}|${shoutoutsByDate.size}|${totalHits}`;
    if (sig !== lastCalSigRef.current) {
      logger.info('Calendar view render', {
        viewing: `${MONTHS[month]} ${year}`,
        viewedMonthKey: `${year}-${String(month + 1).padStart(2, '0')}`,
        mapSize: shoutoutsByDate.size,
        mapKeysSample: Array.from(shoutoutsByDate.keys()).slice(0, 20),
        hitsInVisibleMonth: hits,
        totalHitsInVisibleMonth: totalHits,
      });
      lastCalSigRef.current = sig;
    }
  }

  return (
    <div class="rr-calendar">
      <div class="rr-calendar-header">
        <div class="rr-view-tabs">
          <button
            class={`rr-view-tab ${currentView === 'calendar' ? 'active' : ''}`}
            onClick={() => setCurrentView('calendar')}
          >
            <i class="fa fa-calendar"></i> Calendar
          </button>
          <button
            class={`rr-view-tab ${currentView === 'archive' ? 'active' : ''}`}
            onClick={() => setCurrentView('archive')}
          >
            <i class="fa fa-list"></i> List
          </button>
        </div>
        {currentView === 'calendar' && (
          <div class="rr-calendar-nav">
            <div class="rr-cal-nav-center">
              <button class="rr-cal-nav rr-cal-prev" onClick={prevMonth}>&lt;</button>
              <span class="rr-cal-title">{MONTHS[month]} {year}</span>
              <button class="rr-cal-nav rr-cal-next" onClick={nextMonth}>&gt;</button>
            </div>
            <div class="rr-cal-nav-right">
              <button class="rr-cal-nav rr-cal-today" onClick={goToToday}>Today</button>
              <button
                class="rr-cal-nav rr-cal-check-swaps"
                onClick={handleCheckAllSwaps}
                disabled={checkingAllSwaps}
                title="Check if other authors have shouted you back"
              >
                {checkingAllSwaps ? <i class="fa fa-spinner fa-spin"></i> : <i class="fa fa-sync"></i>} Check Swaps
              </button>
            </div>
          </div>
        )}
        {currentView === 'archive' && (
          <div class="rr-calendar-nav">
            <button
              class="rr-cal-nav rr-cal-today"
              onClick={() => setScannerModalOpen(true)}
            >
              <i class="fa fa-search"></i> Scan Chapters
            </button>
          </div>
        )}
      </div>

      {scanProgress && (
        <div class="rr-check-all-progress">
          <div class="rr-check-all-status">
            {scanProgress.phase === 'complete' ? (
              <><i class="fa fa-check"></i> {scanProgress.message || 'Scan complete'}</>
            ) : scanProgress.phase === 'error' ? (
              <><i class="fa fa-times"></i> Scan error: {scanProgress.message}</>
            ) : (
              <>
                <span>
                  <i class="fa fa-spinner fa-spin"></i>{' '}
                  {scanProgress.phase === 'download'
                    ? 'Downloading chapters'
                    : scanProgress.phase === 'process'
                    ? 'Processing'
                    : scanProgress.phase === 'checkSwaps'
                    ? 'Checking swaps'
                    : scanProgress.phase === 'starting'
                    ? 'Starting scan'
                    : 'Scanning'}
                  {scanProgress.total > 0 && ` ${scanProgress.current}/${scanProgress.total}`}
                  {scanProgress.title && `: ${scanProgress.title}`}
                  {scanProgress.found > 0 && ` — found ${scanProgress.found}`}
                </span>
                <button
                  class="btn btn-sm btn-outline-danger rr-import-cancel-btn"
                  onClick={async () => {
                    try {
                      await cancelScan();
                    } catch (err) {
                      logger.error('Failed to cancel scan', err);
                    }
                    setScanProgress(null);
                    setScanning(false);
                    if (pollIntervalRef.current) {
                      clearInterval(pollIntervalRef.current);
                      pollIntervalRef.current = null;
                    }
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
          {scanProgress.total > 0 && !['complete', 'error'].includes(scanProgress.phase) && (
            <div class="progress">
              <div
                class="progress-bar"
                style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {checkAllProgress && (
        <div class="rr-check-all-progress">
          <div class="rr-check-all-status">
            <span>
              <i class="fa fa-spinner fa-spin"></i> Checking {checkAllProgress.current}/{checkAllProgress.total}: {checkAllProgress.authorName}
            </span>
            <button
              class="btn btn-sm btn-outline-danger rr-import-cancel-btn"
              onClick={async () => {
                try {
                  await cancelCheckAllSwaps();
                } catch (err) {
                  logger.error('Failed to cancel check-all-swaps', err);
                }
                setCheckAllProgress(null);
                setCheckingAllSwaps(false);
              }}
            >
              Cancel
            </button>
          </div>
          <div class="progress">
            <div
              class="progress-bar"
              style={{ width: `${(checkAllProgress.current / checkAllProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {importProgress && (
        <div class="rr-check-all-progress">
          <div class="rr-check-all-status">
            {importProgress.phase === 'complete' ? (
              <><i class="fa fa-check"></i> Imported {importProgress.imported} shoutouts ({importProgress.duplicates} duplicates, {importProgress.skipped} skipped)</>
            ) : importProgress.phase === 'error' ? (
              <><i class="fa fa-times"></i> Import error: {importProgress.message}</>
            ) : (
              <>
                <span>
                  <i class="fa fa-spinner fa-spin"></i> Importing: {importProgress.current}/{importProgress.total} rows ({importProgress.imported} imported)
                </span>
                <button
                  class="btn btn-sm btn-outline-danger rr-import-cancel-btn"
                  onClick={async () => {
                    try {
                      await cancelImport();
                    } catch (err) {
                      logger.error('Failed to cancel import', err);
                    }
                    setImportProgress(null);
                    if (importPollRef.current) {
                      clearInterval(importPollRef.current);
                      importPollRef.current = null;
                    }
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
          {importProgress.total > 0 && !importProgress.phase && (
            <div class="progress">
              <div
                class="progress-bar"
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div class="rr-view-content">
        {currentView === 'calendar' && (
          <div class="rr-calendar-view">
            <div class="rr-calendar-grid-wrapper">
              <div class="rr-cal-edge rr-cal-edge-left" onClick={prevMonth}>
                <i class="fa fa-chevron-left"></i>
              </div>
              <div class="rr-cal-edge rr-cal-edge-right" onClick={nextMonth}>
                <i class="fa fa-chevron-right"></i>
              </div>
              <div class="rr-calendar-grid">
              <div class="rr-calendar-weekdays">
                {DAYS.map(day => (
                  <div key={day} class="rr-weekday">{day}</div>
                ))}
              </div>
              <div class="rr-calendar-days">
                {/* Empty cells before first day */}
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`empty-${i}`} class="rr-day rr-day-empty"></div>
                ))}

                {/* Days of month */}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = day === today.getDate() &&
                                  month === today.getMonth() &&
                                  year === today.getFullYear();
                  const thisDate = new Date(year, month, day);
                  thisDate.setHours(0, 0, 0, 0);
                  const todayStart = new Date(today);
                  todayStart.setHours(0, 0, 0, 0);
                  const isPast = thisDate < todayStart;
                  const dayShoutouts = shoutoutsByDate.get(dateStr) || [];

                  const handleDayClick = (e) => {
                    // If multiple shoutouts, show stack popover
                    if (dayShoutouts.length > 1) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setStackPopover({
                        isOpen: true,
                        date: dateStr,
                        shoutouts: dayShoutouts,
                        position: { x: rect.right + 10, y: rect.top }
                      });
                    } else if (isPast && dayShoutouts.length === 1) {
                      // Past date with single shoutout - view it
                      onShoutoutClick?.(dayShoutouts[0], dateStr, 'view');
                    } else if (!isPast) {
                      // Future date - open add modal
                      onDayClick?.(dateStr, dayShoutouts);
                    }
                  };

                  return (
                    <div
                      key={dateStr}
                      class={`rr-day ${isToday ? 'rr-day-today' : ''} ${isPast ? 'rr-day-past' : ''} ${dragOverDate === dateStr ? 'rr-day-drag-over' : ''}`}
                      data-date={dateStr}
                      onClick={handleDayClick}
                      onDragOver={isPast ? undefined : (e) => handleDragOver(e, dateStr)}
                      onDragLeave={isPast ? undefined : handleDragLeave}
                      onDrop={isPast ? undefined : (e) => handleDrop(e, dateStr)}
                    >
                      <span class="rr-day-number">{day}</span>
                      <div class="rr-day-events">
                        {dayShoutouts.slice(0, 3).map((s, idx) => {
                          // Check if this shoutout is archived for this date
                          const isArchived = s.schedules?.some(sched =>
                            sched.date === dateStr && sched.chapter
                          );
                          // Get swap check state for this shoutout
                          const checkState = swapCheckStates[s.id];
                          return (
                            <CalendarCard
                              key={idx}
                              shoutout={s}
                              checkState={checkState}
                              isArchived={isPast || isArchived}
                              sourceDate={dateStr}
                              onClick={(e) => {
                                e.stopPropagation();
                                logger.info('Card clicked', { dateStr, shoutoutCount: dayShoutouts.length, shoutoutId: s.id });
                                // If multiple shoutouts, open popover (including archived/past)
                                if (dayShoutouts.length > 1) {
                                  const dayEl = e.currentTarget.closest('.rr-day');
                                  const rect = dayEl ? dayEl.getBoundingClientRect() : { right: 200, top: 200 };
                                  logger.info('Opening stack popover', { dateStr, rect, shoutoutCount: dayShoutouts.length });
                                  setStackPopover({
                                    isOpen: true,
                                    date: dateStr,
                                    shoutouts: dayShoutouts,
                                    position: { x: rect.right + 10, y: rect.top }
                                  });
                                } else {
                                  // Single shoutout - past dates or archived open in view mode
                                  onShoutoutClick?.(s, dateStr, (isPast || isArchived) ? 'view' : 'edit');
                                }
                              }}
                            />
                          );
                        })}
                        {dayShoutouts.length > 1 && (
                          <div class="rr-stack-count">{dayShoutouts.length}</div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Trailing empty cells to always have 6 weeks (42 cells) */}
                {Array.from({ length: 42 - firstDay - daysInMonth }, (_, i) => (
                  <div key={`empty-end-${i}`} class="rr-day rr-day-empty"></div>
                ))}
              </div>
            </div>
            </div>

            {/* Unscheduled section - integrated into calendar with drag-drop */}
            <div
              class={`rr-unscheduled ${showUnscheduled ? 'rr-unscheduled-visible' : ''} ${dragOverUnscheduled ? 'rr-unscheduled-drag-over' : ''}`}
              onDragOver={handleUnscheduledDragOver}
              onDragLeave={handleUnscheduledDragLeave}
              onDrop={handleUnscheduledDrop}
            >
              <div class="rr-unscheduled-header">
                <span class="rr-unscheduled-label">Unscheduled ({unscheduledShoutouts.length})</span>
                <button
                  class="btn btn-sm btn-icon rr-unscheduled-close"
                  onClick={() => setShowUnscheduled(false)}
                >
                  &times;
                </button>
              </div>
              <div class="rr-unscheduled-items">
                {unscheduledShoutouts.length === 0 ? (
                  <div class="rr-unscheduled-empty">Drag shoutouts here to unschedule</div>
                ) : (
                  unscheduledShoutouts.map(s => (
                    <CalendarCard
                      key={s.id}
                      shoutout={s}
                      checkState={swapCheckStates[s.id]}
                      onClick={() => onShoutoutClick?.(s, null)}
                    />
                  ))
                )}
              </div>
            </div>

            <button
              class="btn btn-sm btn-outline-secondary rr-unscheduled-toggle"
              onClick={() => setShowUnscheduled(!showUnscheduled)}
              onDragOver={handleUnscheduledDragOver}
              onDragLeave={handleUnscheduledDragLeave}
              onDrop={handleUnscheduledDrop}
            >
              <i class="fa fa-inbox"></i> Unscheduled
              {unscheduledShoutouts.length > 0 && (
                <span class="rr-unscheduled-badge">{unscheduledShoutouts.length}</span>
              )}
            </button>
          </div>
        )}

        {currentView === 'archive' && (
          <div class="rr-archive-view">
            <div class="rr-archive-toolbar">
              <div class="rr-archive-search">
                <input
                  type="text"
                  class="form-control"
                  placeholder="Search by title or author..."
                  value={archiveSearch}
                  onInput={(e) => setArchiveSearch(e.target.value)}
                />
              </div>
            </div>

            <div class="rr-archive-entries">
              {archivedShoutouts.length === 0 ? (
                <div class="rr-archive-empty">No archived shoutouts yet. Select a fiction and scan to find shoutouts in your chapters.</div>
              ) : (
                archivedShoutouts.map(s => {
                  const wePosted = s.schedules?.some(sch => sch.chapter);
                  const theyPosted = !!s.swappedDate;
                  const hasScanned = !!s.lastSwapScanDate;

                  // Get the schedule info for display
                  const schedule = s.archivedSchedules?.[0] || s.schedules?.[0];
                  const scheduleFiction = myFictions.find(f => String(f.fictionId) === String(schedule?.fictionId));

                  // Status logic:
                  // SWAPPED = Us AND Them
                  // NOT FOUND = Us NOT Them AND scanned
                  // NOT SCANNED = Us posted but not scanned (grey hourglass)
                  // SHOUTED = Them NOT Us
                  // SCHEDULED = neither
                  // Check if swap is being checked
                  const checkState = swapCheckStates[s.id];
                  const isChecking = checkState?.status === 'checking';

                  let statusClass = 'rr-swap-status-scheduled';
                  let statusIcon = 'fa-clock';
                  let statusTitle = 'Scheduled';

                  if (isChecking) {
                    statusClass = 'rr-swap-status-checking';
                    statusIcon = 'fa-spinner fa-spin';
                    statusTitle = 'Checking for swap...';
                  } else if (wePosted && theyPosted) {
                    statusClass = 'rr-swap-status-swapped';
                    statusIcon = 'fa-retweet';
                    statusTitle = 'Swapped!';
                  } else if (wePosted && !theyPosted && hasScanned) {
                    statusClass = 'rr-swap-status-notfound';
                    statusIcon = 'fa-times';
                    statusTitle = 'Not found - they haven\'t shouted you';
                  } else if (wePosted && !theyPosted && !hasScanned) {
                    statusClass = 'rr-swap-status-notscanned';
                    statusIcon = 'fa-hourglass-half';
                    statusTitle = 'Not scanned yet';
                  } else if (theyPosted) {
                    statusClass = 'rr-swap-status-shouted';
                    statusIcon = 'fa-comment';
                    statusTitle = 'They shouted you!';
                  }

                  return (
                    <div
                      key={s.id}
                      class={`rr-archive-entry ${wePosted ? 'rr-archive-entry-archived' : 'rr-archive-entry-pending'} ${isChecking ? 'rr-archive-entry-checking' : ''}`}
                      data-shoutout-id={s.id}
                      data-fiction-id={s.fictionId}
                      data-schedule-fiction-id={schedule?.fictionId || ''}
                      data-schedule-chapter={schedule?.chapter || ''}
                      onClick={() => onShoutoutClick?.(s, null, 'view')}
                    >
                      <div class="rr-archive-entry-covers">
                        <div class="rr-archive-shoutout-cover" title={s.fictionTitle || 'Unknown'} style={{ cursor: 'pointer' }}>
                          {s.coverUrl ? (
                            <img src={s.coverUrl} alt={s.fictionTitle || ''} />
                          ) : (
                            <div class="rr-archive-cover-placeholder">
                              {(s.fictionTitle || '?')[0].toUpperCase()}
                            </div>
                          )}
                          {/* Status icon overlay on cover */}
                          <span class={`rr-archive-status-overlay ${statusClass}`} title={statusTitle}>
                            <i class={`fa ${statusIcon}`}></i>
                          </span>
                        </div>
                      </div>
                      <div class="rr-archive-entry-info">
                        <div class="rr-archive-entry-header">
                          <span class="rr-archive-date">{schedule?.date || 'Unscheduled'}</span>
                        </div>
                        <div class="rr-archive-shoutout-info">
                          <span class="rr-archive-shoutout-title">
                            <a
                              href={s.fictionUrl || `https://www.royalroad.com/fiction/${s.fictionId}`}
                              target="_blank"
                              rel="noopener"
                              class="rr-archive-fiction-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {s.fictionTitle || 'Unknown'}
                            </a>
                          </span>
                          <span class="rr-archive-shoutout-author">
                            by <span class="rr-archive-author-link" data-author={s.authorName}>{s.authorName || 'Unknown'}</span>
                          </span>
                        </div>
                        {scheduleFiction && (
                          <div class="rr-archive-swapped-for">
                            <i class="fa fa-exchange-alt"></i> {scheduleFiction.title || `Fiction ${schedule.fictionId}`}
                          </div>
                        )}
                      </div>
                      <div class="rr-archive-entry-status">
                        {/* Archived status - checkbox */}
                        {wePosted ? (
                          <span class="rr-list-status-icon rr-list-archived-icon rr-archived" title={`Archived: ${schedule?.chapter || 'Unknown chapter'}`}>
                            <i class="fa fa-check-square"></i>
                          </span>
                        ) : (
                          <span class="rr-list-status-icon rr-list-archived-icon" title="Scheduled shoutout">
                            <i class="far fa-square"></i>
                          </span>
                        )}
                      </div>
                      <div class="rr-archive-actions">
                        <button
                          class="rr-archive-untrack"
                          title="Untrack (remove from database)"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUntrackConfirm({ isOpen: true, shoutout: s });
                          }}
                        >
                          <i class="fa fa-times"></i>
                        </button>
                      </div>
                      {isChecking && checkState.total > 0 && (
                        <div class="rr-archive-entry-progress">
                          <div
                            class="rr-archive-entry-progress-bar"
                            style={{ width: `${(checkState.current / checkState.total) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <DropMenu
        isOpen={dropMenu.isOpen}
        position={dropMenu.position}
        onSelect={handleDropMenuSelect}
        onClose={handleDropMenuClose}
      />

      <DayStackPopover
        isOpen={stackPopover.isOpen}
        date={stackPopover.date}
        shoutouts={stackPopover.shoutouts}
        position={stackPopover.position}
        onClose={() => setStackPopover({ ...stackPopover, isOpen: false })}
        onShoutoutClick={onShoutoutClick}
        onReorder={onReorder}
      />

      <DangerConfirmDialog
        isOpen={untrackConfirm.isOpen}
        title="Untrack Shoutout"
        message={`Are you sure you want to untrack "${untrackConfirm.shoutout?.fictionTitle || 'this shoutout'}"? This will remove it from your database.`}
        confirmText="Untrack"
        onConfirm={() => {
          if (untrackConfirm.shoutout) {
            onDeleteShoutout?.(untrackConfirm.shoutout.id);
          }
          setUntrackConfirm({ isOpen: false, shoutout: null });
        }}
        onCancel={() => setUntrackConfirm({ isOpen: false, shoutout: null })}
      />

      <ScannerModal
        isOpen={scannerModalOpen}
        onClose={() => setScannerModalOpen(false)}
        myFictions={myFictions}
        onScanComplete={() => {
          setScannerModalOpen(false);
          onScanComplete?.();
        }}
      />
    </div>
  );
}

export default Calendar;
