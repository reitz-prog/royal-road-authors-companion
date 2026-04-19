// MyCode Modal - Add/Edit personal shoutout codes
import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { Modal } from '../../../common/ui/modal/Modal.jsx';
import { DangerConfirmDialog } from '../../../common/ui/dialog/Dialog.jsx';
import { log } from '../../../common/logging/core.js';

const logger = log.scope('mycode-modal');

export function MyCodeModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  myCode = null,
  myFictions = []
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [fictionId, setFictionId] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);
  const previewRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setCode(myCode?.code || '');
    setName(myCode?.name || '');
    setFictionId(myCode?.fictionId || myFictions[0]?.fictionId || '');
    setShowPreview(false);
    setCopied(false);
  }, [isOpen, myCode, myFictions]);

  const handleCopy = async () => {
    const actualCode = textareaRef.current?.value || code;
    if (!actualCode) return;

    try {
      await navigator.clipboard.writeText(actualCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logger.error('Copy failed', err);
    }
  };

  // Update preview when it becomes visible
  useEffect(() => {
    if (showPreview && previewRef.current && textareaRef.current) {
      previewRef.current.innerHTML = textareaRef.current.value;
    }
  }, [showPreview]);

  const handleSave = () => {
    const actualCode = textareaRef.current?.value || code;
    logger.info('Saving code', {
      hasRef: !!textareaRef.current,
      codeLength: actualCode?.length,
      name,
      fictionId,
      existingId: myCode?.id
    });
    onSave?.({
      id: myCode?.id,
      code: actualCode,
      name,
      fictionId
    });
    onClose();
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    onDelete?.(myCode?.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  const title = myCode ? 'Edit Code' : 'Add Code';
  const lineCount = code.split('\n').length;

  const footer = (
    <>
      {myCode && (
        <button class="btn btn-outline-danger me-auto" onClick={handleDeleteClick}>
          Delete
        </button>
      )}
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
        title={title}
        className="rr-modal-xlarge"
        footer={footer}
      >
        <div class="rr-modal-edit-layout">
          <div class="rr-modal-edit-code">
            <div class="rr-modal-code-header">
              <label class="rr-modal-label">Shoutout Code</label>
              <div class="rr-modal-code-toggles">
                <button
                  class={`rr-toggle-btn ${copied ? 'active' : ''}`}
                  onClick={handleCopy}
                  title={copied ? 'Copied!' : 'Copy to clipboard'}
                >
                  <i class={`fa ${copied ? 'fa-check' : 'fa-clipboard'}`}></i>
                </button>
                <button
                  class={`rr-toggle-btn ${showPreview ? 'active' : ''}`}
                  onClick={() => {
                    const newShowPreview = !showPreview;
                    setShowPreview(newShowPreview);
                    if (newShowPreview) {
                      const val = textareaRef.current?.value || code;
                      setTimeout(() => {
                        if (previewRef.current) {
                          previewRef.current.innerHTML = val;
                        }
                      }, 0);
                    }
                  }}
                  title={showPreview ? 'Hide Preview' : 'Show Preview'}
                >
                  <i class="fa fa-eye"></i>
                </button>
              </div>
            </div>
            <div class="rr-textarea-wrapper">
              <div class="rr-line-numbers">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                class="rr-modal-textarea form-control"
                placeholder="Paste your shoutout code here..."
                defaultValue={code}
                onInput={(e) => setCode(e.target.value)}
              />
            </div>
            {showPreview && (
              <div class="rr-modal-preview-container">
                <div ref={previewRef} class="rr-modal-preview" />
              </div>
            )}

            {/* My Code fields */}
            <div class="rr-mycode-fields">
              <div class="form-group">
                <label class="rr-modal-label">Fiction</label>
                <select
                  class="form-control form-control-sm"
                  value={fictionId}
                  onChange={(e) => setFictionId(e.target.value)}
                >
                  <option value="">Select fiction...</option>
                  {myFictions.map(f => (
                    <option key={f.fictionId} value={f.fictionId}>
                      {f.title || `Fiction ${f.fictionId}`}
                    </option>
                  ))}
                </select>
              </div>
              <div class="form-group rr-mycode-name-field">
                <label class="rr-modal-label rr-optional-label">
                  Label <span class="rr-optional-hint">(optional - for multiple versions)</span>
                </label>
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="e.g. Full, Short, Banner..."
                  value={name}
                  onInput={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <DangerConfirmDialog
        isOpen={showDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        title="Delete Code"
        message="Are you sure you want to delete this code? This action cannot be undone."
        confirmLabel="Delete"
      />
    </>
  );
}

export default MyCodeModal;
