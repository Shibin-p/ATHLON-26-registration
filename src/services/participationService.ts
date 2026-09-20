import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Registration, Event, CollegeSettings } from '../types';
import { normalizeEventDoc } from './eventService';
import { DEFAULT_GAMES_LIMIT, DEFAULT_ATHLETICS_LIMIT } from './settingsService';

/**
 * Check if an event category corresponds to a Game
 */
export const isGameEvent = (category?: string): boolean => {
  if (!category) return false;
  return category.trim().toLowerCase() === 'games';
};

/**
 * Check if an event category corresponds to an Athletic event
 */
export const isAthleticsEvent = (category?: string): boolean => {
  if (!category) return false;
  return category.trim().toLowerCase() === 'athletics';
};

/**
 * Get category bucket: 'games' | 'athletics' | 'other'
 */
export const getEventCategoryBucket = (category?: string): 'games' | 'athletics' | 'other' => {
  if (isGameEvent(category)) return 'games';
  if (isAthleticsEvent(category)) return 'athletics';
  return 'other';
};

/**
 * Extract configured participation limits from settings with safe defaults
 */
export const getParticipationLimits = (settings?: CollegeSettings | null) => {
  return {
    gamesLimit: typeof settings?.gamesLimit === 'number' ? settings.gamesLimit : DEFAULT_GAMES_LIMIT,
    athleticsLimit: typeof settings?.athleticsLimit === 'number' ? settings.athleticsLimit : DEFAULT_ATHLETICS_LIMIT,
  };
};

/**
 * Fetch all active registrations for a specific student from Firestore
 */
export const getStudentActiveRegistrations = async (
  studentId: string
): Promise<Registration[]> => {
  if (!studentId) return [];
  const colRef = collection(db, 'registrations');
  const q = query(colRef, where('participantIds', 'array-contains', studentId));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({
      ...(d.data() as Registration),
      docId: d.id,
      id: d.id,
      registrationId: d.data().registrationId || d.id,
    }))
    .filter((r) => r.status === 'registered');
};

/**
 * Calculate dynamic participation counts for a single student across Games and Athletics
 */
export const getStudentParticipationCount = async (
  studentId: string,
  eventsCache?: Map<string, Event> | Record<string, Event>,
  excludeRegistrationId?: string
): Promise<{ games: number; athletics: number }> => {
  const activeRegs = await getStudentActiveRegistrations(studentId);
  let games = 0;
  let athletics = 0;

  for (const reg of activeRegs) {
    // Exclude the registration being edited to prevent false self-collision
    if (
      excludeRegistrationId &&
      (reg.docId === excludeRegistrationId ||
        reg.registrationId === excludeRegistrationId ||
        reg.id === excludeRegistrationId)
    ) {
      continue;
    }

    let eventCategory = '';

    // 1. Check if event is in provided cache
    if (eventsCache) {
      const cached =
        eventsCache instanceof Map
          ? eventsCache.get(reg.eventId)
          : eventsCache[reg.eventId];
      if (cached) {
        eventCategory = cached.category;
      }
    }

    // 2. Fetch event document directly if not in cache
    if (!eventCategory && reg.eventId) {
      try {
        const eventSnap = await getDoc(doc(db, 'events', reg.eventId));
        if (eventSnap.exists()) {
          const evt = normalizeEventDoc(eventSnap.data(), eventSnap.id);
          eventCategory = evt.category;
        }
      } catch (err) {
        console.error(`Failed to fetch event ${reg.eventId} for participation count:`, err);
      }
    }

    if (isGameEvent(eventCategory)) {
      games++;
    } else if (isAthleticsEvent(eventCategory)) {
      athletics++;
    }
  }

  return { games, athletics };
};

/**
 * Synchronously calculate participation counts for all students present in a list of registrations.
 * Highly efficient for cohort or event roster pages.
 */
export const calculateParticipationFromRegistrations = (
  registrations: Registration[],
  eventsMap: Map<string, Event> | Record<string, Event>,
  excludeRegistrationId?: string
): Record<string, { games: number; athletics: number }> => {
  const result: Record<string, { games: number; athletics: number }> = {};

  for (const reg of registrations) {
    // Only active registrations consume limits
    if (reg.status !== 'registered') continue;

    // Exclude currently edited registration
    if (
      excludeRegistrationId &&
      (reg.docId === excludeRegistrationId ||
        reg.registrationId === excludeRegistrationId ||
        reg.id === excludeRegistrationId)
    ) {
      continue;
    }

    const event =
      eventsMap instanceof Map ? eventsMap.get(reg.eventId) : eventsMap[reg.eventId];
    const category = event?.category;
    const isGame = isGameEvent(category);
    const isAthletic = isAthleticsEvent(category);

    if (!isGame && !isAthletic) continue;

    for (const pid of reg.participantIds || []) {
      if (!result[pid]) {
        result[pid] = { games: 0, athletics: 0 };
      }
      if (isGame) {
        result[pid].games++;
      } else if (isAthletic) {
        result[pid].athletics++;
      }
    }
  }

  return result;
};

/**
 * Validate that a student has not reached the participation limit for a target event category.
 * Throws human-readable Error if the limit is reached.
 */
export const validateStudentParticipationLimit = (params: {
  studentName: string;
  eventCategory: string;
  currentActiveGames: number;
  currentActiveAthletics: number;
  gamesLimit: number;
  athleticsLimit: number;
}): void => {
  const {
    studentName,
    eventCategory,
    currentActiveGames,
    currentActiveAthletics,
    gamesLimit,
    athleticsLimit,
  } = params;

  if (isGameEvent(eventCategory)) {
    if (currentActiveGames >= gamesLimit) {
      throw new Error(
        `Participation limit reached. "${studentName}" is already registered for ${currentActiveGames} active game events. The current limit is ${gamesLimit}.`
      );
    }
  } else if (isAthleticsEvent(eventCategory)) {
    if (currentActiveAthletics >= athleticsLimit) {
      throw new Error(
        `Participation limit reached. "${studentName}" is already registered for ${currentActiveAthletics} active athletic events. The current limit is ${athleticsLimit}.`
      );
    }
  }
};
