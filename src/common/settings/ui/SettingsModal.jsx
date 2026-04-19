// Settings modal component
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Modal } from '../../ui/modal/Modal.jsx';
import { DangerConfirmDialog } from '../../ui/dialog/Dialog.jsx';
import { Select, Radio, Button } from '../../ui/components/index.jsx';
import { getSettings, saveSettings } from '../core.js';
import { log } from '../../logging/core.js';
import * as db from '../../db/proxy.js';

const logger = log.scope('settings');

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
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleSave = () => {
    saveSettings({ placement, timezone });
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
        className="rr-modal-small"
        footer={footer}
      >
        <div class="rr-settings-form">
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
    </>
  );
}
