// My Codes component - separate container above contacts
import { h } from 'preact';
import { useState } from 'preact/hooks';

export function MyCodes({
  myCodes = [],
  myFictions = [],
  onMyCodeAdd,
  onMyCodeEdit,
  onMyCodeCopy,
  onMyCodeDelete
}) {
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (code) => {
    if (code?.code) {
      navigator.clipboard.writeText(code.code);
      setCopiedId(code.id);
      setTimeout(() => setCopiedId(null), 1500);
      onMyCodeCopy?.(code);
    }
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
            const coverUrl = fiction?.coverUrl;
            return (
              <div
                key={c.id}
                class="rr-mycode-item"
                onClick={() => onMyCodeEdit?.(c.id)}
              >
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
