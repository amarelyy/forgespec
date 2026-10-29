import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError } from '../index';
import type { ForgeSpecApi, User } from '../index';

export type AuthMode = 'login' | 'register';

interface Props {
  mode: AuthMode | null;
  /** Why the dialog opened, e.g. a guest tried to save a part. */
  reason?: string;
  api: Pick<ForgeSpecApi, 'auth'>;
  onModeChange: (m: AuthMode) => void;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

/** Native <dialog>: focus trapping, Escape and backdrop are handled by the browser. */
export function AuthDialog({ mode, reason, api, onModeChange, onClose, onSuccess }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (mode && !d.open) d.showModal();
    if (!mode && d.open) d.close();
    setError(null);
    setFields({});
  }, [mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const user = mode === 'register' ? await api.auth.register({ email, name, password }) : await api.auth.login({ email, password });
      setPassword('');
      onSuccess(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === 'VALIDATION_ERROR' ? 'Please fix the highlighted fields.' : err.message);
        setFields(err.fieldErrors);
      } else setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const register = mode === 'register';

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="auth-title" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <form className="dialog__body" onSubmit={submit} noValidate>
        <h2 id="auth-title">{register ? 'Create your account' : 'Log in to ForgeSpec'}</h2>
        {reason && <p className="dialog__reason">{reason}</p>}

        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}

        {register && (
          <Field id="auth-name" label="Name" value={name} onChange={setName} error={fields.name} autoComplete="name" />
        )}
        <Field id="auth-email" label="Email" type="email" value={email} onChange={setEmail} error={fields.email} autoComplete="email" />
        <Field
          id="auth-password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={fields.password}
          hint={register ? 'At least 8 characters' : undefined}
          autoComplete={register ? 'new-password' : 'current-password'}
        />

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Please wait...' : register ? 'Sign Up' : 'Log In'}
          </button>
        </div>

        <p className="dialog__switch">
          {register ? 'Already have an account?' : 'New to ForgeSpec?'}{' '}
          <button type="button" className="link-btn" onClick={() => onModeChange(register ? 'login' : 'register')}>
            {register ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </form>
    </dialog>
  );
}

function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; error?: string; hint?: string; autoComplete?: string }) {
  const { id, label, value, onChange, type = 'text', error, hint, autoComplete } = props;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={describedBy} autoComplete={autoComplete} />
      {error ? (
        <span id={`${id}-err`} className="field__error">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
