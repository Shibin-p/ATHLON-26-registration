export const CANONICAL_ACADEMIC_YEARS = [
  '1ST YEAR',
  '2ND YEAR',
  '3RD YEAR',
  '4TH YEAR',
] as const;

export type CanonicalAcademicYear = (typeof CANONICAL_ACADEMIC_YEARS)[number];

export const ALLOWED_COORDINATOR_ROLES = [
  'super_coordinator',
  'year_coordinator',
  'view_coordinator',
] as const;

export type CoordinatorRole = (typeof ALLOWED_COORDINATOR_ROLES)[number];

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  // Standard email regex RFC 5322 compliant simplified
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters long' };
  }
  return { valid: true };
}

export function validateCoordinatorRole(role: string): { valid: boolean; role?: CoordinatorRole; error?: string } {
  if (!role || !ALLOWED_COORDINATOR_ROLES.includes(role as CoordinatorRole)) {
    return {
      valid: false,
      error: `Invalid access role. Must be one of: ${ALLOWED_COORDINATOR_ROLES.join(', ')}`,
    };
  }
  return { valid: true, role: role as CoordinatorRole };
}

export function validateAcademicYear(
  role: CoordinatorRole,
  academicYear?: string | null
): { valid: boolean; academicYear?: CanonicalAcademicYear | null; error?: string } {
  if (role === 'year_coordinator') {
    if (!academicYear || !CANONICAL_ACADEMIC_YEARS.includes(academicYear as CanonicalAcademicYear)) {
      return {
        valid: false,
        error: `Academic Year is required for Year Coordinators. Must be one of: ${CANONICAL_ACADEMIC_YEARS.join(', ')}`,
      };
    }
    return { valid: true, academicYear: academicYear as CanonicalAcademicYear };
  }

  // For super_coordinator or view_coordinator, academicYear is not applicable or null
  return { valid: true, academicYear: null };
}
