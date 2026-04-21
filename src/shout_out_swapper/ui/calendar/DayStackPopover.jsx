// Day Stack Popover - Shows all shoutouts for a day with drag-to-reorder
import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { CalendarCard } from './CalendarCard.jsx';
import { log } from '../../../common/logging/core.js';

const logger = log.scope('day-stack');

export function DayStackPopover({
  isOpen,
  date,
  shoutouts = [],
  position,
  onClose,
  onShoutoutClick,
  onReorder
}) {
  const [items, setItems] = useState([]);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const popoverRef = useRef(null);

  // Initialize items when shoutouts change or popover opens
  useEffect(() => {
    if (shoutouts.length > 0) {
      // Sort by existing order if available
      const sorted = [...shoutouts].sort((a, b) => {
        const orderA = a.schedules?.find(s => s.date === date)?.order || 999;
        const orderB = b.schedules?.find(s => s.date === date)?.order || 999;
        return orderA - orderB;
      });
      setItems(sorted);
      logger.info('Popover items set', { count: sorted.length, date });
    }
  }, [shoutouts, date, isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose?.();
      }
    };

    // Delay to prevent immediate close
    setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 100);

    return () => document.removeEventListener('click', handleClick);
  }, [isOpen, onClose]);

  // Only log when state actually changes — otherwise every parent re-render
  // (every 500ms during a scan poll) would spam this line.
  const lastSigRef = useRef('');
  const sig = `${isOpen}|${shoutouts.length}|${items.length}`;
  if (sig !== lastSigRef.current) {
    logger.info('Popover render', { isOpen, shoutoutsCount: shoutouts.length, itemsCount: items.length });
    lastSigRef.current = sig;
  }

  if (!isOpen || shoutouts.length === 0) return null;

  // Use shoutouts directly if items not yet populated
  const displayItems = items.length > 0 ? items : shoutouts;

  if (displayItems.length === 0) return null;

  const handleDragStart = (e, idx, shoutout) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Set shoutout ID and source date so it can be dropped on calendar days
    e.dataTransfer.setData('text/plain', shoutout.id.toString());
    e.dataTransfer.setData('application/x-stack-idx', idx.toString());
    e.dataTransfer.setData('application/x-source-date', date); // Pass the date we're dragging from
    e.currentTarget.classList.add('rr-dragging');
  };

  const handleDragEnd = async (e) => {
    e.currentTarget.classList.remove('rr-dragging');

    // Check if dropped outside popover (on calendar)
    const droppedOutside = !popoverRef.current?.contains(document.elementFromPoint(e.clientX, e.clientY));

    if (droppedOutside) {
      // Let the calendar handle this drop, close the popover
      logger.info('Dragged out of popover');
      onClose?.();
    } else if (draggedIdx !== null) {
      // Reorder within popover - save new order
      const newOrder = items.map((item, idx) => ({
        shoutoutId: item.id,
        order: idx + 1
      }));

      logger.info('Saving new order', { date, newOrder });
      await onReorder?.(date, newOrder);
    }

    setDraggedIdx(null);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;

    // Reorder items in state
    const newItems = [...items];
    const draggedItem = newItems[draggedIdx];
    newItems.splice(draggedIdx, 1);
    newItems.splice(idx, 0, draggedItem);
    setItems(newItems);
    setDraggedIdx(idx);
  };

  const handleCardClick = (e, shoutout) => {
    e.stopPropagation();
    const isArchived = shoutout.schedules?.some(s => s.date === date && s.chapter);
    onShoutoutClick?.(shoutout, date, isArchived ? 'view' : 'edit');
    onClose?.();
  };

  // Position the popover
  const style = {
    position: 'fixed',
    left: `${position?.x || 0}px`,
    top: `${position?.y || 0}px`,
    zIndex: 10000
  };

  return (
    <div class="rr-day-stack-popover" style={style} ref={popoverRef}>
      <div class="rr-day-stack-header">
        <span class="rr-day-stack-date">{date}</span>
        <span class="rr-day-stack-hint">Drag to reorder</span>
        <button class="rr-day-stack-close" onClick={onClose}>&times;</button>
      </div>
      <div class="rr-day-stack-items">
        {displayItems.map((shoutout, idx) => {
          const schedule = shoutout.schedules?.find(s => s.date === date);
          const isArchived = schedule?.chapter;
          const order = idx + 1;

          return (
            <div
              key={shoutout.id}
              class={`rr-day-stack-slot ${draggedIdx === idx ? 'rr-dragging' : ''}`}
              draggable={!isArchived}
              onDragStart={(e) => handleDragStart(e, idx, shoutout)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, idx)}
            >
              <span class="rr-day-stack-order">{order}</span>
              <CalendarCard
                shoutout={shoutout}
                isArchived={isArchived}
                sourceDate={date}
                onClick={(e) => handleCardClick(e, shoutout)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DayStackPopover;
