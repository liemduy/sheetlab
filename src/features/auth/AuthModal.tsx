import { useState, type FormEvent } from 'react';
import { supabase } from './supabaseClient';

interface AuthModalProps {
  onClose: () => void;
}

type AuthMode = 'sign-in' | 'sign-up';

export function AuthModal({ onClose }: AuthModalProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('Sign in to sync scores and practice records.');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setMessage(authMode === 'sign-in' ? 'Signing in...' : 'Creating account...');

    const result = authMode === 'sign-in'
      ? await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
      : await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

    setIsSubmitting(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (authMode === 'sign-up' && !result.data.session) {
      setMessage('Account created. Check your email if confirmation is enabled.');
      return;
    }

    onClose();
  }

  return (
    <div className="auth-modal-backdrop" role="presentation">
      <section
        aria-label="Supabase sign in"
        aria-modal="true"
        className="auth-modal"
        role="dialog"
      >
        <div className="auth-modal-header">
          <h2>{authMode === 'sign-in' ? 'Sign in' : 'Create account'}</h2>
          <button
            type="button"
            aria-label="Close sign in"
            className="tool-button"
            onClick={onClose}
          >
            X
          </button>
        </div>
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={
                authMode === 'sign-in' ? 'current-password' : 'new-password'
              }
              minLength={6}
              value={password}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <p className="auth-message">{message}</p>
          <div className="auth-actions-row">
            <button type="submit" className="tool-button" disabled={isSubmitting}>
              {authMode === 'sign-in' ? 'Sign in' : 'Create'}
            </button>
            <button
              type="button"
              className="tool-button"
              disabled={isSubmitting}
              onClick={() => {
                setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in');
                setMessage(
                  authMode === 'sign-in'
                    ? 'Create an account to enable cloud sync.'
                    : 'Sign in to sync scores and practice records.',
                );
              }}
            >
              {authMode === 'sign-in' ? 'Need account' : 'Have account'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
