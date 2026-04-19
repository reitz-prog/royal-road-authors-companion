import { h } from 'preact';
import { Overlay } from '../overlay/Overlay.jsx';

/**
 * Base Modal component - uses RR's native classes only (no goober)
 * Feature-specific modals pass className for dimensions
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className = '',
  showClose = true
}) {
  return (
    <Overlay isOpen={isOpen} onClose={onClose}>
      <div class={`rr-modal card card-custom ${className}`}>
        <div class="rr-modal-header card-header">
          <div class="card-title">
            <span class="card-label rr-modal-title">{title}</span>
          </div>
          {showClose && (
            <div class="card-toolbar">
              <button type="button" class="btn btn-sm btn-icon rr-modal-close" onClick={onClose}>
                &times;
              </button>
            </div>
          )}
        </div>

        <div class="rr-modal-body card-body">
          {children}
        </div>

        {footer && (
          <div class="rr-modal-footer card-footer">
            {footer}
          </div>
        )}
      </div>
    </Overlay>
  );
}
