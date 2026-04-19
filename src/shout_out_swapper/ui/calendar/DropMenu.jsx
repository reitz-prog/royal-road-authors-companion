// Drop conflict menu - shows options when dropping on a date with existing shoutouts
import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';

export function DropMenu({ isOpen, position, onSelect, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      class="rr-drop-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
    >
      <div class="rr-drop-menu-title">This date has shoutouts</div>
      <button
        class="rr-drop-menu-item"
        onClick={() => onSelect('switch')}
      >
        <i class="fa fa-exchange"></i>
        <span class="rr-drop-menu-label">Switch</span>
        <span class="rr-drop-menu-desc">Swap dates with existing</span>
      </button>
      <button
        class="rr-drop-menu-item"
        onClick={() => onSelect('shift')}
      >
        <i class="fa fa-arrow-right"></i>
        <span class="rr-drop-menu-label">Shift</span>
        <span class="rr-drop-menu-desc">Move existing to next day</span>
      </button>
      <button
        class="rr-drop-menu-item"
        onClick={() => onSelect('stack')}
      >
        <i class="fa fa-layer-group"></i>
        <span class="rr-drop-menu-label">Stack</span>
        <span class="rr-drop-menu-desc">Add both on same date</span>
      </button>
      <button
        class="rr-drop-menu-item rr-drop-menu-cancel"
        onClick={onClose}
      >
        Cancel
      </button>
    </div>
  );
}

export default DropMenu;
