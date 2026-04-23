// Shared UI Components - Uses Royal Road's native Bootstrap styling
import { h, toChildArray } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';

/**
 * Native RR-styled select dropdown
 */
export function Select({ value, onChange, children, size = 'md', className = '', ...props }) {
  const sizeClass = size === 'sm' ? 'form-control-sm' : size === 'lg' ? 'form-control-lg' : '';
  return (
    <select
      class={`form-control ${sizeClass} ${className}`.trim()}
      value={value}
      onChange={onChange}
      {...props}
    >
      {children}
    </select>
  );
}

/**
 * ThemedSelect — a non-native replacement for `<select>` whose option list
 * can actually be styled. The native select's dropdown panel is drawn by
 * the OS and can't be fully themed (stays white on dark pages in many
 * browsers), so when that matters use this instead.
 *
 * Accepts `<option value>label</option>` children to stay drop-in with
 * the native Select. `onChange` is called with a synthetic event of shape
 * `{ target: { value } }` to match the existing onChange contract.
 */
export function ThemedSelect({ value, onChange, children, size = 'md', className = '', id, disabled = false, ...props }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Flatten children into {value, label} pairs. Supports native <option>
  // children as used by Select.
  const options = toChildArray(children)
    .filter(c => c && c.props)
    .map(c => ({
      value: c.props.value ?? '',
      label: c.props.children ?? ''
    }));

  const selected = options.find(o => String(o.value) === String(value ?? ''));
  const sizeClass = size === 'sm' ? 'form-control-sm' : size === 'lg' ? 'form-control-lg' : '';

  const pick = (v) => {
    onChange?.({ target: { value: v } });
    setOpen(false);
  };

  return (
    <div class={`rr-themed-select ${open ? 'is-open' : ''} ${className}`.trim()} ref={ref} id={id}>
      <button
        type="button"
        class={`form-control ${sizeClass} rr-themed-select-btn`.trim()}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        {...props}
      >
        <span class="rr-themed-select-value">{selected ? selected.label : ''}</span>
        <i class={`fa fa-caret-${open ? 'up' : 'down'} rr-themed-select-caret`}></i>
      </button>
      {open && (
        <ul class="rr-themed-select-menu" role="listbox">
          {options.map((opt, i) => (
            <li
              key={i}
              class={`rr-themed-select-option ${String(opt.value) === String(value ?? '') ? 'is-active' : ''}`}
              role="option"
              aria-selected={String(opt.value) === String(value ?? '')}
              onClick={() => pick(opt.value)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Native RR-styled text input
 */
export function Input({ type = 'text', value, onChange, size = 'md', className = '', ...props }) {
  const sizeClass = size === 'sm' ? 'form-control-sm' : size === 'lg' ? 'form-control-lg' : '';
  return (
    <input
      type={type}
      class={`form-control ${sizeClass} ${className}`.trim()}
      value={value}
      onChange={onChange}
      {...props}
    />
  );
}

/**
 * Native RR-styled textarea
 */
export function Textarea({ value, onChange, size = 'md', className = '', ...props }) {
  const sizeClass = size === 'sm' ? 'form-control-sm' : size === 'lg' ? 'form-control-lg' : '';
  return (
    <textarea
      class={`form-control ${sizeClass} ${className}`.trim()}
      value={value}
      onChange={onChange}
      {...props}
    />
  );
}

/**
 * Native RR-styled button
 */
export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  outline = false,
  className = '',
  ...props
}) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  const variantClass = outline ? `btn-outline-${variant}` : `btn-${variant}`;
  return (
    <button
      class={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Icon button (small, icon-only)
 */
export function IconButton({ icon, onClick, variant = 'light', title = '', className = '', ...props }) {
  return (
    <button
      class={`btn btn-sm btn-icon btn-${variant} ${className}`.trim()}
      onClick={onClick}
      title={title}
      {...props}
    >
      <i class={`fa ${icon}`}></i>
    </button>
  );
}

/**
 * Input group with select and optional button (like RR's fiction selector)
 */
export function InputGroup({ children, className = '' }) {
  return (
    <div class={`input-group ${className}`.trim()}>
      {children}
    </div>
  );
}

export function InputGroupAppend({ children }) {
  return (
    <div class="input-group-append">
      {children}
    </div>
  );
}

export function InputGroupPrepend({ children }) {
  return (
    <div class="input-group-prepend">
      {children}
    </div>
  );
}

/**
 * Form group with label
 */
export function FormGroup({ label, children, className = '' }) {
  return (
    <div class={`form-group ${className}`.trim()}>
      {label && <label class="rr-modal-label">{label}</label>}
      {children}
    </div>
  );
}

/**
 * Checkbox with label
 */
export function Checkbox({ checked, onChange, label, className = '', ...props }) {
  return (
    <label class={`rr-checkbox ${className}`.trim()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * Radio button with label
 */
export function Radio({ checked, onChange, name, value, label, className = '', ...props }) {
  return (
    <label class={`rr-radio ${className}`.trim()}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * Badge/Tag component
 */
export function Badge({ children, variant = 'primary', className = '' }) {
  return (
    <span class={`badge badge-${variant} ${className}`.trim()}>
      {children}
    </span>
  );
}

/**
 * Spinner/Loading indicator
 */
export function Spinner({ size = 'md', className = '' }) {
  const sizeClass = size === 'sm' ? 'fa-sm' : size === 'lg' ? 'fa-lg' : '';
  return <i class={`fa fa-spinner fa-spin ${sizeClass} ${className}`.trim()}></i>;
}

/**
 * Alert/Notice box
 */
export function Alert({ children, variant = 'info', className = '' }) {
  return (
    <div class={`alert alert-${variant} ${className}`.trim()}>
      {children}
    </div>
  );
}

export default {
  Select,
  ThemedSelect,
  Input,
  Textarea,
  Button,
  IconButton,
  InputGroup,
  InputGroupAppend,
  InputGroupPrepend,
  FormGroup,
  Checkbox,
  Radio,
  Badge,
  Spinner,
  Alert
};
