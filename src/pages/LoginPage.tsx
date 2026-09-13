import React from 'react';
import { Navigate } from 'react-router-dom';
import { LoginForm } from '../components/auth/LoginForm';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { isAuthenticated, loading, firebaseUser, user, canBootstrap } = useAuth();

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // If user is authenticated in Firebase Auth, but has no Firestore profile and system is uninitialized,
  // automatically route them to /setup!
  if (!loading && firebaseUser && !user && canBootstrap) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <div className="auth-wrapper">
      <LoginForm />
    </div>
  );
};
