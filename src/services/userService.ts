import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { UserProfile } from '../types';

/**
 * Retrieve a user's Firestore profile
 */
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      return userSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};

/**
 * Create a new user profile (admin or initial setup)
 */
export const createUserProfile = async (profile: UserProfile): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', profile.uid);
    await setDoc(userDocRef, {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
};

/**
 * Update an existing user profile
 */
export const updateUserProfile = async (
  uid: string,
  data: Partial<UserProfile>
): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

/**
 * Fetch all coordinators (Super Coordinator only)
 */
export const getAllCoordinators = async (): Promise<UserProfile[]> => {
  try {
    const usersColRef = collection(db, 'users');
    const snapshot = await getDocs(usersColRef);
    return snapshot.docs.map((d) => d.data() as UserProfile);
  } catch (error) {
    console.error('Error fetching all coordinators:', error);
    throw error;
  }
};

/**
 * Check if the system has not yet been initialized with a Super Coordinator.
 * Reads the dedicated system/status document.
 */
export const isSystemInitialized = async (): Promise<boolean> => {
  try {
    const statusRef = doc(db, 'system', 'status');
    const snap = await getDoc(statusRef);
    if (snap.exists() && snap.data()?.isInitialized === true) {
      return true;
    }
    // Also check legacy document if status doc has not yet been migrated
    const legacyRef = doc(db, 'settings', 'system');
    const legacySnap = await getDoc(legacyRef);
    return legacySnap.exists();
  } catch (error) {
    console.warn('Could not check system initialization status:', error);
    return false;
  }
};

/**
 * One-time setup: Bootstrap the first Super Coordinator and lock the system setup
 */
export const initializeFirstSuperCoordinator = async (
  uid: string,
  name: string,
  email: string
): Promise<void> => {
  const batch = writeBatch(db);

  // 1. Create Super Coordinator profile
  const userDocRef = doc(db, 'users', uid);
  batch.set(userDocRef, {
    uid,
    name,
    email,
    role: 'super_coordinator',
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Lock initialization by creating dedicated system/status document
  // Contains ONLY minimal public initialization flags, keeping settings private
  const statusRef = doc(db, 'system', 'status');
  batch.set(statusRef, {
    isInitialized: true,
    initializedAt: serverTimestamp(),
  });

  // 3. Initialize default college settings in settings/college
  const collegeRef = doc(db, 'settings', 'college');
  batch.set(collegeRef, {
    settingId: 'college',
    collegeName: 'College of Engineering & Technology',
    sportsEventName: "ATHLON'26",
    sportsYear: '2026',
    academicYear: '2025-2026',
    contactEmail: 'sports@college.edu',
    contactPhone: '+91 98765 43210',
    initializedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await batch.commit();
};
