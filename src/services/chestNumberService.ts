import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  runTransaction,
  writeBatch,
  Transaction,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ChestNumberRecord, Student, Registration, UserRole } from '../types';
import { normalizeAcademicYear } from '../utils/academicYear';
import { recordActivity } from './activityLogService';
import { isAthleticsEvent } from './participationService';
import { normalizeEventDoc } from './eventService';

/**
 * Academic year to single-digit chest number prefix mapping
 * 1ST YEAR -> '1'
 * 2ND YEAR -> '2'
 * 3RD YEAR -> '3'
 * 4TH YEAR -> '4'
 */
export const getChestNumberPrefix = (year: string): string => {
  const canonical = normalizeAcademicYear(year);
  switch (canonical) {
    case '1ST YEAR':
      return '1';
    case '2ND YEAR':
      return '2';
    case '3RD YEAR':
      return '3';
    case '4TH YEAR':
      return '4';
    default:
      if (canonical.includes('1')) return '1';
      if (canonical.includes('2')) return '2';
      if (canonical.includes('3')) return '3';
      if (canonical.includes('4')) return '4';
      throw new Error(`Unsupported academic year "${year}" for chest number allocation.`);
  }
};

/**
 * Validates if a chest number string matches requirements:
 * Exactly 4 digits, prefix matching academic year, suffix in 001-999.
 */
export const isValidChestNumberForYear = (chestNumber: string, year: string): boolean => {
  if (!chestNumber || !/^\d{4}$/.test(chestNumber.trim())) {
    return false;
  }
  const cleanNumber = chestNumber.trim();
  try {
    const expectedPrefix = getChestNumberPrefix(year);
    if (!cleanNumber.startsWith(expectedPrefix)) {
      return false;
    }
    const suffixNum = parseInt(cleanNumber.substring(1), 10);
    return suffixNum >= 1 && suffixNum <= 999;
  } catch {
    return false;
  }
};

/**
 * Fetch all chest number records (Super Coordinator & View Coordinator)
 */
export const getAllChestNumbers = async (): Promise<ChestNumberRecord[]> => {
  const colRef = collection(db, 'chestNumbers');
  const snapshot = await getDocs(colRef);
  return snapshot.docs.map((d) => ({
    ...(d.data() as ChestNumberRecord),
    chestNumber: d.id,
  }));
};

/**
 * Fetch chest numbers scoped to an academic year (Year Coordinator)
 */
export const getScopedChestNumbers = async (year: string): Promise<ChestNumberRecord[]> => {
  const canonicalYear = normalizeAcademicYear(year);
  const colRef = collection(db, 'chestNumbers');
  const q = query(colRef, where('year', '==', canonicalYear));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    ...(d.data() as ChestNumberRecord),
    chestNumber: d.id,
  }));
};

/**
 * Fetch a specific chest number mapping by number
 */
export const getChestNumberRecord = async (chestNumber: string): Promise<ChestNumberRecord | null> => {
  if (!chestNumber) return null;
  const docRef = doc(db, 'chestNumbers', chestNumber.trim());
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return {
    ...(snap.data() as ChestNumberRecord),
    chestNumber: snap.id,
  };
};

export interface StudentToAllocate {
  studentId: string;
  name: string;
  registerNumber: string;
  year: string;
  class?: string;
  department?: string;
  existingChestNumber?: string;
}

export interface PreparedChestAllocation {
  studentId: string;
  studentRef: any;
  chestNumber: string;
  isNew: boolean;
  candidateRef?: any;
  candidateData?: ChestNumberRecord;
}

export interface PreparedChestResult {
  allocations: PreparedChestAllocation[];
  counterRef?: any;
  updatedCounters?: Record<string, number>;
  allocatedMap: Map<string, string>;
}

/**
 * Phase 1 (READ ONLY):
 * Evaluates student docs, reuses existing numbers, and if new numbers are needed,
 * reads counters/chestNumbers and candidate documents via transaction.get.
 * Performs ZERO writes.
 */
export const prepareChestNumberAllocationsInTransaction = async (
  transaction: Transaction,
  students: Array<{
    studentId: string;
    studentRef: any;
    studentSnap: any;
    name: string;
    registerNumber: string;
    year: string;
    class?: string;
    department?: string;
  }>,
  coordinatorId: string
): Promise<PreparedChestResult> => {
  const allocatedMap = new Map<string, string>();
  const allocations: PreparedChestAllocation[] = [];

  const studentsNeedingAllocation: Array<{
    student: (typeof students)[0];
    canonicalYear: string;
    prefix: string;
  }> = [];

  for (const s of students) {
    const snapData = s.studentSnap?.exists() ? s.studentSnap.data() : null;
    const existingNum = snapData?.chestNumber;

    if (existingNum && typeof existingNum === 'string' && existingNum.trim().length === 4) {
      const cleanNum = existingNum.trim();
      allocatedMap.set(s.studentId, cleanNum);
      allocations.push({
        studentId: s.studentId,
        studentRef: s.studentRef,
        chestNumber: cleanNum,
        isNew: false,
      });
    } else {
      const canonicalYear = normalizeAcademicYear(s.year || snapData?.year);
      const prefix = getChestNumberPrefix(canonicalYear);
      studentsNeedingAllocation.push({
        student: s,
        canonicalYear,
        prefix,
      });
    }
  }

  if (studentsNeedingAllocation.length === 0) {
    return {
      allocations,
      allocatedMap,
    };
  }

  // Read counter doc inside transaction
  const counterRef = doc(db, 'counters', 'chestNumbers');
  const counterSnap = await transaction.get(counterRef);
  const counterData: Record<string, number> = counterSnap.exists()
    ? (counterSnap.data() as Record<string, number>)
    : {
        '1ST YEAR': 0,
        '2ND YEAR': 0,
        '3RD YEAR': 0,
        '4TH YEAR': 0,
      };

  const updatedCounters = { ...counterData };

  for (const item of studentsNeedingAllocation) {
    const { student, canonicalYear, prefix } = item;
    let suffix = (updatedCounters[canonicalYear] || 0) + 1;
    let allocatedCandidate = '';
    let foundRef: any = null;

    while (suffix <= 999) {
      const candidateStr = `${prefix}${String(suffix).padStart(3, '0')}`;
      const candidateRef = doc(db, 'chestNumbers', candidateStr);
      const candidateSnap = await transaction.get(candidateRef);

      if (!candidateSnap.exists()) {
        allocatedCandidate = candidateStr;
        foundRef = candidateRef;
        updatedCounters[canonicalYear] = suffix;
        break;
      } else {
        const existingData = candidateSnap.data();
        if (existingData?.studentId === student.studentId) {
          allocatedCandidate = candidateStr;
          foundRef = candidateRef;
          updatedCounters[canonicalYear] = Math.max(updatedCounters[canonicalYear] || 0, suffix);
          break;
        }
        suffix++;
      }
    }

    if (!allocatedCandidate || !foundRef) {
      throw new Error(
        `Chest number capacity exhausted for ${canonicalYear}. Range 001-999 is full.`
      );
    }

    allocatedMap.set(student.studentId, allocatedCandidate);

    allocations.push({
      studentId: student.studentId,
      studentRef: student.studentRef,
      chestNumber: allocatedCandidate,
      isNew: true,
      candidateRef: foundRef,
      candidateData: {
        chestNumber: allocatedCandidate,
        studentId: student.studentId,
        studentName: student.name,
        registerNumber: student.registerNumber,
        year: canonicalYear,
        class: student.class || '',
        department: student.department || '',
        assignedAt: serverTimestamp(),
        assignedBy: coordinatorId || 'system',
      },
    });
  }

  return {
    allocations,
    counterRef,
    updatedCounters,
    allocatedMap,
  };
};

/**
 * Phase 2 (WRITE ONLY):
 * Queues writes for all newly prepared chest number allocations and counter updates.
 */
export const commitChestNumberAllocationsInTransaction = (
  transaction: Transaction,
  prepared: PreparedChestResult,
  options?: { updateStudent?: boolean }
): void => {
  const updateStudent = options?.updateStudent ?? false;
  for (const alloc of prepared.allocations) {
    if (alloc.isNew && alloc.candidateRef && alloc.candidateData) {
      transaction.set(alloc.candidateRef, alloc.candidateData);
      if (updateStudent) {
        transaction.update(alloc.studentRef, {
          chestNumber: alloc.chestNumber,
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  if (prepared.counterRef && prepared.updatedCounters) {
    transaction.set(
      prepared.counterRef,
      {
        ...prepared.updatedCounters,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
};

/**
 * Standalone allocation helper combining prepare & commit
 */
export const allocateChestNumbersInTransaction = async (
  transaction: Transaction,
  students: StudentToAllocate[],
  coordinatorId: string
): Promise<Map<string, string>> => {
  if (students.length === 0) return new Map();

  const studentDocRefs = students.map((s) => ({
    student: s,
    ref: doc(db, 'students', s.studentId),
  }));

  const studentSnaps = await Promise.all(studentDocRefs.map((item) => transaction.get(item.ref)));

  const preparedInput = studentDocRefs.map((item, idx) => ({
    studentId: item.student.studentId,
    studentRef: item.ref,
    studentSnap: studentSnaps[idx],
    name: item.student.name,
    registerNumber: item.student.registerNumber,
    year: item.student.year,
    class: item.student.class,
    department: item.student.department,
  }));

  const prepared = await prepareChestNumberAllocationsInTransaction(
    transaction,
    preparedInput,
    coordinatorId
  );

  commitChestNumberAllocationsInTransaction(transaction, prepared, { updateStudent: true });

  return prepared.allocatedMap;
};

/**
 * Administrative correction of a chest number (Super Coordinator only).
 * Performs atomic updates across students/{studentId}, chestNumbers/{number},
 * active athletics registrations, and logs the action.
 */
export const adminCorrectChestNumber = async (params: {
  studentId: string;
  newChestNumber: string;
  userRole: UserRole;
  actorUid: string;
  actorName: string;
  reason?: string;
}): Promise<void> => {
  const { studentId, newChestNumber, userRole, actorUid, actorName, reason } = params;

  if (userRole !== 'super_coordinator') {
    throw new Error('Unauthorized: Only Super Coordinator can manually correct chest numbers.');
  }

  const cleanNewNum = newChestNumber.trim();
  if (!cleanNewNum || !/^\d{4}$/.test(cleanNewNum)) {
    throw new Error('Invalid chest number: Must be exactly four digits.');
  }

  // Read student doc first to check year and existing number
  const studentRef = doc(db, 'students', studentId);
  const studentSnap = await getDoc(studentRef);
  if (!studentSnap.exists()) {
    throw new Error(`Student record "${studentId}" not found.`);
  }

  const student = studentSnap.data() as Student;
  const canonicalYear = normalizeAcademicYear(student.year);

  if (!isValidChestNumberForYear(cleanNewNum, canonicalYear)) {
    const expectedPrefix = getChestNumberPrefix(canonicalYear);
    throw new Error(
      `Invalid chest number "${cleanNewNum}" for ${canonicalYear}. It must start with "${expectedPrefix}" and range from ${expectedPrefix}001 to ${expectedPrefix}999.`
    );
  }

  const previousChestNumber = student.chestNumber || null;
  if (previousChestNumber === cleanNewNum) {
    return; // No change needed
  }

  // Transactionally verify collision and update mapping
  await runTransaction(db, async (transaction) => {
    const newMappingRef = doc(db, 'chestNumbers', cleanNewNum);
    const newMappingSnap = await transaction.get(newMappingRef);

    if (newMappingSnap.exists()) {
      const existingData = newMappingSnap.data() as ChestNumberRecord;
      if (existingData.studentId !== studentId) {
        throw new Error(
          `Chest number "${cleanNewNum}" is already assigned to student "${existingData.studentName}" (${existingData.registerNumber}).`
        );
      }
    }

    let oldMappingRef = null;
    if (previousChestNumber) {
      oldMappingRef = doc(db, 'chestNumbers', previousChestNumber);
    }

    // Set new mapping
    transaction.set(newMappingRef, {
      chestNumber: cleanNewNum,
      studentId: student.studentId,
      studentName: student.name,
      registerNumber: student.registerNumber,
      year: canonicalYear,
      class: student.class || '',
      department: student.department || '',
      assignedAt: serverTimestamp(),
      assignedBy: actorUid,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });

    // Update student doc
    transaction.update(studentRef, {
      chestNumber: cleanNewNum,
      updatedAt: serverTimestamp(),
    });

    // Delete old mapping if different
    if (oldMappingRef && previousChestNumber !== cleanNewNum) {
      transaction.delete(oldMappingRef);
    }
  });

  // Update participantsSnapshot in any existing active athletics registrations for this student
  try {
    const regCol = collection(db, 'registrations');
    const regQuery = query(regCol, where('participantIds', 'array-contains', studentId));
    const regSnaps = await getDocs(regQuery);

    if (!regSnaps.empty) {
      const batch = writeBatch(db);
      let needsBatchCommit = false;

      for (const regDoc of regSnaps.docs) {
        const regData = regDoc.data() as Registration;
        if (regData.status === 'registered' && regData.participantsSnapshot) {
          let updatedSnapshot = false;
          const newSnapshot = regData.participantsSnapshot.map((p) => {
            if (p.studentId === studentId) {
              updatedSnapshot = true;
              return { ...p, chestNumber: cleanNewNum };
            }
            return p;
          });

          if (updatedSnapshot) {
            batch.update(regDoc.ref, {
              participantsSnapshot: newSnapshot,
              updatedAt: serverTimestamp(),
            });
            needsBatchCommit = true;
          }
        }
      }

      if (needsBatchCommit) {
        await batch.commit();
      }
    }
  } catch (err) {
    console.warn('Non-fatal: could not update snapshot in historical registrations:', err);
  }

  // Audit log
  await recordActivity(
    'CHEST_NUMBER_CORRECTED',
    actorUid,
    actorName,
    userRole,
    'chestNumber',
    cleanNewNum,
    {
      studentId,
      studentName: student.name,
      registerNumber: student.registerNumber,
      academicYear: canonicalYear,
      previousChestNumber,
      assignedChestNumber: cleanNewNum,
      reason: reason || 'Administrative correction',
      performedByUid: actorUid,
    }
  );
};

/**
 * Backfill chest numbers for existing athletics participants who lack one.
 * Controlled operation available to Super Coordinator.
 */
export const backfillExistingAthleticsChestNumbers = async (
  actorUid: string,
  actorName: string,
  userRole: UserRole
): Promise<{ assignedCount: number; message: string }> => {
  if (userRole !== 'super_coordinator') {
    throw new Error('Unauthorized: Only Super Coordinator can run chest number backfill.');
  }

  // 1. Fetch all events to identify athletics events
  const eventsCol = collection(db, 'events');
  const eventsSnap = await getDocs(eventsCol);
  const athleticsEventIds = new Set<string>();

  eventsSnap.docs.forEach((d) => {
    const evt = normalizeEventDoc(d.data(), d.id);
    if (isAthleticsEvent(evt.category)) {
      athleticsEventIds.add(evt.eventId);
    }
  });

  if (athleticsEventIds.size === 0) {
    return { assignedCount: 0, message: 'No athletics events configured.' };
  }

  // 2. Fetch all registered registrations for these athletics events
  const regCol = collection(db, 'registrations');
  const regSnap = await getDocs(query(regCol, where('status', '==', 'registered')));

  const athleticsRegs: Registration[] = [];
  const participantStudentIds = new Set<string>();

  regSnap.docs.forEach((d) => {
    const r = { ...(d.data() as Registration), docId: d.id, id: d.id };
    if (athleticsEventIds.has(r.eventId)) {
      athleticsRegs.push(r);
      (r.participantIds || []).forEach((pid) => participantStudentIds.add(pid));
    }
  });

  if (participantStudentIds.size === 0) {
    return { assignedCount: 0, message: 'No active participants found in athletics events.' };
  }

  // 3. Check which students do not have chestNumber
  const studentsToBackfill: StudentToAllocate[] = [];
  for (const pid of participantStudentIds) {
    const sRef = doc(db, 'students', pid);
    const sSnap = await getDoc(sRef);
    if (sSnap.exists()) {
      const sData = sSnap.data() as Student;
      if (!sData.chestNumber) {
        studentsToBackfill.push({
          studentId: pid,
          name: sData.name,
          registerNumber: sData.registerNumber,
          year: sData.year,
          class: sData.class,
          department: sData.department,
        });
      }
    }
  }

  if (studentsToBackfill.length === 0) {
    return { assignedCount: 0, message: 'All active athletics participants already have chest numbers assigned.' };
  }

  // 4. Run transaction to allocate chest numbers safely
  const allocationMap = await runTransaction(db, async (transaction) => {
    return await allocateChestNumbersInTransaction(transaction, studentsToBackfill, actorUid);
  });

  // 5. Update participantsSnapshot in registrations
  if (allocationMap.size > 0) {
    const batch = writeBatch(db);
    let dirty = false;

    for (const reg of athleticsRegs) {
      if (reg.participantsSnapshot && reg.participantsSnapshot.length > 0) {
        let changed = false;
        const newSnapshot = reg.participantsSnapshot.map((p) => {
          const newlyAssigned = allocationMap.get(p.studentId);
          if (newlyAssigned && p.chestNumber !== newlyAssigned) {
            changed = true;
            return { ...p, chestNumber: newlyAssigned };
          }
          return p;
        });

        if (changed) {
          const rRef = doc(db, 'registrations', reg.docId || reg.registrationId || (reg as any).id);
          batch.update(rRef, {
            participantsSnapshot: newSnapshot,
            updatedAt: serverTimestamp(),
          });
          dirty = true;
        }
      }
    }

    if (dirty) {
      await batch.commit();
    }

    // Audit log
    await recordActivity(
      'CHEST_NUMBER_BACKFILL_COMPLETED',
      actorUid,
      actorName,
      userRole,
      'chestNumber',
      'backfill',
      {
        assignedCount: allocationMap.size,
        performedByUid: actorUid,
        timestamp: new Date().toISOString(),
      }
    );
  }

  return {
    assignedCount: allocationMap.size,
    message: `Successfully backfilled chest numbers for ${allocationMap.size} athletics participants.`,
  };
};
