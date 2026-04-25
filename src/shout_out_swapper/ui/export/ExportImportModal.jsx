// Export/Import Modal component
import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { Modal } from '../../../common/ui/modal/Modal.jsx';
import { exportToExcel, importFromExcel, downloadEmptyTemplate, getImportState } from '../../services/exportImport.js';
import { getSetting } from '../../../common/settings/core.js';
import { log } from '../../../common/logging/core.js';
import * as db from '../../../common/db/proxy.js';
import { ThemedSelect } from '../../../common/ui/components/index.jsx';

const logger = log.scope('export-import-modal');

export function ExportImportModal({ isOpen, onClose, onComplete, currentFictionId }) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingGuild, setImportingGuild] = useState(false);
  const [guildStatus, setGuildStatus] = useState('');
  const [guildLog, setGuildLog] = useState([]);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('excel');
  const fileInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const [myFictions, setMyFictions] = useState([]);
  const [csvTargetFictionId, setCsvTargetFictionId] = useState('');
  const pollIntervalRef = useRef(null);

  const writersGuildEnabled = getSetting('writersGuildEnabled');

  // Load the user's fictions so the CSV importer can offer a target-fiction
  // dropdown. Loaded on modal open (cheap read; bounded by how many fictions
  // the user has).
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const fictions = await db.getAll('myFictions') || [];
        setMyFictions(fictions);
        // Default the CSV target to the current fiction context if set.
        if (currentFictionId) setCsvTargetFictionId(String(currentFictionId));
      } catch (err) {
        logger.warn('Could not load myFictions for CSV target', err);
      }
    })();
  }, [isOpen, currentFictionId]);

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
        } else if (state.status === 'complete' && importing) {
          // Only show result if we were actively importing
          setImporting(false);
          setProgress(null);
          setResult({
            type: 'import',
            message: `Imported ${state.imported} shoutouts`,
            details: state
          });
          onComplete?.();
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

  const handleDownloadTemplate = async () => {
    setError(null);
    setResult(null);
    try {
      const filename = await downloadEmptyTemplate();
      setResult({ type: 'template', message: `Template saved as ${filename}` });
    } catch (err) {
      logger.error('Template download failed', err);
      setError(`Template download failed: ${err.message}`);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleCsvImportClick = () => {
    csvInputRef.current?.click();
  };

  const doImport = async (file, opts = {}) => {
    setImporting(true);
    setError(null);
    setResult(null);
    setProgress({ current: 0, total: 0, imported: 0, duplicates: 0, skipped: 0 });

    try {
      await importFromExcel(file, opts);
      // Progress updates via polling
    } catch (err) {
      logger.error('Import failed', err);
      setError(`Import failed: ${err.message}`);
      setImporting(false);
      setProgress(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    doImport(file);
  };

  const handleCsvSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Look up the chosen fiction's title so the sheet gets renamed to
    // something the background importer recognises. Empty selection →
    // Unscheduled.
    let csvSheetName = 'Unscheduled';
    if (csvTargetFictionId) {
      const f = myFictions.find(x => String(x.fictionId) === String(csvTargetFictionId));
      if (f?.title) csvSheetName = f.title.substring(0, 31).replace(/[\\/*?:\[\]]/g, '');
    }
    doImport(file, { csvSheetName });
  };

  const handleWritersGuildImport = async () => {
    setImportingGuild(true);
    setError(null);
    setResult(null);
    setGuildStatus('Starting…');
    setGuildLog([{ ts: Date.now(), step: 'Starting…' }]);

    const pushLog = (step) => {
      setGuildStatus(step);
      setGuildLog((log) => [...log, { ts: Date.now(), step }]);
    };

    // Listen for progress events broadcast by background while the import
    // runs. Background does the API fetch directly (cookies are first-party
    // for the SW once host_permissions covers the domain).
    const listener = (message) => {
      if (message?.type === 'rrwgImportProgress') {
        pushLog(message.step || '…');
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    chrome.runtime.sendMessage({ type: 'importFromWritersGuild' }, (response) => {
      chrome.runtime.onMessage.removeListener(listener);
      setImportingGuild(false);

      if (chrome.runtime.lastError) {
        pushLog(`Error: ${chrome.runtime.lastError.message}`);
        setError(chrome.runtime.lastError.message);
        return;
      }

      if (response?.needsAuth) {
        pushLog('Not signed in to RRWG — opening sign-in tab.');
        setError('Not signed in to Writers Guild. A tab is opening — sign in there, then click Import again.');
        chrome.runtime.sendMessage({ type: 'openTab', url: 'https://rrwritersguild.com/shoutouts' });
        return;
      }

      if (response?.success) {
        pushLog(`Done — ${response.imported} imported, ${response.duplicates} duplicates, ${response.skipped} skipped.`);
        setResult({
          type: 'guild',
          message: `Imported ${response.imported} shoutouts from Writers Guild`,
          details: {
            imported: response.imported,
            duplicates: response.duplicates,
            skipped: response.skipped,
            errors: response.errors || [],
          },
        });
        onComplete?.();
      } else {
        pushLog(`Error: ${response?.error || 'Unknown'}`);
        setError(response?.error || 'Import failed');
      }
    });
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
      className="rr-modal-export-import"
    >
      <div class="rr-export-import-layout">
        <nav class="rr-export-import-tabs">
          <button
            class={`rr-export-import-tab ${activeTab === 'excel' ? 'active' : ''}`}
            onClick={() => setActiveTab('excel')}
          >
            Excel
          </button>
          <button
            class={`rr-export-import-tab ${activeTab === 'csv' ? 'active' : ''}`}
            onClick={() => setActiveTab('csv')}
          >
            CSV
          </button>
          {writersGuildEnabled && (
            <button
              class={`rr-export-import-tab ${activeTab === 'guild' ? 'active' : ''}`}
              onClick={() => setActiveTab('guild')}
            >
              Writers Guild
            </button>
          )}
        </nav>

        <div class="rr-export-import-content">
          {activeTab === 'excel' && (
            <>
              <div class="rr-export-section">
                <h5>Export to Excel</h5>
                <p class="text-muted">
                  Download everything as an <code>.xlsx</code>: one sheet per fiction
                  for scheduled shoutouts, plus <strong>My Codes</strong> and
                  <strong> Contacts</strong> sheets so the whole library is portable.
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

              <div class="rr-import-section">
                <h5>Import from Excel</h5>
                <p class="text-muted">
                  Import an <code>.xlsx</code> / <code>.xls</code> workbook. Sheet
                  names matching your fiction titles attribute their rows to that
                  fiction; sheets named <strong>My Codes</strong> and
                  <strong> Contacts</strong> are imported into those stores. Only{' '}
                  <strong>Code</strong> is required for shoutouts (and{' '}
                  <strong>My Codes</strong>); only <strong>Author</strong> for{' '}
                  <strong>Contacts</strong>.
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
                    <><i class="fa fa-file-excel-o"></i> Import Excel</>
                  )}
                </button>
              </div>

              <hr />

              <div class="rr-template-section">
                <h5>Empty template</h5>
                <p class="text-muted">
                  Download a blank <code>.xlsx</code> with one sheet per fiction
                  (just <strong>Date</strong> and <strong>Code</strong>) plus empty
                  <strong> My Codes</strong> and <strong>Contacts</strong> sheets.
                  Fill it in, then import above.
                </p>
                <button
                  class="btn btn-outline-primary"
                  onClick={handleDownloadTemplate}
                  disabled={exporting || importing}
                >
                  <i class="fa fa-file-excel-o"></i> Download empty template
                </button>
              </div>
            </>
          )}

          {activeTab === 'csv' && (
            <div class="rr-import-section">
              <h5>Import from CSV</h5>
              <p class="text-muted">
                Import a single <code>.csv</code> file. Required columns:{' '}
                <strong>Date</strong> and <strong>Code</strong>. CSVs have no sheet
                name, so pick which fiction the rows should be attributed to.
              </p>
              <div class="rr-csv-target-row">
                <label class="rr-csv-target-label" for="rr-csv-target">Attribute rows to:</label>
                <ThemedSelect
                  id="rr-csv-target"
                  size="sm"
                  value={csvTargetFictionId}
                  onChange={(e) => setCsvTargetFictionId(e.target.value)}
                >
                  <option value="">Unscheduled (no fiction)</option>
                  {myFictions.map(f => (
                    <option key={f.fictionId} value={String(f.fictionId)}>
                      {f.title || `Fiction ${f.fictionId}`}
                    </option>
                  ))}
                </ThemedSelect>
              </div>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleCsvSelect}
              />
              <button
                class="btn btn-secondary"
                onClick={handleCsvImportClick}
                disabled={exporting || importing}
              >
                {importing ? (
                  <><i class="fa fa-spinner fa-spin"></i> Importing...</>
                ) : (
                  <><i class="fa fa-file-text-o"></i> Import CSV</>
                )}
              </button>
            </div>
          )}

          {activeTab === 'guild' && writersGuildEnabled && (
            <div class="rr-import-section">
              <h5>Import from Writers Guild</h5>
              <p class="text-muted">
                Import your scheduled shoutouts from rrwritersguild.com.
                Make sure you're logged in first.
              </p>
              <button
                class="btn btn-secondary"
                onClick={handleWritersGuildImport}
                disabled={exporting || importing || importingGuild}
              >
                {importingGuild ? (
                  <><i class="fa fa-spinner fa-spin"></i> Importing...</>
                ) : (
                  <><i class="fa fa-cloud-download"></i> Import from Writers Guild</>
                )}
              </button>
              {(importingGuild || guildLog.length > 0) && (
                <div class="rr-guild-progress mt-2">
                  {importingGuild && guildStatus && (
                    <div class="rr-guild-status"><i class="fa fa-circle-notch fa-spin"></i> {guildStatus}</div>
                  )}
                  {guildLog.length > 0 && (
                    <details class="rr-guild-log">
                      <summary>Log ({guildLog.length})</summary>
                      <ul>
                        {guildLog.map((entry, i) => (
                          <li key={i}>
                            <span class="rr-guild-log-time">
                              {new Date(entry.ts).toLocaleTimeString()}
                            </span>
                            {' '}
                            {entry.step}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Shared progress bar for whichever importer is running */}
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

          {error && (
            <div class="alert alert-danger mt-3">
              {error}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ExportImportModal;
