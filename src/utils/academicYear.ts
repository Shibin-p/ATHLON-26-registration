/**
 * Academic Year Utilities for ATHLON'26
 * Centralized canonical normalization and comparison
 */

export const CANONICAL_YEARS = [
  '1ST YEAR',
  '2ND YEAR',
  '3RD YEAR',
  '4TH YEAR',
] as const;

export type CanonicalAcademicYear = typeof CANONICAL_YEARS[number];

/**
 * Normalizes any variation of academic year input to canonical uppercase standard.
 * e.g. "4th Year", "4th year", "4TH YEAR", "Fourth Year", "4 Year", "S7", "S8" -> "4TH YEAR"
 */
export const normalizeAcademicYear = (input?: string | null): string => {
  if (!input) return '';
  const trimmed = input.trim().toUpperCase();

  // Direct canonical match
  if (CANONICAL_YEARS.includes(trimmed as any)) {
    return trimmed;
  }

  // Semester notations:
  // S1, S2 -> 1ST YEAR
  // S3, S4 -> 2ND YEAR
  // S5, S6 -> 3RD YEAR
  // S7, S8 -> 4TH YEAR
  if (/^S[12](\s|$)/i.test(trimmed) || trimmed === 'S1' || trimmed === 'S2') return '1ST YEAR';
  if (/^S[34](\s|$)/i.test(trimmed) || trimmed === 'S3' || trimmed === 'S4') return '2ND YEAR';
  if (/^S[56](\s|$)/i.test(trimmed) || trimmed === 'S5' || trimmed === 'S6') return '3RD YEAR';
  if (/^S[78](\s|$)/i.test(trimmed) || trimmed === 'S7' || trimmed === 'S8') return '4TH YEAR';

  // Ordinal and numeric variations
  if (trimmed.includes('1') || trimmed.includes('FIRST')) return '1ST YEAR';
  if (trimmed.includes('2') || trimmed.includes('SECOND')) return '2ND YEAR';
  if (trimmed.includes('3') || trimmed.includes('THIRD')) return '3RD YEAR';
  if (trimmed.includes('4') || trimmed.includes('FOURTH')) return '4TH YEAR';

  return trimmed;
};

/**
 * Checks if two academic year strings refer to the same cohort
 */
export const isSameAcademicYear = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  return normalizeAcademicYear(a) === normalizeAcademicYear(b);
};
