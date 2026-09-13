import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, AlertCircle, KeyRound, Mail, Info, ShieldCheck, Trophy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const LoginForm: React.FC = () => {
  const { login, loading, error: authError, isConfigured, canBootstrap } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim()) {
      setLocalError('Please enter your coordinator email address.');
      return;
    }

    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    try {
      await login(email, password);
    } catch (err: any) {
      // Handled in context
    }
  };

  const displayError = localError || authError;

  return (
    <div className="card auth-card">
      <div className="auth-header">
        <div className="auth-icon-wrap">
          <Trophy size={26} />
        </div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: '2px' }}>
          ATHLON&apos;26
        </h1>
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Annual Sports &amp; Athletics Registration
        </p>
      </div>

      {!isConfigured && (
        <div className="alert alert-warning">
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <div>
            <strong>Firebase Config Required:</strong>
            <p style={{ marginTop: '2px', fontSize: 'var(--text-xs)' }}>
              Add your Firebase project Web configuration to <code>.env.local</code>.
            </p>
          </div>
        </div>
      )}

      {isConfigured && canBootstrap && (
        <div className="alert alert-info">
          <ShieldCheck size={16} style={{ flexShrink: 0, color: '#a855f7' }} />
          <div>
            <strong>First-Time Setup Needed:</strong>
            <p style={{ marginTop: '2px', fontSize: 'var(--text-xs)' }}>
              The system is uninitialized. Go to{' '}
              <Link to="/setup" style={{ color: '#93c5fd', fontWeight: 600, textDecoration: 'underline' }}>
                System Setup &rarr;
              </Link>{' '}
              to initialize the first Super Coordinator.
            </p>
          </div>
        </div>
      )}

      {displayError && (
        <div className="alert alert-error">
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 'var(--text-xs)' }}>{displayError}</div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="email-input">
            Coordinator Email
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="email-input"
              type="email"
              className="form-input"
              style={{ paddingLeft: '2.4rem' }}
              placeholder="coordinator@college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
            />
            <Mail
              size={15}
              style={{
                position: 'absolute',
                left: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)',
              }}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="password-input">
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="password-input"
              type="password"
              className="form-input"
              style={{ paddingLeft: '2.4rem' }}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
            <KeyRound
              size={15}
              style={{
                position: 'absolute',
                left: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)',
              }}
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-md"
          style={{ width: '100%', marginTop: 'var(--space-2)' }}
          disabled={loading}
        >
          {loading ? (
            <>
              <div className="spinner" style={{ width: 14, height: 14 }} />
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <LogIn size={15} />
              <span>Sign In to Portal</span>
            </>
          )}
        </button>
      </form>

      <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', gap: '8px', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', lineHeight: 1.4 }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--color-primary)' }} />
          <span>
            Access is restricted to authorized faculty and student sports coordinators.
          </span>
        </div>
      </div>
    </div>
  );
};
