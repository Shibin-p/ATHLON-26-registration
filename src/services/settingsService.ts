import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { CollegeSettings, AcademicStructure } from '../types';

const SETTINGS_DOC_ID = 'college';

export const DEFAULT_ACADEMIC_STRUCTURE: AcademicStructure = {
  years: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
  departments: [
    'Computer Science & Engineering',
    'Electronics & Communication Engineering',
    'Electrical & Electronics Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
  ],
  classes: [
    { year: 'S1', name: 'CSE-A', department: 'Computer Science & Engineering' },
    { year: 'S1', name: 'CSE-B', department: 'Computer Science & Engineering' },
    { year: 'S1', name: 'ECE-A', department: 'Electronics & Communication Engineering' },
    { year: 'S3', name: 'CSE-A', department: 'Computer Science & Engineering' },
    { year: 'S3', name: 'ECE-A', department: 'Electronics & Communication Engineering' },
    { year: 'S5', name: 'CSE-A', department: 'Computer Science & Engineering' },
    { year: 'S5', name: 'ME-A', department: 'Mechanical Engineering' },
    { year: 'S7', name: 'CSE-A', department: 'Computer Science & Engineering' },
    { year: 'S7', name: 'ECE-A', department: 'Electronics & Communication Engineering' },
  ],
};

export const DEFAULT_GAMES_LIMIT = 6;
export const DEFAULT_ATHLETICS_LIMIT = 3;

export const DEFAULT_SETTINGS: CollegeSettings = {
  settingId: SETTINGS_DOC_ID,
  collegeName: 'College of Engineering & Technology',
  sportsEventName: "ATHLON'26",
  sportsYear: '2026',
  academicYear: '2025-2026',
  contactEmail: 'sports@college.edu',
  contactPhone: '+91 98765 43210',
  academicStructure: DEFAULT_ACADEMIC_STRUCTURE,
  gamesLimit: DEFAULT_GAMES_LIMIT,
  athleticsLimit: DEFAULT_ATHLETICS_LIMIT,
};

/**
 * Fetch college settings with fallback to defaults
 */
export const getCollegeSettings = async (): Promise<CollegeSettings> => {
  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as Partial<CollegeSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...data,
        gamesLimit: typeof data.gamesLimit === 'number' ? data.gamesLimit : DEFAULT_GAMES_LIMIT,
        athleticsLimit: typeof data.athleticsLimit === 'number' ? data.athleticsLimit : DEFAULT_ATHLETICS_LIMIT,
        academicStructure: data.academicStructure || DEFAULT_ACADEMIC_STRUCTURE,
      };
    }

    // Check legacy document if college doc does not exist yet
    const legacyRef = doc(db, 'settings', 'system');
    const legacySnap = await getDoc(legacyRef);
    if (legacySnap.exists()) {
      const data = legacySnap.data() as Partial<CollegeSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...data,
        gamesLimit: typeof data.gamesLimit === 'number' ? data.gamesLimit : DEFAULT_GAMES_LIMIT,
        athleticsLimit: typeof data.athleticsLimit === 'number' ? data.athleticsLimit : DEFAULT_ATHLETICS_LIMIT,
        academicStructure: data.academicStructure || DEFAULT_ACADEMIC_STRUCTURE,
      };
    }

    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Failed to fetch settings from Firestore:', error);
    return DEFAULT_SETTINGS;
  }
};

/**
 * Subscribe to real-time college settings updates
 */
export const subscribeToCollegeSettings = (
  callback: (settings: CollegeSettings) => void
): (() => void) => {
  const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<CollegeSettings>;
        callback({
          ...DEFAULT_SETTINGS,
          ...data,
          gamesLimit: typeof data.gamesLimit === 'number' ? data.gamesLimit : DEFAULT_GAMES_LIMIT,
          athleticsLimit: typeof data.athleticsLimit === 'number' ? data.athleticsLimit : DEFAULT_ATHLETICS_LIMIT,
          academicStructure: data.academicStructure || DEFAULT_ACADEMIC_STRUCTURE,
        });
      } else {
        callback(DEFAULT_SETTINGS);
      }
    },
    (err) => {
      console.error('Real-time settings listener error:', err);
      callback(DEFAULT_SETTINGS);
    }
  );
};

/**
 * Update college settings (Super Coordinator only)
 */
export const updateCollegeSettings = async (
  settings: Partial<CollegeSettings>,
  updatedByUid: string
): Promise<void> => {
  const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
  await setDoc(
    docRef,
    {
      ...settings,
      settingId: SETTINGS_DOC_ID,
      updatedBy: updatedByUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

/**
 * Update academic structure
 */
export const updateAcademicStructure = async (
  structure: AcademicStructure,
  updatedByUid: string
): Promise<void> => {
  await updateCollegeSettings({ academicStructure: structure }, updatedByUid);
};
