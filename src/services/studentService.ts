import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Student } from '../types';

import { normalizeAcademicYear } from '../utils/academicYear';

/**
 * Fetch all students
 */
export const getAllStudents = async (): Promise<Student[]> => {
  const colRef = collection(db, 'students');
  const snapshot = await getDocs(colRef);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      studentId: data.studentId || d.id,
      year: normalizeAcademicYear(data.year || data.academicYear),
    } as Student;
  });
};

/**
 * Fetch students strictly scoped to a specific year and optional class (Year Coordinator)
 */
export const getScopedStudents = async (
  year: string,
  className?: string
): Promise<Student[]> => {
  const canonicalYear = normalizeAcademicYear(year);
  const colRef = collection(db, 'students');
  let q = query(colRef, where('year', '==', canonicalYear), where('active', '==', true));

  if (className) {
    q = query(q, where('class', '==', className));
  }

  const snapshot = await getDocs(q);
  let results = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      studentId: data.studentId || d.id,
      year: normalizeAcademicYear(data.year || data.academicYear),
    } as Student;
  });

  // Fallback if no records found and year was not identical to canonical
  if (results.length === 0 && year && year !== canonicalYear) {
    try {
      let fallbackQ = query(colRef, where('year', '==', year), where('active', '==', true));
      if (className) fallbackQ = query(fallbackQ, where('class', '==', className));
      const fallbackSnap = await getDocs(fallbackQ);
      results = fallbackSnap.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          studentId: data.studentId || d.id,
          year: normalizeAcademicYear(data.year || data.academicYear),
        } as Student;
      });
    } catch {
      // ignore fallback error
    }
  }

  return results;
};

/**
 * Fetch all students in a specific academic year (both active and inactive, for Year Coordinator view)
 */
export const getStudentsByYear = async (year: string): Promise<Student[]> => {
  const canonicalYear = normalizeAcademicYear(year);
  const colRef = collection(db, 'students');
  const q = query(colRef, where('year', '==', canonicalYear));
  const snapshot = await getDocs(q);
  let results = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      studentId: data.studentId || d.id,
      year: normalizeAcademicYear(data.year || data.academicYear),
    } as Student;
  });

  // Fallback if no records found and year was not identical to canonical (e.g. legacy "4th Year")
  if (results.length === 0 && year && year !== canonicalYear) {
    try {
      const fallbackQ = query(colRef, where('year', '==', year));
      const fallbackSnap = await getDocs(fallbackQ);
      results = fallbackSnap.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          studentId: data.studentId || d.id,
          year: normalizeAcademicYear(data.year || data.academicYear),
        } as Student;
      });
    } catch {
      // ignore fallback error
    }
  }

  return results;
};

/**
 * Fetch a single student by ID
 */
export const getStudentById = async (studentId: string): Promise<Student | null> => {
  const docRef = doc(db, 'students', studentId);
  const snap = await getDoc(docRef);
  return snap.exists() ? (snap.data() as Student) : null;
};

/**
 * Check if registerNumber already exists
 */
export const isRegisterNumberDuplicate = async (
  registerNumber: string
): Promise<boolean> => {
  const colRef = collection(db, 'students');
  const q = query(colRef, where('registerNumber', '==', registerNumber.trim()));
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

/**
 * Fast bulk lookup to check which register numbers already exist in Firestore
 */
export const findExistingRegisterNumbers = async (
  numbers: string[]
): Promise<Set<string>> => {
  const existingSet = new Set<string>();
  if (numbers.length === 0) return existingSet;

  // Query in chunks of 30 (Firestore 'in' query limit is 30)
  const chunkSize = 30;
  for (let i = 0; i < numbers.length; i += chunkSize) {
    const chunk = numbers.slice(i, i + chunkSize);
    const colRef = collection(db, 'students');
    const q = query(colRef, where('registerNumber', 'in', chunk));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data() as Student;
      existingSet.add(data.registerNumber);
    });
  }

  return existingSet;
};

/**
 * Add an individual student manually
 */
export const addStudent = async (
  studentData: Omit<Student, 'studentId' | 'createdAt' | 'updatedAt'>,
  createdByUid: string
): Promise<Student> => {
  const duplicate = await isRegisterNumberDuplicate(studentData.registerNumber);
  if (duplicate) {
    throw new Error(`Student with register number "${studentData.registerNumber}" already exists.`);
  }

  const studentRef = doc(collection(db, 'students'));
  const studentId = studentRef.id;

  const newStudent: Student = {
    ...studentData,
    year: normalizeAcademicYear(studentData.year),
    studentId,
    active: studentData.active ?? true,
    createdBy: createdByUid,
    updatedBy: createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(studentRef, newStudent);
  return newStudent;
};

/**
 * Update an existing student
 */
export const updateStudent = async (
  studentId: string,
  data: Partial<Student>,
  updatedByUid: string
): Promise<void> => {
  const studentRef = doc(db, 'students', studentId);
  const updateData: any = { ...data };
  if (data.year) {
    updateData.year = normalizeAcademicYear(data.year);
  }
  await updateDoc(studentRef, {
    ...updateData,
    updatedBy: updatedByUid,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Toggle student active/inactive status
 */
export const toggleStudentStatus = async (
  studentId: string,
  active: boolean,
  updatedByUid: string
): Promise<void> => {
  await updateStudent(studentId, { active }, updatedByUid);
};

/**
 * Bulk import valid students using Firestore WriteBatch
 */
export const batchImportStudents = async (
  records: { registerNumber: string; name: string }[],
  targetYear: string,
  targetClass: string,
  targetDept: string,
  importedByUid: string
): Promise<number> => {
  if (records.length === 0) return 0;

  const canonicalYear = normalizeAcademicYear(targetYear);
  // Process in batches of 400 (safe buffer under 500 limit)
  const BATCH_SIZE = 400;
  let importedCount = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    chunk.forEach((item) => {
      const studentRef = doc(collection(db, 'students'));
      const studentDoc: Student = {
        studentId: studentRef.id,
        registerNumber: String(item.registerNumber).trim(),
        name: String(item.name).trim(),
        year: canonicalYear,
        class: targetClass,
        department: targetDept,
        active: true,
        createdBy: importedByUid,
        updatedBy: importedByUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      batch.set(studentRef, studentDoc);
      importedCount++;
    });

    await batch.commit();
  }

  return importedCount;
};
