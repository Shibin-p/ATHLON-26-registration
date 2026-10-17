import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Registration, StudentParticipantSummary, RelayPosition, Event } from '../types';
import { normalizeAcademicYear } from '../utils/academicYear';
import { removeUndefined } from '../utils/sanitize';
import { isEventRegistrationOpen, isYearEligible, normalizeEventDoc } from './eventService';
import { getCollegeSettings } from './settingsService';
import {
  getParticipationLimits,
  getStudentParticipationCount,
  validateStudentParticipationLimit,
  isAthleticsEvent,
} from './participationService';
import {
  prepareChestNumberAllocationsInTransaction,
  commitChestNumberAllocationsInTransaction,
  type PreparedChestResult,
} from './chestNumberService';
import { recordActivity } from './activityLogService';

/**
 * Generate human-readable registration ID: SPT-2026-XXXX
 */
export const generateRegistrationId = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SPT-2026-${code}`;
};

/**
 * Fetch all registrations
 */
export const getAllRegistrations = async (): Promise<Registration[]> => {
  const colRef = collection(db, 'registrations');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    ...(d.data() as Registration),
    docId: d.id,
    id: d.id,
    registrationId: d.data().registrationId || d.id,
  }));
};

/**
 * Fetch registrations strictly scoped to an academic year (Year Coordinator)
 */
export const getScopedRegistrations = async (
  year: string,
  className?: string
): Promise<Registration[]> => {
  const canonicalYear = normalizeAcademicYear(year);
  const colRef = collection(db, 'registrations');
  let q = query(colRef, where('year', '==', canonicalYear));

  if (className) {
    q = query(colRef, where('year', '==', canonicalYear), where('class', '==', className));
  }

  const snapshot = await getDocs(q);
  let items = snapshot.docs.map((d) => ({
    ...(d.data() as Registration),
    docId: d.id,
    id: d.id,
    registrationId: d.data().registrationId || d.id,
  }));

  // Fallback if no records found and year was not identical to canonical
  if (items.length === 0 && year && year !== canonicalYear) {
    try {
      let fallbackQ = query(colRef, where('year', '==', year));
      if (className) fallbackQ = query(colRef, where('year', '==', year), where('class', '==', className));
      const fallbackSnap = await getDocs(fallbackQ);
      items = fallbackSnap.docs.map((d) => ({
        ...(d.data() as Registration),
        docId: d.id,
        id: d.id,
        registrationId: d.data().registrationId || d.id,
      }));
    } catch {
      // ignore fallback error
    }
  }

  return items.sort((a, b) => {
    const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt || 0);
    const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt || 0);
    return timeB - timeA;
  });
};

/**
 * Fetch all active registrations for an event (Super Coordinator & View Coordinator)
 */
export const getEventRegistrations = async (
  eventId: string
): Promise<Registration[]> => {
  const colRef = collection(db, 'registrations');
  const q = query(colRef, where('eventId', '==', eventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    ...(d.data() as Registration),
    docId: d.id,
    id: d.id,
    registrationId: d.data().registrationId || d.id,
  }));
};

/**
 * Fetch active registration for an event specifically for an academic year (Year Coordinator)
 */
export const getEventRegistrationForYear = async (
  eventId: string,
  year: string
): Promise<Registration | null> => {
  const canonicalYear = normalizeAcademicYear(year);
  const colRef = collection(db, 'registrations');
  const q = query(
    colRef,
    where('eventId', '==', eventId),
    where('year', '==', canonicalYear),
    where('status', '==', 'registered')
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    const d = snapshot.docs[0];
    return {
      ...(d.data() as Registration),
      docId: d.id,
      id: d.id,
      registrationId: d.data().registrationId || d.id,
    };
  }

  // Fallback check if stored without normalization
  if (year && year !== canonicalYear) {
    try {
      const fallbackQ = query(
        colRef,
        where('eventId', '==', eventId),
        where('year', '==', year),
        where('status', '==', 'registered')
      );
      const fallbackSnap = await getDocs(fallbackQ);
      if (!fallbackSnap.empty) {
        const d = fallbackSnap.docs[0];
        return {
          ...(d.data() as Registration),
          docId: d.id,
          id: d.id,
          registrationId: d.data().registrationId || d.id,
        };
      }
    } catch {
      // ignore
    }
  }

  return null;
};

/**
 * Resolves a registration's Firestore document ID, handling cases where callers pass
 * either the Firestore document ID (e.g. 'zhgmd9zV349uZA5hIpuy') or the human-readable
 * registration ID (e.g. 'SPT-2026-AP9E').
 */
export const resolveRegistrationDocId = async (
  idOrRegId: string,
  scopedYear?: string
): Promise<string | null> => {
  if (!idOrRegId) return null;

  // 1. Try direct doc lookup
  try {
    const directRef = doc(db, 'registrations', idOrRegId);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) {
      return directSnap.id;
    }
  } catch {
    // If not found or permission denied because doc doesn't exist, proceed to query
  }

  // 2. Query by registrationId
  try {
    const colRef = collection(db, 'registrations');
    let q;
    if (scopedYear) {
      const canonical = normalizeAcademicYear(scopedYear);
      q = query(colRef, where('year', '==', canonical), where('registrationId', '==', idOrRegId));
    } else {
      q = query(colRef, where('registrationId', '==', idOrRegId));
    }
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].id;
    }
  } catch {
    // ignore
  }

  return null;
};

/**
 * Fetch a single registration by ID or registrationId reference
 */
export const getRegistrationById = async (
  registrationId: string,
  scopedYear?: string
): Promise<Registration | null> => {
  if (!registrationId) return null;

  // 1. Try direct getDoc
  try {
    const docRef = doc(db, 'registrations', registrationId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return {
        ...(snap.data() as Registration),
        docId: snap.id,
        id: snap.id,
        registrationId: snap.data().registrationId || snap.id,
      };
    }
  } catch {
    // If not found or permission denied because doc doesn't exist, proceed to query
  }

  // 2. Query by registrationId field
  try {
    const colRef = collection(db, 'registrations');
    let q;
    if (scopedYear) {
      const canonical = normalizeAcademicYear(scopedYear);
      q = query(colRef, where('year', '==', canonical), where('registrationId', '==', registrationId));
    } else {
      q = query(colRef, where('registrationId', '==', registrationId));
    }
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return {
        ...(d.data() as Registration),
        docId: d.id,
        id: d.id,
        registrationId: d.data().registrationId || d.id,
      };
    }
  } catch {
    // ignore
  }

  return null;
};

/**
 * Atomic registration transaction enforcing:
 * 1. Event status == 'open' and deadline validity (or manual override)
 * 2. Academic year eligibility
 * 3. Exactly ONE active registration per year per event
 * 4. Per-year capacity limits (minParticipantsPerYear, maxParticipantsPerYear)
 * 5. Student active status & cross-year restriction
 * 6. Duplicate student prevention across the competition
 */
export const submitRegistrationWithTransaction = async (params: {
  eventId: string;
  year: string;
  className: string;
  department: string;
  participantIds: string[];
  participantsSnapshot: StudentParticipantSummary[];
  registrationType: 'individual' | 'team' | 'relay';
  teamName?: string;
  captainId?: string;
  captainName?: string;
  relayOrder?: RelayPosition[];
  coordinatorId: string;
  coordinatorName: string;
  coordinatorEmail?: string;
}): Promise<Registration> => {
  const {
    eventId,
    year,
    className,
    department,
    participantIds,
    participantsSnapshot,
    registrationType,
    teamName,
    captainId,
    captainName,
    relayOrder,
    coordinatorId,
    coordinatorName,
    coordinatorEmail,
  } = params;

  if (participantIds.length === 0) {
    throw new Error('Please select at least one participant.');
  }

  const canonicalYear = normalizeAcademicYear(year);

  // Validate student participation limits (Games vs Athletics)
  const settings = await getCollegeSettings();
  const { gamesLimit, athleticsLimit } = getParticipationLimits(settings);

  // Pre-fetch event to determine category
  const preEventRef = doc(db, 'events', eventId);
  const preEventSnap = await getDoc(preEventRef);
  if (!preEventSnap.exists()) {
    throw new Error('Event not found.');
  }
  const preEvent = normalizeEventDoc(preEventSnap.data(), preEventSnap.id);

  // Pre-fetch cohort registrations with year constraint (satisfies Firestore security rules for Year Coordinator)
  const cohortRegs = await getScopedRegistrations(canonicalYear);
  const eventsCache = new Map<string, Event>();
  eventsCache.set(eventId, preEvent);

  for (const pid of participantIds) {
    const studentInfo = participantsSnapshot.find((s) => s.studentId === pid);
    const studentName = studentInfo?.name || 'Selected student';
    const { games, athletics } = await getStudentParticipationCount(
      pid,
      eventsCache,
      undefined,
      canonicalYear,
      cohortRegs
    );
    validateStudentParticipationLimit({
      studentName,
      eventCategory: preEvent.category,
      currentActiveGames: games,
      currentActiveAthletics: athletics,
      gamesLimit,
      athleticsLimit,
    });
  }

  let preparedChestAllocations: PreparedChestResult | null = null;

  const resultRegistration = await runTransaction(db, async (transaction) => {
    // 1. Read event inside transaction
    const eventRef = doc(db, 'events', eventId);
    const eventSnap = await transaction.get(eventRef);

    if (!eventSnap.exists()) {
      throw new Error('Event not found.');
    }

    const event = normalizeEventDoc(eventSnap.data(), eventSnap.id);

    // 2. Validate registration window & deadline override
    const { isOpen, reason } = isEventRegistrationOpen(event);
    if (!isOpen) {
      throw new Error(`Registration is closed for "${event.eventName}": ${reason}`);
    }

    // 3. Validate academic year eligibility
    if (!isYearEligible(event, canonicalYear)) {
      throw new Error(
        `Academic year "${canonicalYear}" is not eligible to participate in "${event.eventName}".`
      );
    }

    // 4. Enforce ONE active registration per year per event
    const existingYearSummary = event.yearRegistrations?.[canonicalYear];
    if (existingYearSummary && existingYearSummary.status === 'registered') {
      throw new Error(
        `Your academic year (${canonicalYear}) has already registered for "${event.eventName}". Duplicate registration is not permitted.`
      );
    }

    // 5. Validate per-year capacity limits
    const incomingCount = participantIds.length;
    const maxAllowed = event.maxParticipantsPerYear;

    if (registrationType === 'team') {
      const minRequired = event.minParticipantsPerYear || 2;
      if (incomingCount < minRequired) {
        throw new Error(
          `Team event requires at least ${minRequired} players. Currently selected: ${incomingCount}.`
        );
      }
      if (incomingCount > maxAllowed) {
        throw new Error(
          `Team size cannot exceed maximum limit of ${maxAllowed} players for ${canonicalYear}.`
        );
      }
    } else if (registrationType === 'individual') {
      if (incomingCount > maxAllowed) {
        throw new Error(
          `Cannot exceed maximum limit of ${maxAllowed} participant(s) per year for "${event.eventName}".`
        );
      }
    } else if (registrationType === 'relay') {
      const requiredRelaySize = event.maxParticipantsPerYear || 4;
      if (incomingCount !== requiredRelaySize) {
        throw new Error(
          `Relay event requires exactly ${requiredRelaySize} runners. Currently selected: ${incomingCount}.`
        );
      }
    }

    // 6. Prevent duplicate students within the event across all registered teams
    const registeredIds = new Set<string>(event.registeredParticipantIds || []);
    for (const pid of participantIds) {
      if (registeredIds.has(pid)) {
        const dupStudent = participantsSnapshot.find((s) => s.studentId === pid);
        const name = dupStudent ? dupStudent.name : 'A selected student';
        throw new Error(
          `${name} is already registered for "${event.eventName}". Duplicate student participation is not permitted.`
        );
      }
    }

    // 2. Read coordinator inside transaction before any writes
    const coordRef = doc(db, 'users', coordinatorId);
    const coordSnap = await transaction.get(coordRef);

    // 3. Read all student docs inside transaction before any writes
    const studentRefs = participantIds.map((pid) => doc(db, 'students', pid));
    const studentSnaps = await Promise.all(studentRefs.map((ref) => transaction.get(ref)));

    // 4. Validate Student Documents: active status and academic year scope
    for (let i = 0; i < participantIds.length; i++) {
      const pid = participantIds[i];
      const studentSnap = studentSnaps[i];
      if (!studentSnap.exists()) {
        throw new Error(`Student record "${pid}" not found in database.`);
      }
      const studentData = studentSnap.data();
      if (!studentData.active) {
        throw new Error(`Student "${studentData.name}" is inactive and cannot be registered.`);
      }
      const studentYear = normalizeAcademicYear(studentData.year || studentData.academicYear);
      if (studentYear !== canonicalYear) {
        throw new Error(
          `Security violation: Student "${studentData.name}" belongs to "${studentData.year || studentYear}", but this registration is scoped to "${canonicalYear}". Cross-year registration is rejected.`
        );
      }
    }

    // 5. Validate Coordinator Authority
    if (coordSnap.exists()) {
      const coordData = coordSnap.data();
      if (
        coordData.role === 'year_coordinator' &&
        normalizeAcademicYear(coordData.assignedYear) !== canonicalYear
      ) {
        throw new Error(
          `Authorization failed: Coordinator "${coordinatorName}" is assigned to "${coordData.assignedYear}" and cannot register for "${canonicalYear}".`
        );
      }
    }

    // 5b. Prepare chest number allocation for Athletics events (READ PHASE - must precede writes)
    const isAthletics = isAthleticsEvent(preEvent.category);
    let preparedChest: PreparedChestResult | null = null;
    if (isAthletics) {
      const studentsForAlloc = participantIds.map((pid, idx) => {
        const snap = studentSnaps[idx];
        const sData = snap.data();
        const summary = participantsSnapshot.find((p) => p.studentId === pid);
        return {
          studentId: pid,
          studentRef: studentRefs[idx],
          studentSnap: snap,
          name: sData?.name || summary?.name || 'Athlete',
          registerNumber: sData?.registerNumber || summary?.registerNumber || '',
          year: sData?.year || canonicalYear,
          class: sData?.class || summary?.class,
          department: sData?.department || summary?.department,
        };
      });

      preparedChest = await prepareChestNumberAllocationsInTransaction(
        transaction,
        studentsForAlloc,
        coordinatorId
      );
      preparedChestAllocations = preparedChest;
    }

    // === ALL WRITES OCCUR HERE (AFTER ALL READS) ===

    // Commit chest number mapping & counter updates
    if (preparedChest) {
      commitChestNumberAllocationsInTransaction(transaction, preparedChest);
    }

    // 6. Concurrency touch to ensure atomic OCC serialization & assign chestNumber to student record
    for (let i = 0; i < studentRefs.length; i++) {
      const studentRef = studentRefs[i];
      const pid = participantIds[i];
      const studentUpdates: Record<string, any> = {
        lastRegistrationAt: serverTimestamp(),
      };
      const assignedChest = preparedChest?.allocatedMap.get(pid);
      if (assignedChest) {
        studentUpdates.chestNumber = assignedChest;
      }
      transaction.update(studentRef, studentUpdates);
    }

    // 9. Prepare new registration record with assigned chest numbers in participantsSnapshot
    const registrationRef = doc(collection(db, 'registrations'));
    const registrationId = generateRegistrationId();

    const finalParticipantsSnapshot: StudentParticipantSummary[] = participantsSnapshot.map((p) => {
      const chestNum = preparedChest?.allocatedMap.get(p.studentId) || p.chestNumber;
      return {
        ...p,
        ...(chestNum ? { chestNumber: chestNum } : {}),
      };
    });

    const rawRegistration: Record<string, any> = {
      registrationId,
      docId: registrationRef.id,
      id: registrationRef.id,
      eventId,
      eventNameSnapshot: event.eventName,
      year: canonicalYear,
      class: className,
      department,
      participantIds,
      participantsSnapshot: finalParticipantsSnapshot,
      participantCount: incomingCount,
      registrationType,
      status: 'registered',
      coordinatorId,
      coordinatorName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: coordinatorId,
      updatedBy: coordinatorId,
    };

    if (teamName?.trim()) {
      rawRegistration.teamName = teamName.trim();
    }
    if (captainId) {
      rawRegistration.captainId = captainId;
    }
    if (captainName) {
      rawRegistration.captainName = captainName;
    }
    if (relayOrder && relayOrder.length > 0) {
      rawRegistration.relayOrder = relayOrder;
    }
    if (coordinatorEmail) {
      rawRegistration.coordinatorEmail = coordinatorEmail;
    }

    const newRegistration = removeUndefined(rawRegistration) as Registration;

    // 10. Atomically update event participant list & year registration summary
    const updatedRegisteredList = Array.from(new Set([...Array.from(registeredIds), ...participantIds]));
    
    transaction.update(eventRef, {
      [`yearRegistrations.${canonicalYear}`]: {
        registrationId,
        docId: registrationRef.id,
        participantCount: incomingCount,
        teamName: teamName?.trim() || '',
        status: 'registered',
        updatedAt: serverTimestamp(),
      },
      registeredParticipantIds: updatedRegisteredList,
      updatedAt: serverTimestamp(),
    });

    // 11. Write registration doc
    transaction.set(registrationRef, newRegistration);

    return newRegistration;
  });

  // Log audit activity for newly allocated chest numbers
  if (preparedChestAllocations) {
    for (const alloc of (preparedChestAllocations as PreparedChestResult).allocations.filter((a) => a.isNew)) {
      recordActivity(
        'CHEST_NUMBER_ASSIGNED',
        coordinatorId,
        coordinatorName,
        'year_coordinator' as any,
        'chestNumber',
        alloc.chestNumber,
        {
          studentId: alloc.studentId,
          studentName: alloc.candidateData?.studentName,
          registerNumber: alloc.candidateData?.registerNumber,
          academicYear: alloc.candidateData?.year,
          assignedChestNumber: alloc.chestNumber,
          performedByUid: coordinatorId,
          timestamp: new Date().toISOString(),
        }
      ).catch((err) => console.warn('Activity log for chest number assignment failed:', err));
    }
  }

  return resultRegistration;
};

/**
 * Atomic registration update transaction allowing Year Coordinators to edit players,
 * captain, and team name while registration is open.
 */
export const updateRegistrationWithTransaction = async (params: {
  registrationId: string;
  participantIds: string[];
  participantsSnapshot: StudentParticipantSummary[];
  teamName?: string;
  captainId?: string;
  captainName?: string;
  relayOrder?: RelayPosition[];
  updatedByUid: string;
  isSuperCoordinator: boolean;
  scopedYear?: string;
}): Promise<void> => {
  const {
    registrationId,
    participantIds,
    participantsSnapshot,
    teamName,
    captainId,
    captainName,
    relayOrder,
    updatedByUid,
    isSuperCoordinator,
    scopedYear,
  } = params;

  if (participantIds.length === 0) {
    throw new Error('Registration must contain at least one participant.');
  }

  const resolvedDocId = await resolveRegistrationDocId(registrationId, scopedYear);
  if (!resolvedDocId) {
    throw new Error(`Registration record "${registrationId}" not found.`);
  }

  // Pre-validate participation limits for incoming participants, excluding this registration
  const settings = await getCollegeSettings();
  const { gamesLimit, athleticsLimit } = getParticipationLimits(settings);

  const existingRegRef = doc(db, 'registrations', resolvedDocId);
  const existingRegSnap = await getDoc(existingRegRef);
  if (!existingRegSnap.exists()) {
    throw new Error('Registration record not found.');
  }
  const existingReg = existingRegSnap.data() as Registration;
  const canonicalYear = normalizeAcademicYear(existingReg.year);

  const eventSnapPre = await getDoc(doc(db, 'events', existingReg.eventId));
  if (!eventSnapPre.exists()) {
    throw new Error('Associated competition event not found.');
  }
  const preEvent = normalizeEventDoc(eventSnapPre.data(), eventSnapPre.id);

  // Pre-fetch cohort registrations with year constraint (satisfies Firestore security rules for Year Coordinator)
  const cohortRegs = await getScopedRegistrations(canonicalYear);
  const eventsCache = new Map<string, Event>();
  eventsCache.set(existingReg.eventId, preEvent);

  for (const pid of participantIds) {
    const studentInfo = participantsSnapshot.find((s) => s.studentId === pid);
    const studentName = studentInfo?.name || 'Selected student';
    const { games, athletics } = await getStudentParticipationCount(
      pid,
      eventsCache,
      resolvedDocId,
      canonicalYear,
      cohortRegs
    );
    validateStudentParticipationLimit({
      studentName,
      eventCategory: preEvent.category,
      currentActiveGames: games,
      currentActiveAthletics: athletics,
      gamesLimit,
      athleticsLimit,
    });
  }

  let preparedChestAllocations: PreparedChestResult | null = null;

  await runTransaction(db, async (transaction) => {
    const regRef = doc(db, 'registrations', resolvedDocId);
    const regSnap = await transaction.get(regRef);

    if (!regSnap.exists()) {
      throw new Error('Registration record not found.');
    }

    const reg = regSnap.data() as Registration;
    if (reg.status !== 'registered') {
      throw new Error(`Cannot edit registration because its status is ${reg.status}.`);
    }

    const canonicalYear = normalizeAcademicYear(reg.year);

    // 1. Read event
    const eventRef = doc(db, 'events', reg.eventId);
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists()) {
      throw new Error('Associated competition event not found.');
    }
    const event = normalizeEventDoc(eventSnap.data(), eventSnap.id);

    // 2. Validate event status & window if not super_coordinator
    if (!isSuperCoordinator) {
      const { isOpen, reason } = isEventRegistrationOpen(event);
      if (!isOpen) {
        throw new Error(`Cannot edit registration: ${reason}`);
      }
    }

    // 3. Validate capacity limits
    const incomingCount = participantIds.length;
    const maxAllowed = event.maxParticipantsPerYear;

    if (reg.registrationType === 'team') {
      const minRequired = event.minParticipantsPerYear || 2;
      if (incomingCount < minRequired) {
        throw new Error(
          `Team event requires at least ${minRequired} players. Currently selected: ${incomingCount}.`
        );
      }
      if (incomingCount > maxAllowed) {
        throw new Error(
          `Team size cannot exceed maximum limit of ${maxAllowed} players.`
        );
      }
    } else if (reg.registrationType === 'individual') {
      if (incomingCount > maxAllowed) {
        throw new Error(
          `Cannot exceed maximum limit of ${maxAllowed} participant(s) per year.`
        );
      }
    } else if (reg.registrationType === 'relay') {
      const requiredRelaySize = event.maxParticipantsPerYear || 4;
      if (incomingCount !== requiredRelaySize) {
        throw new Error(
          `Relay event requires exactly ${requiredRelaySize} runners.`
        );
      }
    }

    // 2. Read all student docs inside transaction before any writes
    const studentRefs = participantIds.map((pid) => doc(db, 'students', pid));
    const studentSnaps = await Promise.all(studentRefs.map((ref) => transaction.get(ref)));

    // 4. Validate Student Documents: active status and academic year scope
    for (let i = 0; i < participantIds.length; i++) {
      const pid = participantIds[i];
      const studentSnap = studentSnaps[i];
      if (!studentSnap.exists()) {
        throw new Error(`Student record "${pid}" not found in database.`);
      }
      const studentData = studentSnap.data();
      if (!studentData.active) {
        throw new Error(`Student "${studentData.name}" is inactive.`);
      }
      const studentYear = normalizeAcademicYear(studentData.year || studentData.academicYear);
      if (studentYear !== canonicalYear) {
        throw new Error(
          `Security violation: Student "${studentData.name}" belongs to "${studentData.year || studentYear}", but this registration is scoped to "${canonicalYear}".`
        );
      }
    }

    // 5. Duplicate student check across other teams
    const currentGlobalIds = new Set<string>(event.registeredParticipantIds || []);
    // Remove previous participants of this registration from check set
    for (const oldPid of reg.participantIds) {
      currentGlobalIds.delete(oldPid);
    }
    for (const pid of participantIds) {
      if (currentGlobalIds.has(pid)) {
        const dupStudent = participantsSnapshot.find((s) => s.studentId === pid);
        const name = dupStudent ? dupStudent.name : 'A selected student';
        throw new Error(
          `${name} is already registered on another team for "${event.eventName}".`
        );
      }
    }

    // 5b. Prepare chest number allocation for Athletics events (READ PHASE - must precede writes)
    const isAthletics = isAthleticsEvent(preEvent.category);
    let preparedChest: PreparedChestResult | null = null;
    if (isAthletics) {
      const studentsForAlloc = participantIds.map((pid, idx) => {
        const snap = studentSnaps[idx];
        const sData = snap.data();
        const summary = participantsSnapshot.find((p) => p.studentId === pid);
        return {
          studentId: pid,
          studentRef: studentRefs[idx],
          studentSnap: snap,
          name: sData?.name || summary?.name || 'Athlete',
          registerNumber: sData?.registerNumber || summary?.registerNumber || '',
          year: sData?.year || canonicalYear,
          class: sData?.class || summary?.class,
          department: sData?.department || summary?.department,
        };
      });

      preparedChest = await prepareChestNumberAllocationsInTransaction(
        transaction,
        studentsForAlloc,
        updatedByUid
      );
      preparedChestAllocations = preparedChest;
    }

    // === ALL WRITES OCCUR HERE (AFTER ALL READS) ===

    if (preparedChest) {
      commitChestNumberAllocationsInTransaction(transaction, preparedChest);
    }

    const finalParticipantsSnapshot: StudentParticipantSummary[] = participantsSnapshot.map((p) => {
      const chestNum = preparedChest?.allocatedMap.get(p.studentId) || p.chestNumber;
      return {
        ...p,
        ...(chestNum ? { chestNumber: chestNum } : {}),
      };
    });

    // 6. Update registration doc
    const rawUpdates: Record<string, any> = {
      participantIds,
      participantsSnapshot: finalParticipantsSnapshot,
      participantCount: incomingCount,
      updatedBy: updatedByUid,
      updatedAt: serverTimestamp(),
    };

    if (teamName?.trim() || reg.teamName) {
      rawUpdates.teamName = teamName?.trim() || reg.teamName;
    }
    if (captainId || reg.captainId) {
      rawUpdates.captainId = captainId || reg.captainId;
    }
    if (captainName || reg.captainName) {
      rawUpdates.captainName = captainName || reg.captainName;
    }
    if (relayOrder || reg.relayOrder) {
      rawUpdates.relayOrder = relayOrder || reg.relayOrder;
    }

    // 6. Concurrency touch and assign chest numbers on student records (Write phase)
    for (let i = 0; i < studentRefs.length; i++) {
      const studentRef = studentRefs[i];
      const pid = participantIds[i];
      const studentUpdates: Record<string, any> = {
        lastRegistrationAt: serverTimestamp(),
      };
      const assignedChest = preparedChest?.allocatedMap.get(pid);
      if (assignedChest) {
        studentUpdates.chestNumber = assignedChest;
      }
      transaction.update(studentRef, studentUpdates);
    }

    const cleanUpdates = removeUndefined(rawUpdates);
    transaction.update(regRef, cleanUpdates);

    // 7. Update event year summary and registeredParticipantIds
    const updatedGlobalList = Array.from(new Set([...Array.from(currentGlobalIds), ...participantIds]));
    transaction.update(eventRef, {
      [`yearRegistrations.${canonicalYear}`]: {
        registrationId,
        participantCount: incomingCount,
        teamName: teamName?.trim() || reg.teamName || '',
        status: 'registered',
        updatedAt: serverTimestamp(),
      },
      registeredParticipantIds: updatedGlobalList,
      updatedAt: serverTimestamp(),
    });
  });

  // Log audit activity for any newly allocated chest numbers
  if (preparedChestAllocations) {
    for (const alloc of (preparedChestAllocations as PreparedChestResult).allocations.filter((a) => a.isNew)) {
      recordActivity(
        'CHEST_NUMBER_ASSIGNED',
        updatedByUid,
        'Coordinator',
        'year_coordinator' as any,
        'chestNumber',
        alloc.chestNumber,
        {
          studentId: alloc.studentId,
          studentName: alloc.candidateData?.studentName,
          registerNumber: alloc.candidateData?.registerNumber,
          academicYear: alloc.candidateData?.year,
          assignedChestNumber: alloc.chestNumber,
          performedByUid: updatedByUid,
          timestamp: new Date().toISOString(),
        }
      ).catch((err) => console.warn('Activity log for chest number assignment failed:', err));
    }
  }
};

/**
 * Cancel a registration atomically and release per-year capacity
 */
export const cancelRegistrationWithTransaction = async (
  regDocId: string,
  cancelledByUid: string,
  isSuperCoordinator: boolean,
  scopedYear?: string
): Promise<void> => {
  const resolvedDocId = await resolveRegistrationDocId(regDocId, scopedYear);
  if (!resolvedDocId) {
    throw new Error(`Registration record "${regDocId}" not found.`);
  }

  await runTransaction(db, async (transaction) => {
    const regRef = doc(db, 'registrations', resolvedDocId);
    const regSnap = await transaction.get(regRef);

    if (!regSnap.exists()) {
      throw new Error('Registration not found.');
    }

    const registration = regSnap.data() as Registration;
    if (registration.status === 'cancelled') {
      throw new Error('This registration is already cancelled.');
    }

    const canonicalYear = normalizeAcademicYear(registration.year);
    const eventRef = doc(db, 'events', registration.eventId);
    const eventSnap = await transaction.get(eventRef);

    if (eventSnap.exists()) {
      const event = normalizeEventDoc(eventSnap.data(), eventSnap.id);

      // Year Coordinators cannot cancel if event is closed or deadline passed unless super_coordinator
      if (!isSuperCoordinator) {
        const { isOpen, reason } = isEventRegistrationOpen(event);
        if (!isOpen) {
          throw new Error(`Cannot cancel registration: ${reason}`);
        }
      }

      // Remove participant IDs from event participant list
      const currentList = event.registeredParticipantIds || [];
      const cancelledIdsSet = new Set(registration.participantIds);
      const updatedList = currentList.filter((id) => !cancelledIdsSet.has(id));

      transaction.update(eventRef, {
        [`yearRegistrations.${canonicalYear}`]: {
          registrationId: registration.registrationId,
          participantCount: 0,
          status: 'cancelled',
          updatedAt: serverTimestamp(),
        },
        registeredParticipantIds: updatedList,
        updatedAt: serverTimestamp(),
      });
    }

    transaction.update(regRef, {
      status: 'cancelled',
      updatedBy: cancelledByUid,
      updatedAt: serverTimestamp(),
    });
  });
};
