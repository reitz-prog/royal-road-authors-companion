import { h } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { Modal } from '../../../common/ui/modal/Modal.jsx';
import { Select, Checkbox, Button } from '../../../common/ui/components/index.jsx';
import { startFullScan, getScanState, cancelScan, onScanProgress, checkAllSwaps } from '../../services/scanner.js';
import { log } from '../../../common/logging/core.js';
import './ScannerModal.css';

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

  // Update selected fiction when props change
  useEffect(() => {
    if (isOpen) {
      setSelectedFictionId(currentFictionId || myFictions[0]?.fictionId || '');
    }
  }, [isOpen, currentFictionId, myFictions]);

  // Keep ref in sync with state
  useEffect(() => {
    checkSwapsAfterRef.current = checkSwapsAfter;
  }, [checkSwapsAfter]);

  // Poll for scan state updates
  const pollScanState = useCallback(async () => {
    try {
      const state = await getScanState();

      if (state.status === 'scanning') {
        setScanning(true);
        setProgress({
          current: state.current || 0,
          total: state.total || 0,
          chapter: state.currentTitle || '',
          phase: state.phase || 'download',
          shoutoutsFound: state.shoutoutsFound || 0
        });
      } else if (state.status === 'complete') {
        setScanning(false);
        setSummary({
          scanned: state.total || 0,
          found: state.shoutoutsFound || 0,
          fictionTitle: state.fictionTitle || ''
        });
        setProgress(null);
        stopPolling();
        if (onScanComplete) onScanComplete();

        // Check swaps if enabled
        if (checkSwapsAfterRef.current && state.shoutoutsFound > 0) {
          setCheckingSwaps(true);
          checkAllSwaps().finally(() => setCheckingSwaps(false));
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

  const handleScan = useCallback(async () => {
    if (!selectedFictionId) return;

    setScanning(true);
    setProgress({ current: 0, total: 0, chapter: 'Starting...', phase: 'download' });
    setResults([]);
    setSummary(null);

    try {
      const response = await startFullScan(selectedFictionId);

      if (response.started) {
        logger.info('Scan started');
        startPolling();
      } else {
        logger.warn('Scan not started', response.reason);
        setSummary({ error: response.reason || 'Failed to start scan' });
        setScanning(false);
      }
    } catch (err) {
      logger.error('Failed to start scan', err);
      setSummary({ error: err.message });
      setScanning(false);
    }
  }, [selectedFictionId, startPolling]);

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
        <div class="rr-scanner-fiction-select">
          <label class="rr-modal-label">Select fiction to scan:</label>
          <Select
            value={selectedFictionId}
            onChange={(e) => setSelectedFictionId(e.target.value)}
            disabled={scanning}
          >
            <option value="">Select a fiction...</option>
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
