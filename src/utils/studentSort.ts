/**
 * Global Student Sorting Utility
 * ATHLON'26 - Case-insensitive, stable, deterministic alphabetical sorting
 */

export interface SortableStudent {
  name: string;
  registerNumber?: string;
  [key: string]: any;
}

/**
 * Sort students alphabetically by name (case-insensitive, deterministic).
 * Falls back to registerNumber if names are identical.
 *
 * Example input: ['Rahul', 'anas', 'Ziya', 'Arjun', 'Fahad', 'Hiba', 'Abdul']
 * Expected output: ['Abdul', 'anas', 'Arjun', 'Fahad', 'Hiba', 'Rahul', 'Ziya']
 */
export const sortStudentsByName = <T extends SortableStudent>(students: T[]): T[] => {
  if (!Array.isArray(students)) return [];
  return [...students].sort((a, b) => {
    const nameA = (a.name || '').trim();
    const nameB = (b.name || '').trim();

    // Primary: Case-insensitive alphabetical comparison
    const comp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
    if (comp !== 0) return comp;

    // Secondary: Case-sensitive tie-breaker for strict determinism
    const exactComp = nameA.localeCompare(nameB);
    if (exactComp !== 0) return exactComp;

    // Tertiary: Register number tie-breaker
    const regA = (a.registerNumber || '').trim();
    const regB = (b.registerNumber || '').trim();
    return regA.localeCompare(regB, undefined, { sensitivity: 'base', numeric: true });
  });
};

/**
 * Sort students by register number (alphanumeric, case-insensitive).
 * Falls back to student name if register numbers are identical.
 */
export const sortStudentsByRegisterNumber = <T extends SortableStudent>(students: T[]): T[] => {
  if (!Array.isArray(students)) return [];
  return [...students].sort((a, b) => {
    const regA = (a.registerNumber || '').trim();
    const regB = (b.registerNumber || '').trim();

    // Primary: Register number comparison
    const comp = regA.localeCompare(regB, undefined, { sensitivity: 'base', numeric: true });
    if (comp !== 0) return comp;

    // Secondary: Name tie-breaker
    const nameA = (a.name || '').trim();
    const nameB = (b.name || '').trim();
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
  });
};
