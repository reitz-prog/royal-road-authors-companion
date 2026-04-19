// Shared UI Components - Uses Royal Road's native Bootstrap styling
import { h } from 'preact';

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
