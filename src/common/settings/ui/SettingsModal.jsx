// Settings modal component
import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { Modal } from '../../ui/modal/Modal.jsx';
import { DangerConfirmDialog } from '../../ui/dialog/Dialog.jsx';
import { Select, Radio, Button } from '../../ui/components/index.jsx';
import { getSettings, saveSettings } from '../core.js';
import { log } from '../../logging/core.js';
import * as db from '../../db/proxy.js';

const logger = log.scope('settings');

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC (GMT+0)' },
  { value: 'America/New_York', label: 'Eastern US (GMT-5/-4)' },
  { value: 'America/Chicago', label: 'Central US (GMT-6/-5)' },
  { value: 'America/Denver', label: 'Mountain US (GMT-7/-6)' },
  { value: 'America/Los_Angeles', label: 'Pacific US (GMT-8/-7)' },
  { value: 'Europe/London', label: 'London (GMT+0/+1)' },
  { value: 'Europe/Paris', label: 'Paris (GMT+1/+2)' },
  { value: 'Europe/Berlin', label: 'Berlin (GMT+1/+2)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (GMT+8)' },
  { value: 'Asia/Singapore', label: 'Singapore (GMT+8)' },
  { value: 'Asia/Manila', label: 'Manila (GMT+8)' },
  { value: 'Australia/Sydney', label: 'Sydney (GMT+10/+11)' },
];

export function SettingsModal({ isOpen, onClose, onClearAll }) {
  const settings = getSettings();

  const [placement, setPlacement] = useState(settings.placement);
  const [timezone, setTimezone] = useState(settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [writersGuildEnabled, setWritersGuildEnabled] = useState(settings.writersGuildEnabled || false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteDbConfirm, setShowDeleteDbConfirm] = useState(false);
  const [storageUsage, setStorageUsage] = useState(null);
  const [activeTab, setActiveTab] = useState('general');

  // Fetch storage usage stats (chrome.storage.local total + per-key, plus
  // IndexedDB approx via navigator.storage.estimate which reports across the
  // whole extension origin — close enough for "how much disk does this use").
  const refreshStorageUsage = useCallback(async () => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local?.getBytesInUse) return;

      const total = await chrome.storage.local.getBytesInUse(null);
      const quota = chrome.storage.local.QUOTA_BYTES;
      const trackedKeys = ['rrLogs', 'scanState', 'importState', 'swapCheckState', 'checkAllSwapsState'];
      const byKey = {};
      await Promise.all(
        trackedKeys.map(async (k) => {
          byKey[k] = await chrome.storage.local.getBytesInUse(k);
        })
      );

      let estimate = null;
      try {
        if (navigator.storage?.estimate) {
          estimate = await navigator.storage.estimate();
        }
      } catch (e) { /* ignore */ }

      setStorageUsage({ total, quota, byKey, estimate });
    } catch (err) {
      logger.warn('Failed to read storage usage', err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    refreshStorageUsage();
  }, [isOpen, refreshStorageUsage]);

  const handleSave = () => {
    saveSettings({ placement, timezone, writersGuildEnabled });
    logger.info('Settings saved');
    onClose();
  };

  const handleClearAll = async () => {
    logger.info('Clearing all data');
    await db.clearAll();
    logger.info('All data cleared');
    setShowClearConfirm(false);
    onClearAll?.();
    onClose();
  };

  const handleDeleteDatabase = async () => {
    logger.info('Deleting database and localStorage');
    setShowDeleteDbConfirm(false);

    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (err) {
      logger.warn('Failed to clear storage', err);
    }

    const deleteRequest = indexedDB.deleteDatabase('rr-companion');
    deleteRequest.onsuccess = () => {
      logger.info('Database deleted');
      window.location.reload();
    };
    deleteRequest.onerror = () => {
      logger.error('Failed to delete database');
    };
  };

  const handleDownloadLogs = async () => {
    try {
      const version = chrome.runtime.getManifest().version;
      const logsText = await log.getLogsAsText();
      const header = `# Author's Companion logs\n# Version: ${version}\n# Exported: ${new Date().toISOString()}\n# User-Agent: ${navigator.userAgent}\n\n`;
      const blob = new Blob([header + logsText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rr-companion-v${version}-logs-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logger.info('Logs downloaded', { version });
    } catch (err) {
      logger.error('Failed to download logs', err);
    }
  };

  const footer = (
    <>
      <button class="btn btn-secondary" onClick={onClose}>
        Cancel
      </button>
      <button class="btn btn-primary" onClick={handleSave}>
        Save
      </button>
    </>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Settings"
        className="rr-modal-settings"
        footer={footer}
      >
        <div class="rr-settings-layout">
          <nav class="rr-settings-tabs">
            <button
              class={`rr-settings-tab ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              General
            </button>
            <button
              class={`rr-settings-tab ${activeTab === 'integrations' ? 'active' : ''}`}
              onClick={() => setActiveTab('integrations')}
            >
              Integrations
            </button>
            <button
              class={`rr-settings-tab ${activeTab === 'storage' ? 'active' : ''}`}
              onClick={() => setActiveTab('storage')}
            >
              Storage &amp; Logs
            </button>
            <button
              class={`rr-settings-tab rr-settings-tab-danger ${activeTab === 'danger' ? 'active' : ''}`}
              onClick={() => setActiveTab('danger')}
            >
              Danger Zone
            </button>
          </nav>

          <div class="rr-settings-form">
          {activeTab === 'general' && (
            <>
              <div class="rr-settings-group">
                <div class="rr-settings-label">Shoutout Placement</div>
                <div class="rr-settings-options">
                  <label class="rr-settings-radio">
                    <input
                      type="radio"
                      name="placement"
                      value="pre"
                      checked={placement === 'pre'}
                      onChange={() => setPlacement('pre')}
                    />
                    <span>Pre-chapter Author's Note</span>
                  </label>
                  <label class="rr-settings-radio">
                    <input
                      type="radio"
                      name="placement"
                      value="post"
                      checked={placement === 'post'}
                      onChange={() => setPlacement('post')}
                    />
                    <span>Post-chapter Author's Note</span>
                  </label>
                </div>
              </div>

              <div class="rr-settings-group">
                <div class="rr-settings-label">Timezone</div>
                <p class="rr-settings-description">
                  Used for displaying dates in analytics and calendar.
                </p>
                <Select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  <optgroup label="Common Timezones">
                    {TIMEZONE_OPTIONS.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Your Timezone">
                    <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                      {Intl.DateTimeFormat().resolvedOptions().timeZone} (Local)
                    </option>
                  </optgroup>
                </Select>
              </div>
            </>
          )}

          {activeTab === 'integrations' && (
            <>
              <div class="rr-settings-group">
                <label class="rr-settings-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={writersGuildEnabled}
                    onChange={(e) => setWritersGuildEnabled(e.target.checked)}
                  />
                  <span>Enable Writers Guild Integration</span>
                </label>
                <p class="rr-settings-description">
                  Import shoutouts from rrwritersguild.com/shoutouts/dashboard
                </p>
              </div>

              <div class="rr-settings-group">
                <label class="rr-settings-label rr-settings-label-disabled">
                  <input type="checkbox" disabled />
                  <span>Notify author on swap</span>
                  <span class="rr-settings-badge">Coming Soon</span>
                </label>
                <p class="rr-settings-description">
                  Automatically notify the other author via Discord when a swap is completed.
                </p>
              </div>
            </>
          )}

          {activeTab === 'storage' && (
            <>
              <div class="rr-settings-group">
                <div class="rr-settings-label">Storage usage</div>
            <p class="rr-settings-description">
              How much of the extension's quota is used. Logs are by far the biggest consumer.
            </p>
            {storageUsage ? (
              <div class="rr-storage-usage">
                <div class="rr-storage-total">
                  <strong>{formatBytes(storageUsage.total)}</strong>
                  {storageUsage.quota ? <> / {formatBytes(storageUsage.quota)}</> : null}
                  {storageUsage.quota ? (
                    <span class="rr-storage-pct">
                      {' '}({Math.round((storageUsage.total / storageUsage.quota) * 100)}%)
                    </span>
                  ) : null}
                </div>
                {storageUsage.quota ? (
                  <div class="rr-storage-bar">
                    <div
                      class="rr-storage-bar-fill"
                      style={{ width: `${Math.min(100, (storageUsage.total / storageUsage.quota) * 100)}%` }}
                    />
                  </div>
                ) : null}
                <ul class="rr-storage-breakdown">
                  {Object.entries(storageUsage.byKey)
                    .sort((a, b) => b[1] - a[1])
                    .map(([key, bytes]) => (
                      <li key={key}>
                        <span class="rr-storage-key">{key}</span>
                        <span class="rr-storage-bytes">{formatBytes(bytes)}</span>
                      </li>
                    ))}
                </ul>
                {storageUsage.estimate?.usage != null && (
                  <p class="rr-settings-description" style={{ marginTop: '0.5rem' }}>
                    Total disk (incl. IndexedDB):{' '}
                    <strong>{formatBytes(storageUsage.estimate.usage)}</strong>
                    {storageUsage.estimate.quota ? <> / {formatBytes(storageUsage.estimate.quota)}</> : null}
                  </p>
                )}
              </div>
            ) : (
              <p class="rr-settings-description">Loading…</p>
            )}
            <button
              class="btn btn-sm btn-outline-warning"
              style={{ marginTop: '0.5rem' }}
              onClick={async () => {
                await log.clearLogs();
                logger.info('Logs cleared');
                refreshStorageUsage();
              }}
            >
              Clear logs
            </button>
          </div>

          <div class="rr-settings-group">
            <div class="rr-settings-label">Debug</div>
            <p class="rr-settings-description">
              Download logs for troubleshooting.
            </p>
            <button
              class="btn btn-sm btn-outline-secondary"
              style={{ marginTop: '0.5rem' }}
              onClick={handleDownloadLogs}
            >
              Download Logs
            </button>
          </div>
            </>
          )}

          {activeTab === 'danger' && (
            <div class="rr-settings-group rr-settings-danger">
              <div class="rr-settings-label">Danger Zone</div>
              <p class="rr-settings-description">
                Clear all data including contacts, shoutouts, and archives. Cannot be undone.
              </p>
              <button
                class="btn btn-sm btn-outline-danger"
                style={{ marginTop: '0.5rem' }}
                onClick={() => setShowClearConfirm(true)}
              >
                Clear All Data
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                style={{ marginTop: '0.5rem', marginLeft: '0.5rem' }}
                onClick={() => setShowDeleteDbConfirm(true)}
              >
                Delete Database
              </button>
            </div>
          )}
          </div>
        </div>
      </Modal>

      <DangerConfirmDialog
        isOpen={showClearConfirm}
        onConfirm={handleClearAll}
        onCancel={() => setShowClearConfirm(false)}
        title="Clear All Data"
        message={`
          <p><strong>Are you sure you want to delete all data?</strong></p>
          <p>This will permanently delete:</p>
          <ul style="margin: 0.5rem 0; padding-left: 1.5rem;">
            <li>All contacts</li>
            <li>All shoutouts and schedules</li>
            <li>All archived entries</li>
            <li>All saved codes</li>
          </ul>
          <p style="color: #dc3545;"><strong>This action cannot be undone.</strong></p>
        `}
        confirmLabel="Delete Everything"
      />

      <DangerConfirmDialog
        isOpen={showDeleteDbConfirm}
        onConfirm={handleDeleteDatabase}
        onCancel={() => setShowDeleteDbConfirm(false)}
        title="Delete Database"
        message={`
          <p><strong>Are you sure you want to delete the entire database?</strong></p>
          <p>This will completely remove the IndexedDB database and reload the page.</p>
          <p>Use this if you're experiencing database corruption issues.</p>
          <p style="color: #dc3545;"><strong>This action cannot be undone.</strong></p>
        `}
        confirmLabel="Delete Database"
      />
    </>
  );
}
