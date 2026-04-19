// Confirmation dialog component
import { h } from 'preact';
import { Overlay } from '../overlay/Overlay.jsx';

export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title = 'Confirm',
  message = 'Are you sure?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmStyle = 'primary',
  showCancel = true
}) {
  if (!isOpen) return null;

  return (
    <Overlay isOpen={isOpen} onClose={onCancel} closeOnBackdrop={showCancel}>
      <div class="rr-dialog card card-custom">
        <div class="rr-dialog-header card-header">
          <div class="card-title">
            <span class="card-label">{title}</span>
          </div>
        </div>
        <div class="rr-dialog-body card-body">
          <div class="rr-dialog-message" dangerouslySetInnerHTML={{ __html: message }} />
        </div>
        <div class="rr-dialog-footer card-footer">
          {showCancel && (
            <button class="btn btn-secondary" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button class={`btn btn-${confirmStyle}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function DangerConfirmDialog(props) {
  return <ConfirmDialog {...props} confirmStyle="danger" />;
}
