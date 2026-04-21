import { h } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { Modal } from '../../../common/ui/modal/Modal.jsx';
import { Select, Checkbox, Button } from '../../../common/ui/components/index.jsx';
import { startFullScan, getScanState, cancelScan, onScanProgress, checkAllSwaps } from '../../services/scanner.js';
import { log } from '../../../common/logging/core.js';
// CSS lives in /content/index.jsx's injectStyles bundle — esbuild drops bare
// side-effect imports of text-loaded files, so don't try to import it here.

const logger = log.scope('scanner-modal');

export function ScannerModal({
  isOpen,
  onClose,
  myFictions = [],
  currentFictionId = null,
  onScanComplete
}) {
  const [selectedFictionId, setSelectedFictionId] = useState(currentFictionId || myFictions[0]?.fictionId || '');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [checkSwapsAfter, setCheckSwapsAfter] = useState(true); // Check for swaps after scan
  const [checkingSwaps, setCheckingSwaps] = useState(false);
  const pollIntervalRef = useRef(null);
  const cleanupListenerRef = useRef(null);
  const checkSwapsAfterRef = useRef(checkSwapsAfter);
  // Was a scan actually observed during this modal session? Guards against
  // the stale `complete` status briefly held by the background service worker
  // (decays to `idle` ~1.5s after a scan ends). Without this, opening the
  // modal during that window would see `complete` on mount and fire
  // `onScanComplete`, making the modal "blink in" and instantly close.
  const sawScanningRef = useRef(false);
  // True while a multi-fiction batch is running. Blocks the single-fiction
  // complete handler from closing the modal between fictions.
  const inBatchRef = useRef(false);
  // The fictionId of the most recently kicked-off scan. Used to scope the
  // post-scan swap check to just that fiction's shoutouts.
  const lastScannedFictionIdRef = useRef(null);
  // ISO timestamp of when the modal was last opened fresh. Any background
  // `complete` state with a `completedAt` older than this is stale and must
  // not trigger an auto-close — that's the "modal blinks out" bug.
  const modalOpenedAtRef = useRef(null);
  // Batch-level progress display ("Fiction 2 / 7: Title").
  const [batchLabel, setBatchLabel] = useState(null);
  // Human-readable phase: 'idle' | 'scanning' | 'swap-check' | 'complete' | 'error'.
  const [phase, setPhase] = useState('idle');

  // Seed the selection only when the modal transitions from closed to open.
  // Previously this effect also fired whenever `myFictions` or `currentFictionId`
  // changed identity — which happens on every post-scan data reload — and it
  // would overwrite the user's choice, making it look like the dropdown was
  // stuck on the first scanned fiction. Gating on `isOpen` only means the user's
  // selection survives background data refreshes for as long as the modal
  // stays open.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setSelectedFictionId(currentFictionId || myFictions[0]?.fictionId || '');
      setSummary(null);
      setResults([]);
      setProgress(null);
      setBatchLabel(null);
      setPhase('idle');
      // Fresh session — don't let a stale background `complete` status trip
      // onScanComplete on mount.
      sawScanningRef.current = false;
      inBatchRef.current = false;
      lastScannedFictionIdRef.current = null;
      modalOpenedAtRef.current = new Date().toISOString();
    }
    wasOpenRef.current = isOpen;
    // Intentionally only depending on `isOpen`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Keep ref in sync with state
  useEffect(() => {
    checkSwapsAfterRef.current = checkSwapsAfter;
  }, [checkSwapsAfter]);

  // Poll for scan state updates
  const pollScanState = useCallback(async () => {
    try {
      const state = await getScanState();

      if (state.status === 'scanning') {
        sawScanningRef.current = true;
        setScanning(true);
        setPhase('scanning');
        setProgress({
          current: state.current || 0,
          total: state.total || 0,
          chapter: state.currentTitle || '',
          phase: state.phase || 'download',
          shoutoutsFound: state.shoutoutsFound || 0
        });
      } else if (state.status === 'complete') {
        // During a batch, a single fiction finishing is NOT the end. Skip the
        // close-and-summarize path and let the batch driver handle final UI.
        if (inBatchRef.current) return;
        // Stale-complete guard #1 — only treat as a fresh result if we
        // observed scanning within this session.
        if (!sawScanningRef.current) {
          setScanning(false);
          setProgress(null);
          stopPolling();
          return;
        }
        // Stale-complete guard #2 — timestamp-based. If the background's
        // `completedAt` is from before the modal was opened this time,
        // the complete is leftover from a previous session.
        if (
          state.completedAt &&
          modalOpenedAtRef.current &&
          state.completedAt < modalOpenedAtRef.current
        ) {
          setScanning(false);
          setProgress(null);
          stopPolling();
          return;
        }
        sawScanningRef.current = false;
        setScanning(false);
        setPhase('complete');
        setSummary({
          scanned: state.total || 0,
          found: state.shoutoutsFound || 0,
          fictionTitle: state.fictionTitle || ''
        });
        setProgress(null);
        stopPolling();
        if (onScanComplete) onScanComplete();

        // Check swaps if enabled — scoped to the fiction we just scanned,
        // so we don't re-walk every other fiction's shoutouts.
        if (checkSwapsAfterRef.current && state.shoutoutsFound > 0) {
          const scope = lastScannedFictionIdRef.current || undefined;
          setCheckingSwaps(true);
          setPhase('swap-check');
          checkAllSwaps(scope ? { fictionId: scope } : {}).finally(() => {
            setCheckingSwaps(false);
            setPhase('complete');
          });
        }
      } else if (state.status === 'error') {
        setScanning(false);
        setSummary({ error: state.error });
        setProgress(null);
        stopPolling();
      } else if (state.status === 'idle') {
        setScanning(false);
        setProgress(null);
      }
    } catch (err) {
      logger.error('Failed to get scan state', err);
    }
  }, [onScanComplete]);

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(pollScanState, 500);
  }, [pollScanState]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Listen for scan events from background
  useEffect(() => {
    if (!isOpen) return;

    cleanupListenerRef.current = onScanProgress((event) => {
      if (event.type === 'found') {
        setResults(prev => [...prev, {
          chapterName: event.chapterName,
          fictionTitle: event.fictionTitle,
          authorName: event.authorName
        }]);
      } else if (event.type === 'complete') {
        pollScanState(); // Get final state
      }
    });

    // Check initial state
    pollScanState();

    return () => {
      if (cleanupListenerRef.current) {
        cleanupListenerRef.current();
        cleanupListenerRef.current = null;
      }
      stopPolling();
    };
  }, [isOpen, pollScanState, stopPolling]);

  // Run a single scan for one fiction and resolve once its state returns to
  // `idle`/`complete` *after* we have observed `scanning` at least once.
  // Without that guard, a stale `complete` from a previous fiction's scan
  // causes the loop to resolve instantly and we end up skipping the fiction.
  const runScan = useCallback(async (fictionId) => {
    sawScanningRef.current = true;
    lastScannedFictionIdRef.current = fictionId;
    setScanning(true);
    setProgress({ current: 0, total: 0, chapter: 'Starting...', phase: 'download' });
    setResults([]);

    const response = await startFullScan(fictionId);
    if (!response?.started) {
      setScanning(false);
      sawScanningRef.current = false;
      throw new Error(response?.reason || 'Failed to start scan');
    }
    logger.info('Scan started', { fictionId });

    // Give the background a moment to flip to `scanning` before we start
    // polling. Even with the guard below, skipping the first tick avoids an
    // unnecessary "saw complete, ignoring" round.
    await new Promise((r) => setTimeout(r, 100));

    await new Promise((resolve, reject) => {
      let sawScanning = false;
      const deadline = Date.now() + 10_000; // fail-safe if scanning never starts

      const tick = async () => {
        try {
          const state = await getScanState();

          if (state.status === 'scanning') {
            sawScanning = true;
            setProgress({
              current: state.current || 0,
              total: state.total || 0,
              chapter: state.currentTitle || '',
              phase: state.phase || 'download',
              shoutoutsFound: state.shoutoutsFound || 0,
            });
          } else if (state.status === 'error') {
            reject(new Error(state.error || 'Scan failed'));
            return;
          } else if (state.status === 'complete' || state.status === 'idle') {
            // Resolve only after we actually saw the scan running —
            // otherwise we're looking at stale prior-scan state.
            if (sawScanning) {
              resolve(state);
              return;
            }
            if (Date.now() > deadline) {
              reject(new Error('Scan never transitioned to running'));
              return;
            }
          }
          setTimeout(tick, 500);
        } catch (err) {
          reject(err);
        }
      };
      tick();
    });
  }, []);

  const handleScan = useCallback(async () => {
    if (!selectedFictionId) return;

    setSummary(null);

    try {
      if (selectedFictionId === '__all__') {
        // Sequential scan of every fiction. `inBatchRef` prevents the
        // per-fiction `complete` handler from firing onScanComplete between
        // fictions and closing the modal mid-batch.
        inBatchRef.current = true;
        let totalScanned = 0;
        let totalFound = 0;
        try {
          for (let i = 0; i < myFictions.length; i++) {
            const f = myFictions[i];
            setBatchLabel(`Fiction ${i + 1} of ${myFictions.length}: ${f.title || f.fictionId}`);
            setProgress({ current: 0, total: 0, chapter: `Starting "${f.title || f.fictionId}"...`, phase: 'download' });
            await runScan(String(f.fictionId));
            const final = await getScanState();
            totalScanned += final.total || 0;
            totalFound += final.shoutoutsFound || 0;
          }
        } finally {
          inBatchRef.current = false;
        }
        setBatchLabel(null);
        setScanning(false);
        setProgress(null);
        setSummary({ scanned: totalScanned, found: totalFound, fictionTitle: 'all fictions' });
        stopPolling();
        if (onScanComplete) onScanComplete();
        if (checkSwapsAfterRef.current && totalFound > 0) {
          setCheckingSwaps(true);
          checkAllSwaps().finally(() => setCheckingSwaps(false));
        }
        return;
      }

      await runScan(selectedFictionId);
      // The per-fiction polling inside `runScan` already updates state;
      // the single-fiction `complete` branch in `pollScanState` (when it
      // runs via `startPolling`) would also run if the user kept the
      // modal open. Trigger one final poll to make sure summary is set.
      startPolling();
    } catch (err) {
      logger.error('Scan failed', err);
      setSummary({ error: err.message });
      setScanning(false);
      sawScanningRef.current = false;
    }
  }, [selectedFictionId, myFictions, runScan, startPolling, stopPolling, onScanComplete]);

  const handleCancel = useCallback(async () => {
    try {
      await cancelScan();
      setScanning(false);
      setProgress(null);
      stopPolling();
    } catch (err) {
      logger.error('Failed to cancel scan', err);
    }
  }, [stopPolling]);

  const handleClose = () => {
    // Allow closing even while scanning - scan continues in background
    setProgress(null);
    setResults([]);
    setSummary(null);
    stopPolling();
    onClose();
  };

  const footer = (
    <>
      {scanning ? (
        <button class="btn btn-secondary" onClick={handleCancel}>
          Cancel
        </button>
      ) : (
        <button class="btn btn-secondary" onClick={handleClose}>
          Close
        </button>
      )}
      <button
        class="btn btn-primary"
        onClick={handleScan}
        disabled={scanning || !selectedFictionId}
      >
        {scanning ? 'Scanning...' : 'Start Scan'}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Scan Chapters for Shoutouts"
      className="rr-modal-large"
      footer={footer}
    >
      <div class="rr-scanner-content">
        <div class={`rr-scanner-phase rr-scanner-phase--${phase}`}>
          <span class="rr-scanner-phase-dot" aria-hidden />
          <span class="rr-scanner-phase-label">
            {phase === 'idle' && 'Ready'}
            {phase === 'scanning' && (batchLabel || 'Scanning')}
            {phase === 'swap-check' && 'Checking for swap returns'}
            {phase === 'complete' && 'Complete'}
            {phase === 'error' && 'Error'}
          </span>
        </div>

        <div class="rr-scanner-fiction-select">
          <label class="rr-modal-label">Select fiction to scan:</label>
          <Select
            size="sm"
            value={selectedFictionId}
            onChange={(e) => setSelectedFictionId(e.target.value)}
            disabled={scanning}
          >
            <option value="">Select a fiction...</option>
            {myFictions.length > 1 && (
              <option value="__all__">All fictions ({myFictions.length})</option>
            )}
            {myFictions.map(f => (
              <option key={f.fictionId} value={f.fictionId}>
                {f.title || `Fiction ${f.fictionId}`}
              </option>
            ))}
          </Select>
        </div>

        <p class="rr-scanner-description">
          This will scan all chapters of the selected fiction and find any shoutouts
          in the author notes. Found shoutouts will be added to your calendar.
        </p>

        <Checkbox
          checked={checkSwapsAfter}
          onChange={(e) => setCheckSwapsAfter(e.target.checked)}
          disabled={scanning}
          label="Check for return swaps after scanning"
          className="rr-scanner-checkbox"
        />

        {progress && (
          <div class="rr-scanner-progress">
            {batchLabel && (
              <div class="rr-scanner-batch-label">{batchLabel}</div>
            )}
            <div class="rr-scanner-progress-bar">
              <div
                class="rr-scanner-progress-fill"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
            <div class="rr-scanner-progress-text">
              {progress.phase === 'download' ? 'Downloading' : 'Processing'}: {progress.chapter}
              {progress.total > 0 && ` (${progress.current}/${progress.total})`}
            </div>
            {progress.shoutoutsFound > 0 && (
              <div class="rr-scanner-found-count">
                Found: {progress.shoutoutsFound} shoutout(s)
              </div>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div class="rr-scanner-results">
            <div class="rr-scanner-results-header">Found Shoutouts:</div>
            <div class="rr-scanner-results-list">
              {results.map((r, i) => (
                <div key={i} class="rr-scanner-result-item">
                  <span class="rr-scanner-result-chapter">{r.chapterName}</span>
                  <span class="rr-scanner-result-arrow">→</span>
                  <span class="rr-scanner-result-fiction">{r.fictionTitle}</span>
                  <span class="rr-scanner-result-author">by {r.authorName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {summary && !summary.error && (
          <div class="rr-scanner-summary rr-scanner-summary-success">
            Scan complete! Found {summary.found} shoutout(s).
            {checkingSwaps && <span> Checking for return swaps...</span>}
          </div>
        )}

        {summary?.error && (
          <div class="rr-scanner-summary rr-scanner-summary-error">
            Error: {summary.error}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ScannerModal;
