import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> { label: string; error?: string | undefined; hint?: string }
export function FormField({ label, error, hint, id, type, ...props }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  const description = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <div className="input-wrap"><input id={id} type={password && visible ? 'text' : type}
      aria-invalid={Boolean(error)} aria-describedby={description} {...props} />
      {password && <button type="button" className="password-toggle" disabled={props.disabled} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        aria-pressed={visible} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
    </div>
    {hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
    {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}
