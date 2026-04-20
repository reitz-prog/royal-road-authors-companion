// My Codes component - separate container above contacts
import { h } from 'preact';
import { useState } from 'preact/hooks';

export function MyCodes({
  myCodes = [],
  myFictions = [],
  onMyCodeAdd,
  onMyCodeEdit,
  onMyCodeCopy,
  onMyCodeDelete,
  onMyCodeReorder
}) {
  const [copiedId, setCopiedId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const handleCopy = (code) => {
    if (code?.code) {
      navigator.clipboard.writeText(code.code);
      setCopiedId(code.id);
      setTimeout(() => setCopiedId(null), 1500);
      onMyCodeCopy?.(code);
    }
  };

  const handleDragStart = (e, code) => {
    setDraggedId(code.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', code.id);
  };

  const handleDragOver = (e, code) => {
    e.preventDefault();
    if (draggedId && draggedId !== code.id) {
      setDragOverId(code.id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e, targetCode) => {
    e.preventDefault();
    if (draggedId && draggedId !== targetCode.id) {
      // Reorder: move dragged item to target position
      const draggedIndex = myCodes.findIndex(c => c.id === draggedId);
      const targetIndex = myCodes.findIndex(c => c.id === targetCode.id);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newOrder = [...myCodes];
        const [removed] = newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, removed);
        onMyCodeReorder?.(newOrder);
      }
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div class="rr-mycodes-container">
      <div class="rr-mycodes-header">
        <span class="rr-mycodes-title">My Shoutout Codes</span>
        <button class="btn btn-sm btn-light" onClick={onMyCodeAdd} title="Add code">
          <i class="fa fa-plus"></i> Add
        </button>
      </div>
      <div class="rr-mycodes-list">
        {myCodes.length === 0 ? (
          <div class="rr-mycodes-empty">No codes yet. Click Add to create one.</div>
        ) : (
          myCodes.map(c => {
            const fiction = myFictions.find(f => String(f.fictionId) === String(c.fictionId));
            const displayName = c.name || fiction?.title || 'My Code';
            // Extract image directly from stored code HTML
            const imgMatch = c.code?.match(/<img[^>]+src=["']([^"']+)["']/i);
            const coverUrl = imgMatch?.[1] || fiction?.coverUrl;
            const isDragging = draggedId === c.id;
            const isDragOver = dragOverId === c.id;
            return (
              <div
                key={c.id}
                class={`rr-mycode-item ${isDragging ? 'rr-mycode-dragging' : ''} ${isDragOver ? 'rr-mycode-dragover' : ''}`}
                onClick={() => onMyCodeEdit?.(c.id)}
                draggable
                onDragStart={(e) => handleDragStart(e, c)}
                onDragOver={(e) => handleDragOver(e, c)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, c)}
                onDragEnd={handleDragEnd}
              >
                <div class="rr-mycode-drag-handle">
                  <i class="fa fa-grip-vertical"></i>
                </div>
                {coverUrl ? (
                  <img src={coverUrl} alt="" class="rr-mycode-cover" />
                ) : (
                  <div class="rr-mycode-cover rr-mycode-cover-placeholder">
                    <i class="fa fa-book"></i>
                  </div>
                )}
                <div class="rr-mycode-info">
                  <span class="rr-mycode-name">{displayName}</span>
                  {c.name && fiction?.title && (
                    <span class="rr-mycode-fiction">{fiction.title}</span>
                  )}
                </div>
                <div class="rr-mycode-actions">
                  <button
                    class="btn btn-sm btn-light rr-mycode-copy"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(c);
                    }}
                    title="Copy code"
                  >
                    <i class={`fa ${copiedId === c.id ? 'fa-check' : 'fa-copy'}`}></i>
                    {copiedId === c.id ? ' Copied!' : ' Copy'}
                  </button>
                  <button
                    class="btn btn-sm btn-light rr-mycode-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMyCodeDelete?.(c.id);
                    }}
                    title="Delete"
                  >
                    <i class="fa fa-trash"></i>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default MyCodes;
