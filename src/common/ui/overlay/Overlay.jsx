import { h } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useCallback } from 'preact/hooks';

// Inject overlay styles to document head (like V2)
let stylesInjected = false;
function injectOverlayStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .rr-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.5) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 10000 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .rr-overlay-container {
      max-height: 90vh;
      max-width: 90vw;
    }
  `;
  document.head.appendChild(style);
}

export function Overlay({
  children,
  isOpen,
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = true
}) {
  useEffect(() => {
    injectOverlayStyles();
  }, []);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose?.();
    }
  }, [closeOnBackdrop, onClose]);

  if (!isOpen) return null;

  // Portal to document.body like V2 does
  return createPortal(
    <div class="rr-overlay" onClick={handleBackdropClick}>
      <div class="rr-overlay-container">{children}</div>
    </div>,
    document.body
  );
}
