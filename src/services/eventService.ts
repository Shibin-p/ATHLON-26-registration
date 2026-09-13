import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Event, EventStatus } from '../types';
import { normalizeAcademicYear } from '../utils/academicYear';
import { removeUndefined } from '../utils/sanitize';

/**
 * Normalizes an event document read from Firestore ensuring authoritative per-year capacity fields
 * and backward compatibility with legacy documents.
 */
export const normalizeEventDoc = (data: any, id?: string): Event => {
  const eventId = data.eventId || id || '';
  const eventType = data.eventType || 'individual';
  
  // Authoritative per-year capacity with backward-compatibility fallback
  const maxParticipantsPerYear = Number(
    data.maxParticipantsPerYear ?? data.maximumParticipants ?? 10
  );
  
  let minParticipantsPerYear = data.minParticipantsPerYear !== undefined
    ? Number(data.minParticipantsPerYear)
    : data.minimumParticipants !== undefined
    ? Number(data.minimumParticipants)
    : (eventType === 'team' ? 2 : 1);

  // Parse deadline safely
  let deadlineIso = data.registrationDeadline;
  if (data.registrationDeadline instanceof Timestamp) {
    deadlineIso = data.registrationDeadline.toDate().toISOString();
  } else if (data.registrationDeadline?.toDate) {
    deadlineIso = data.registrationDeadline.toDate().toISOString();
  } else if (typeof data.registrationDeadline !== 'string') {
    deadlineIso = new Date().toISOString();
  }

  return {
    ...data,
    eventId,
    eventName: data.eventName || '',
    category: data.category || 'Athletics',
    eventType,
    maxParticipantsPerYear,
    minParticipantsPerYear,
    eligibleYears: Array.isArray(data.eligibleYears) ? data.eligibleYears.map(normalizeAcademicYear) : undefined,
    date: data.date || '',
    startTime: data.startTime || '',
    endTime: data.endTime || '',
    venue: data.venue || 'Campus Sports Complex',
    registrationDeadline: deadlineIso,
    manualRegistrationOverride: Boolean(data.manualRegistrationOverride),
    description: data.description || data.instructions || '',
    status: data.status || 'draft',
    yearRegistrations: data.yearRegistrations || {},
    // Keep legacy references for safety
    maximumParticipants: maxParticipantsPerYear,
    minimumParticipants: minParticipantsPerYear,
    instructions: data.description || data.instructions || '',
  };
};

/**
 * Evaluates whether an event is currently open for registration according to:
 * 1. Event status
 * 2. Registration deadline (timezone-safe)
 * 3. Super Coordinator manual registration override
 */
export const isEventRegistrationOpen = (
  event: Event
): { isOpen: boolean; reason: string } => {
  if (event.status === 'closed') {
    return { isOpen: false, reason: 'Registration has been closed by sports coordinators.' };
  }
  if (event.status === 'completed') {
    return { isOpen: false, reason: 'Event competition is completed.' };
  }
  if (event.status === 'draft') {
    return { isOpen: false, reason: 'Event is currently in draft mode.' };
  }

  // If status is 'open', check deadline and manual override
  const now = Date.now();
  let deadlineTime = 0;
  if (event.registrationDeadline) {
    deadlineTime = new Date(event.registrationDeadline).getTime();
  }

  const isPastDeadline = deadlineTime > 0 && now > deadlineTime;

  if (isPastDeadline) {
    if (event.manualRegistrationOverride) {
      return { isOpen: true, reason: 'Open (Special manual coordinator extension active)' };
    }
    return { isOpen: false, reason: 'Registration deadline has passed.' };
  }

  return { isOpen: true, reason: 'Open for registration' };
};

/**
 * Verifies whether a given academic year is eligible to participate in an event.
 */
export const isYearEligible = (event: Event, year: string): boolean => {
  if (!event.eligibleYears || event.eligibleYears.length === 0) {
    return true; // Default: All years eligible
  }
  const canonical = normalizeAcademicYear(year);
  return event.eligibleYears.some((y) => normalizeAcademicYear(y) === canonical);
};

/**
 * Fetch all events (normalized)
 */
export const getAllEvents = async (): Promise<Event[]> => {
  const colRef = collection(db, 'events');
  const q = query(colRef, orderBy('date', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => normalizeEventDoc(d.data(), d.id));
};

/**
 * Fetch open events available for registration
 */
export const getOpenEvents = async (): Promise<Event[]> => {
  const colRef = collection(db, 'events');
  const q = query(colRef, where('status', '==', 'open'), orderBy('date', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => normalizeEventDoc(d.data(), d.id));
};

/**
 * Fetch a single event by ID
 */
export const getEventById = async (eventId: string): Promise<Event | null> => {
  const docRef = doc(db, 'events', eventId);
  const snap = await getDoc(docRef);
  return snap.exists() ? normalizeEventDoc(snap.data(), snap.id) : null;
};

/**
 * Create a new event (Super Coordinator only)
 */
export const createEvent = async (
  eventData: {
    eventName: string;
    category: string;
    eventType: 'individual' | 'team' | 'relay';
    maxParticipantsPerYear: number;
    minParticipantsPerYear?: number;
    eligibleYears?: string[];
    date: string;
    startTime?: string;
    endTime?: string;
    venue?: string;
    registrationDeadline: string;
    manualRegistrationOverride?: boolean;
    description?: string;
    status: EventStatus;
  },
  createdByUid: string
): Promise<Event> => {
  const eventRef = doc(collection(db, 'events'));
  const eventId = eventRef.id;

  const rawDoc: Record<string, any> = {
    ...eventData,
    eventId,
    // Sync legacy fields so any external reader won't fail
    maximumParticipants: eventData.maxParticipantsPerYear,
    minimumParticipants: eventData.eventType === 'team' ? (eventData.minParticipantsPerYear || 1) : 1,
    currentParticipants: 0,
    registeredParticipantIds: [],
    instructions: eventData.description || '',
    yearRegistrations: {},
    createdBy: createdByUid,
    updatedBy: createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Do not store minParticipantsPerYear for individual or relay events if not set
  if (eventData.eventType !== 'team' && rawDoc.minParticipantsPerYear === undefined) {
    delete rawDoc.minParticipantsPerYear;
  }

  const newEventDoc = removeUndefined(rawDoc);

  await setDoc(eventRef, newEventDoc);
  return normalizeEventDoc(newEventDoc, eventId);
};

/**
 * Update an existing event
 */
export const updateEvent = async (
  eventId: string,
  data: Partial<Event>,
  updatedByUid: string
): Promise<void> => {
  const eventRef = doc(db, 'events', eventId);
  const rawUpdates: Record<string, any> = {
    ...data,
    updatedBy: updatedByUid,
    updatedAt: serverTimestamp(),
  };

  // Sync legacy fields if authoritative fields were changed
  if (data.maxParticipantsPerYear !== undefined) {
    rawUpdates.maximumParticipants = data.maxParticipantsPerYear;
  }
  if (data.minParticipantsPerYear !== undefined) {
    rawUpdates.minimumParticipants = data.minParticipantsPerYear;
  }
  if (data.description !== undefined) {
    rawUpdates.instructions = data.description;
  }

  const updates = removeUndefined(rawUpdates);

  await updateDoc(eventRef, updates);
};

/**
 * Toggle event registration status or manual override
 */
export const toggleEventRegistrationStatus = async (
  eventId: string,
  status: EventStatus,
  manualRegistrationOverride: boolean,
  updatedByUid: string
): Promise<void> => {
  await updateEvent(
    eventId,
    { status, manualRegistrationOverride },
    updatedByUid
  );
};

/**
 * Delete event if no active registrations exist
 */
export const deleteEvent = async (eventId: string): Promise<void> => {
  const regCol = collection(db, 'registrations');
  const q = query(regCol, where('eventId', '==', eventId), where('status', '==', 'registered'));
  const snap = await getDocs(q);
  if (!snap.empty) {
    throw new Error('Cannot delete this event because active registrations already depend on it. Close or cancel the registrations first.');
  }

  const docRef = doc(db, 'events', eventId);
  await deleteDoc(docRef);
};
