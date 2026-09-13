import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type User, onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../config/firebase';
import { loginWithEmail, logoutUser } from '../services/authService';
import { getUserProfile, isSystemInitialized, initializeFirstSuperCoordinator } from '../services/userService';
import type { UserProfile, AuthState } from '../types';

interface AuthContextType extends AuthState {
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isConfigured: boolean;
  canBootstrap: boolean;
  bootstrapFirstAdmin: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileMissing, setIsProfileMissing] = useState<boolean>(false);
  const [canBootstrap, setCanBootstrap] = useState<boolean>(false);
  const isConfigured = isFirebaseConfigured();

  const fetchProfile = async (u: User) => {
    try {
      const profile = await getUserProfile(u.uid);
      if (profile) {
        if (!profile.active) {
          await logoutUser();
          setUserProfile(null);
          setFirebaseUser(null);
          setIsProfileMissing(false);
          setError('Your coordinator account is currently inactive. Please contact the Super Coordinator.');
          return;
        }
        setUserProfile(profile);
        setIsProfileMissing(false);
        setError(null);
      } else {
        // User is authenticated in Firebase Auth, but no Firestore document exists in users/{uid}
        setUserProfile(null);
        setIsProfileMissing(true);

        // Check if system is uninitialized so user can bootstrap if this is the first Super Coordinator
        const initialized = await isSystemInitialized();
        if (!initialized) {
          setCanBootstrap(true);
        } else {
          setError(
            'Your coordinator account profile was not found in the database. Please contact the Super Coordinator to provision your account.'
          );
        }
      }
    } catch (err: any) {
      console.error('Failed to load profile from Firestore:', err);
      setUserProfile(null);
      setIsProfileMissing(true);
      setError(err.message || 'Error communicating with Firestore security layer.');
    }
  };

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    // Also check initial bootstrap availability on mount
    isSystemInitialized().then((initialized) => {
      setCanBootstrap(!initialized);
    });

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      if (u) {
        await fetchProfile(u);
      } else {
        setUserProfile(null);
        setIsProfileMissing(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isConfigured]);

  const login = async (email: string, pass: string) => {
    setError(null);
    setLoading(true);
    try {
      const cred = await loginWithEmail(email, pass);
      await fetchProfile(cred.user);
    } catch (err: any) {
      let message = 'Failed to sign in. Please check your credentials.';
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found'
      ) {
        message = 'Invalid email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Access temporarily disabled due to many failed login attempts. Please try again later.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please provide a valid email address.';
      } else if (err.message) {
        message = err.message;
      }
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await logoutUser();
      setUserProfile(null);
      setFirebaseUser(null);
      setIsProfileMissing(false);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to sign out.');
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (firebaseUser) {
      await fetchProfile(firebaseUser);
    }
  };

  const bootstrapFirstAdmin = async (name: string) => {
    if (!firebaseUser) {
      throw new Error('Must be authenticated to bootstrap initial administrator.');
    }
    setLoading(true);
    try {
      await initializeFirstSuperCoordinator(firebaseUser.uid, name, firebaseUser.email || '');
      await fetchProfile(firebaseUser);
      setCanBootstrap(false);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize first Super Coordinator.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const isSuperCoordinator = userProfile?.role === 'super_coordinator';
  const isViewCoordinator = userProfile?.role === 'view_coordinator';
  const isYearCoordinator = userProfile?.role === 'year_coordinator';
  const isActive = Boolean(userProfile?.active);
  const isAuthenticated = Boolean(firebaseUser && userProfile && isActive);

  return (
    <AuthContext.Provider
      value={{
        user: userProfile,
        firebaseUser,
        loading,
        error,
        isAuthenticated,
        isSuperCoordinator,
        isViewCoordinator,
        isYearCoordinator,
        isActive,
        isProfileMissing,
        isConfigured,
        canBootstrap,
        login,
        logout,
        refreshProfile,
        bootstrapFirstAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
