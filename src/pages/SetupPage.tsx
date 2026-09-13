import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  User,
  KeyRound,
  Mail,
  ArrowRight,
  Lock,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isSystemInitialized } from '../services/userService';

export const SetupPage: React.FC = () => {
  const {
    firebaseUser,
    user,
    bootstrapFirstAdmin,
    login,
    loading: authLoading,
  } = useAuth();
  const navigate = useNavigate();

  // Initialization check
  const [checkingInit, setCheckingInit] = useState(true);
  const [systemAlreadyInit, setSystemAlreadyInit] = useState(false);

  // Step 1: Sign-in inputs (if not logged in)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Step 2: Bootstrap inputs (if logged in)
  const [adminName, setAdminName] = useState(firebaseUser?.displayName || '');
  const [bootstrapLoading, setBootstrapLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    checkInitStatus();
  }, []);

  useEffect(() => {
    if (firebaseUser?.displayName && !adminName) {
      setAdminName(firebaseUser.displayName);
    }
  }, [firebaseUser]);

  const checkInitStatus = async () => {
    setCheckingInit(true);
    try {
      const initialized = await isSystemInitialized();
      setSystemAlreadyInit(initialized);
    } catch (err) {
      console.error('Error checking system init:', err);
    } finally {
      setCheckingInit(false);
    }
  };

  // If user already has an active coordinator profile in Firestore, redirect to dashboard
  if (!authLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  // Loading state while checking system initialization
  if (checkingInit || authLoading) {
    return (
      <div className="auth-wrapper">
        <div className="card auth-card" style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)' }}>
          <div className="spinner" style={{ margin: '0 auto var(--space-3)', width: 24, height: 24 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            Verifying system initialization state...
          </p>
        </div>
      </div>
    );
  }

  // If system is already initialized and no setup is allowed
  if (systemAlreadyInit && !success) {
    return (
      <div className="auth-wrapper">
        <div className="card auth-card" style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-5)' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'var(--color-primary-light)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 'var(--space-4)',
              border: '1px solid var(--color-primary-border)',
              color: '#93c5fd',
            }}
          >
            <Lock size={26} />
          </div>

          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
            System Setup Locked
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', lineHeight: 1.5 }}>
            The primary Super Coordinator has already been initialized for ATHLON&apos;26. The one-time bootstrap portal is securely and permanently disabled.
          </p>

          <Link to="/login" className="btn btn-primary btn-md" style={{ width: '100%' }}>
            <span>Go to Portal Sign In</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  // Step 1: Sign in with Firebase Authentication if not logged in
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoginLoading(true);

    try {
      await login(loginEmail, loginPassword);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please verify your credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Step 2: Confirm Super Coordinator bootstrap
  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!adminName.trim()) {
      setError('Please enter your full administrator name.');
      return;
    }

    setBootstrapLoading(true);
    try {
      await bootstrapFirstAdmin(adminName.trim());
      setSuccess(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Super Coordinator.');
    } finally {
      setBootstrapLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="card auth-card">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-icon-wrap" style={{ background: 'var(--color-purple-light)', borderColor: 'var(--color-purple-border)', color: '#d8b4fe' }}>
            <ShieldCheck size={28} />
          </div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px' }}>
            System Setup
          </h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Initial Super Coordinator Bootstrap
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 'var(--text-xs)' }}>{error}</div>
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 'var(--text-xs)' }}>
              Super Coordinator initialized successfully! Redirecting to dashboard...
            </div>
          </div>
        )}

        {/* Visual Progress Steps */}
        {!success && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              marginBottom: 'var(--space-5)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: firebaseUser ? 'var(--color-success)' : '#93c5fd' }}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: firebaseUser ? 'var(--color-success)' : 'var(--color-primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                }}
              >
                {firebaseUser ? <Check size={10} /> : '1'}
              </span>
              <span>Owner Auth</span>
            </div>

            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)', margin: '0 8px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: firebaseUser ? '#93c5fd' : 'var(--text-tertiary)' }}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: firebaseUser ? 'var(--color-primary)' : 'var(--bg-surface)',
                  color: firebaseUser ? '#fff' : 'var(--text-tertiary)',
                  border: '1px solid var(--border-medium)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                }}
              >
                2
              </span>
              <span>Profile Setup</span>
            </div>
          </div>
        )}

        {/* STEP 1: Not logged into Firebase Auth yet */}
        {!firebaseUser && !success && (
          <div>
            <div className="alert alert-info">
              <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
                <strong>Step 1: Administrator Authentication</strong>
                <p style={{ marginTop: '2px' }}>
                  Sign in with the administrator email created in Firebase Console to unlock the one-time Super Coordinator bootstrap.
                </p>
              </div>
            </div>

            <form onSubmit={handleLoginSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="setup-email">
                  Administrator Email *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="setup-email"
                    type="email"
                    className="form-input"
                    style={{ paddingLeft: '2.4rem' }}
                    placeholder="admin@college.edu"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    disabled={loginLoading}
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
                <label className="form-label" htmlFor="setup-password">
                  Account Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="setup-password"
                    type="password"
                    className="form-input"
                    style={{ paddingLeft: '2.4rem' }}
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    disabled={loginLoading}
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
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <>
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <KeyRound size={15} />
                    <span>Verify Credentials &amp; Continue</span>
                  </>
                )}
              </button>
            </form>

            <div style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
              <Link to="/login" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textDecoration: 'none' }}>
                &larr; Return to Standard Portal Sign In
              </Link>
            </div>
          </div>
        )}

        {/* STEP 2: Authenticated in Firebase Auth, now claim Super Coordinator */}
        {firebaseUser && !success && (
          <div>
            <div className="alert alert-info">
              <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
                <strong>Step 2: Confirm Administrator Profile</strong>
                <p style={{ marginTop: '2px' }}>
                  Authenticated as <strong>{firebaseUser.email}</strong>. Confirming your name will register you as Super Coordinator and permanently close bootstrap.
                </p>
              </div>
            </div>

            <form onSubmit={handleBootstrapSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="admin-name">
                  Super Coordinator Full Name *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="admin-name"
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: '2.4rem' }}
                    placeholder="e.g. Dr. Rajesh Kumar"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    required
                    disabled={bootstrapLoading}
                  />
                  <User
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
                disabled={bootstrapLoading}
              >
                {bootstrapLoading ? (
                  <>
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                    <span>Initializing System...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>Confirm Super Coordinator Role</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
