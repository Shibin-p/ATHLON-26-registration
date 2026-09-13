import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, LogOut, UserX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactElement;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const {
    loading,
    user,
    firebaseUser,
    isProfileMissing,
    canBootstrap,
    logout,
  } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          className="spinner"
          style={{
            width: 32,
            height: 32,
            borderColor: 'rgba(59, 130, 246, 0.2)',
            borderTopColor: '#3b82f6',
          }}
        />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Verifying security and access permissions...
        </p>
      </div>
    );
  }

  // Not logged into Firebase Auth
  if (!firebaseUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated in Firebase Auth, but no Firestore profile document
  if (isProfileMissing || !user) {
    if (canBootstrap) {
      return <Navigate to="/setup" replace />;
    }

    return (
      <div style={{ maxWidth: 540, margin: '4rem auto', padding: '0 1.5rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '1rem',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              marginBottom: '1rem',
            }}
          >
            <UserX size={36} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>
            Account Profile Not Found
          </h2>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              marginBottom: '1.5rem',
              lineHeight: '1.5',
            }}
          >
            Your login ({firebaseUser.email}) is authenticated, but no coordinator profile exists
            for your UID in the Firestore database. Please contact the Super Coordinator to assign your
            coordinator role.
          </p>

          <button onClick={() => logout()} className="btn btn-secondary">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  // User is not active
  if (!user.active) {
    return (
      <div style={{ maxWidth: 540, margin: '4rem auto', padding: '0 1.5rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '1rem',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              marginBottom: '1rem',
            }}
          >
            <ShieldAlert size={36} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>
            Account Deactivated
          </h2>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              marginBottom: '1.5rem',
            }}
          >
            Your coordinator account is currently inactive. Please contact your Super Coordinator.
          </p>

          <button onClick={() => logout()} className="btn btn-secondary">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  // Role check
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div style={{ maxWidth: 540, margin: '4rem auto', padding: '0 1.5rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '1rem',
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.15)',
              marginBottom: '1rem',
            }}
          >
            <ShieldAlert size={36} color="#f59e0b" />
          </div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>
            Access Restricted
          </h2>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              marginBottom: '1.5rem',
              lineHeight: '1.5',
            }}
          >
            Your current role (<strong>{user.role}</strong>) does not have permission to view this
            administrative section.
          </p>

          <Link to="/dashboard" className="btn btn-primary">
            <ArrowLeft size={16} />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  return children;
};
