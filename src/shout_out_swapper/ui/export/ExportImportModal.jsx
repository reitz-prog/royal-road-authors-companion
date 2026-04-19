// Export/Import Modal component
import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { Modal } from '../../../common/ui/modal/Modal.jsx';
import { exportToExcel, importFromExcel, getImportState } from '../../services/exportImport.js';
import { log } from '../../../common/logging/core.js';

const logger = log.scope('export-import-modal');

export function ExportImportModal({ isOpen, onClose, onComplete }) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Poll for import progress when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const checkProgress = async () => {
      try {
        const state = await getImportState();

        if (state.status === 'importing') {
          setImporting(true);
          setProgress({
            current: state.current || 0,
            total: state.total || 0,
            imported: state.imported || 0,
            duplicates: state.duplicates || 0,
            skipped: state.skipped || 0
          });
        } else if (state.status === 'complete') {
          setImporting(false);
          setProgress(null);
          setResult({
            type: 'import',
            message: `Imported ${state.imported} shoutouts`,
            details: state
          });
          onComplete?.();
          // Auto-close modal after showing success briefly
          setTimeout(() => {
            onClose();
          }, 1500);
        } else if (state.status === 'error') {
          setImporting(false);
          setProgress(null);
          setError(`Import failed: ${state.error}`);
        } else {
          setImporting(false);
        }
      } catch (err) {
        logger.warn('Could not get import state', err);
      }
    };

    // Check immediately
    checkProgress();

    // Poll every 500ms
    pollIntervalRef.current = setInterval(checkProgress, 500);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isOpen, onComplete]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setResult(null);

    try {
      const filename = await exportToExcel();
      setResult({ type: 'export', message: `Exported to ${filename}` });
    } catch (err) {
      logger.error('Export failed', err);
      setError(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setResult(null);
    setProgress({ current: 0, total: 0, imported: 0, duplicates: 0, skipped: 0 });

    try {
      // Start import in background - returns immediately
      await importFromExcel(file);
      // Progress will be updated via polling
    } catch (err) {
      logger.error('Import failed', err);
      setError(`Import failed: ${err.message}`);
      setImporting(false);
      setProgress(null);
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClose = () => {
    // Can close modal anytime - import runs in background
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Export / Import"
      className="rr-modal-medium"
    >
      <div class="rr-export-import-content">
        {/* Export Section */}
        <div class="rr-export-section">
          <h5>Export to Excel</h5>
          <p class="text-muted">
            Download all your scheduled shoutouts as an Excel file. Each of your fictions will be a separate sheet.
          </p>
          <button
            class="btn btn-primary"
            onClick={handleExport}
            disabled={exporting || importing}
          >
            {exporting ? (
              <><i class="fa fa-spinner fa-spin"></i> Exporting...</>
            ) : (
              <><i class="fa fa-download"></i> Export</>
            )}
          </button>
        </div>

        <hr />

        {/* Import Section */}
        <div class="rr-import-section">
          <h5>Import from Excel</h5>
          <p class="text-muted">
            Import shoutouts from an Excel file. Sheet names must match your fiction titles.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            class="btn btn-secondary"
            onClick={handleImportClick}
            disabled={exporting || importing}
          >
            {importing ? (
              <><i class="fa fa-spinner fa-spin"></i> Importing...</>
            ) : (
              <><i class="fa fa-upload"></i> Import</>
            )}
          </button>

          {/* Progress */}
          {progress && (
            <div class="rr-import-progress mt-3">
              <div class="progress">
                <div
                  class="progress-bar"
                  style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                />
              </div>
              <small class="text-muted">
                {progress.current} / {progress.total} rows processed
                ({progress.imported} imported, {progress.duplicates} duplicates, {progress.skipped} skipped)
              </small>
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div class={`alert alert-success mt-3`}>
            <strong>{result.message}</strong>
            {result.details && (
              <div class="mt-2">
                <small>
                  {result.details.imported} imported,
                  {result.details.duplicates} duplicates,
                  {result.details.skipped} skipped
                  {result.details.errors?.length > 0 && (
                    <>, {result.details.errors.length} errors</>
                  )}
                </small>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div class="alert alert-danger mt-3">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ExportImportModal;
