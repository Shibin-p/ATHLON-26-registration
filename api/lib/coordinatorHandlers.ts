import { IncomingMessage, ServerResponse } from 'http';
import type { UserRecord } from 'firebase-admin/auth';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './firebaseAdmin';
import { verifySuperCoordinatorCaller } from './authMiddleware';
import {
  isValidEmail,
  validatePassword,
  validateCoordinatorRole,
  validateAcademicYear,
} from './validators';

// Helper to parse JSON body from IncomingMessage
export async function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  // If Vercel or body-parser already attached body
  if ((req as any).body) {
    if (typeof (req as any).body === 'string') {
      try {
        return JSON.parse((req as any).body);
      } catch {
        return (req as any).body;
      }
    }
    return (req as any).body as T;
  }

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data.trim()) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

// Helper to send JSON response
export function sendJsonResponse(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, any>
) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/**
 * Handler 1: Create New Coordinator (Auth user + Firestore profile atomically)
 */
export async function handleCreateCoordinator(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    return sendJsonResponse(res, 405, { error: 'Method Not Allowed' });
  }

  // 1. Enforce Super Coordinator Authentication
  const authResult = await verifySuperCoordinatorCaller(req);
  if (!authResult.success) {
    return sendJsonResponse(res, authResult.statusCode || 401, { error: authResult.error });
  }

  try {
    const body = await parseJsonBody<{
      fullName?: string;
      email?: string;
      password?: string;
      role?: string;
      academicYear?: string;
    }>(req);

    const { fullName, email, password, role, academicYear } = body;

    // Validate inputs
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return sendJsonResponse(res, 400, { error: 'Full Name is required' });
    }

    if (!email || !isValidEmail(email)) {
      return sendJsonResponse(res, 400, { error: 'Valid email address is required' });
    }

    const passwordValidation = validatePassword(password || '');
    if (!passwordValidation.valid) {
      return sendJsonResponse(res, 400, { error: passwordValidation.error });
    }

    const roleValidation = validateCoordinatorRole(role || '');
    if (!roleValidation.valid || !roleValidation.role) {
      return sendJsonResponse(res, 400, { error: roleValidation.error });
    }

    const yearValidation = validateAcademicYear(roleValidation.role, academicYear);
    if (!yearValidation.valid) {
      return sendJsonResponse(res, 400, { error: yearValidation.error });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists in Firebase Auth
    try {
      const existingAuthUser = await adminAuth.getUserByEmail(normalizedEmail);
      if (existingAuthUser) {
        return sendJsonResponse(res, 409, {
          error:
            'A Firebase Authentication account with this email already exists. You can assign this user as a coordinator in the "Use Existing Firebase Account" tab.',
          code: 'auth/email-already-exists',
          existingUid: existingAuthUser.uid,
        });
      }
    } catch (err: any) {
      // If user not found, Firebase throws auth/user-not-found, which is expected
      if (err.code !== 'auth/user-not-found') {
        throw err;
      }
    }

    // 2. Create Firebase Auth user
    let createdAuthUser;
    try {
      createdAuthUser = await adminAuth.createUser({
        email: normalizedEmail,
        password: password,
        displayName: fullName.trim(),
        emailVerified: false,
        disabled: false,
      });
    } catch (err: any) {
      console.error('Failed to create Firebase Auth user:', err);
      return sendJsonResponse(res, 400, {
        error: err.message || 'Failed to create Firebase Authentication account',
        code: err.code,
      });
    }

    // 3. Create Firestore user profile
    const now = new Date();
    const finalName = fullName.trim();
    const finalYear =
      roleValidation.role === 'year_coordinator' && yearValidation.academicYear
        ? yearValidation.academicYear
        : null;

    const coordinatorProfile: Record<string, any> = {
      uid: createdAuthUser.uid,
      name: finalName,
      fullName: finalName,
      email: normalizedEmail,
      role: roleValidation.role,
      assignedYear: finalYear,
      academicYear: finalYear,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await adminDb.collection('users').doc(createdAuthUser.uid).set(coordinatorProfile);
    } catch (firestoreError: any) {
      console.error('Firestore write failed after Auth creation. Attempting rollback...', firestoreError);
      try {
        await adminAuth.deleteUser(createdAuthUser.uid);
        console.log(`Successfully rolled back and deleted Auth user ${createdAuthUser.uid}`);
      } catch (rollbackError) {
        console.error(
          `CRITICAL: Rollback failed! Orphaned Firebase Auth user created with UID ${createdAuthUser.uid}`,
          rollbackError
        );
      }
      return sendJsonResponse(res, 500, {
        error: 'Failed to create coordinator profile in database. Operation rolled back.',
      });
    }

    return sendJsonResponse(res, 201, {
      success: true,
      message: 'Coordinator created successfully',
      coordinator: {
        id: createdAuthUser.uid,
        uid: createdAuthUser.uid,
        name: coordinatorProfile.name,
        fullName: coordinatorProfile.fullName,
        email: coordinatorProfile.email,
        role: coordinatorProfile.role,
        assignedYear: coordinatorProfile.assignedYear || null,
        academicYear: coordinatorProfile.academicYear || null,
        active: true,
        createdAt: coordinatorProfile.createdAt,
      },
    });
  } catch (err: any) {
    console.error('Unhandled error in handleCreateCoordinator:', err);
    return sendJsonResponse(res, 500, {
      error: err?.message || 'An unexpected server error occurred',
    });
  }
}

export interface EnrichedAuthUser {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  createdAt: string;
  lastSignInTime: string;
  isAssigned: boolean;
  profile: {
    fullName: string;
    role: string;
    academicYear: string | null;
    active: boolean;
  } | null;
}

/**
 * Handler 2: List Firebase Auth users with profile status and search/pagination
 */
export async function handleListAuthUsers(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    return sendJsonResponse(res, 405, { error: 'Method Not Allowed' });
  }

  // 1. Enforce Super Coordinator Authentication
  const authResult = await verifySuperCoordinatorCaller(req);
  if (!authResult.success) {
    return sendJsonResponse(res, authResult.statusCode || 401, { error: authResult.error });
  }

  try {
    // Parse query params from Vercel req.query or fallback to URL
    const queryObj = (req as any).query || {};
    const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

    const searchParam = queryObj.search ?? parsedUrl.searchParams.get('search') ?? '';
    const search = String(searchParam).toLowerCase().trim();

    const assignmentFilter = String(queryObj.assignment ?? parsedUrl.searchParams.get('assignment') ?? 'all');
    const statusFilter = String(queryObj.status ?? parsedUrl.searchParams.get('status') ?? 'all');
    const pageToken = queryObj.pageToken ?? parsedUrl.searchParams.get('pageToken') ?? undefined;

    const limitParam = queryObj.limit ?? parsedUrl.searchParams.get('limit') ?? '50';
    const requestedLimit = parseInt(String(limitParam), 10);
    const limit = Math.min(Math.max(isNaN(requestedLimit) ? 50 : requestedLimit, 10), 100);

    // List users from Firebase Auth
    const listUsersResult = await adminAuth.listUsers(limit, pageToken ? String(pageToken) : undefined);

    // Fetch all existing ATHLON 26 user profiles from Firestore
    const usersSnapshot = await adminDb.collection('users').get();
    const profileMap = new Map<string, any>();
    usersSnapshot.forEach((doc: QueryDocumentSnapshot) => {
      profileMap.set(doc.id, doc.data());
    });

    // Enrich auth users with coordinator status
    let enrichedUsers: EnrichedAuthUser[] = listUsersResult.users.map((user: UserRecord) => {
      const profile = profileMap.get(user.uid) || null;
      return {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        disabled: user.disabled,
        createdAt: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime,
        isAssigned: !!profile,
        profile: profile
          ? {
              fullName: profile.name || profile.fullName || user.displayName || '',
              role: profile.role || '',
              academicYear: profile.assignedYear || profile.academicYear || null,
              active: profile.active !== false,
            }
          : null,
      };
    });

    // Apply filtering if specified
    if (search) {
      enrichedUsers = enrichedUsers.filter((u: EnrichedAuthUser) => {
        const emailMatch = u.email.toLowerCase().includes(search);
        const nameMatch = u.displayName.toLowerCase().includes(search);
        const profileNameMatch = u.profile?.fullName.toLowerCase().includes(search) || false;
        return emailMatch || nameMatch || profileNameMatch;
      });
    }

    if (assignmentFilter === 'assigned') {
      enrichedUsers = enrichedUsers.filter((u: EnrichedAuthUser) => u.isAssigned);
    } else if (assignmentFilter === 'unassigned') {
      enrichedUsers = enrichedUsers.filter((u: EnrichedAuthUser) => !u.isAssigned);
    }

    if (statusFilter === 'enabled') {
      enrichedUsers = enrichedUsers.filter((u: EnrichedAuthUser) => !u.disabled);
    } else if (statusFilter === 'disabled') {
      enrichedUsers = enrichedUsers.filter((u: EnrichedAuthUser) => u.disabled);
    }

    return sendJsonResponse(res, 200, {
      users: enrichedUsers,
      nextPageToken: listUsersResult.pageToken || null,
    });
  } catch (err: any) {
    console.error('Unhandled error in handleListAuthUsers:', err);
    return sendJsonResponse(res, 500, {
      error: err?.message || 'Failed to list authentication users',
    });
  }
}

/**
 * Handler 3: Assign existing Firebase Auth user to ATHLON'26 coordinator profile
 */
export async function handleAssignCoordinator(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    return sendJsonResponse(res, 405, { error: 'Method Not Allowed' });
  }

  // 1. Enforce Super Coordinator Authentication
  const authResult = await verifySuperCoordinatorCaller(req);
  if (!authResult.success) {
    return sendJsonResponse(res, authResult.statusCode || 401, { error: authResult.error });
  }

  try {
    const body = await parseJsonBody<{
      uid?: string;
      fullName?: string;
      role?: string;
      academicYear?: string;
    }>(req);

    const { uid, fullName, role, academicYear } = body;

    if (!uid || typeof uid !== 'string' || !uid.trim()) {
      return sendJsonResponse(res, 400, { error: 'Firebase Auth UID is required' });
    }

    const roleValidation = validateCoordinatorRole(role || '');
    if (!roleValidation.valid || !roleValidation.role) {
      return sendJsonResponse(res, 400, { error: roleValidation.error });
    }

    const yearValidation = validateAcademicYear(roleValidation.role, academicYear);
    if (!yearValidation.valid) {
      return sendJsonResponse(res, 400, { error: yearValidation.error });
    }

    // 2. Verify user exists in Firebase Auth
    let authUser: UserRecord;
    try {
      authUser = await adminAuth.getUser(uid.trim());
    } catch {
      return sendJsonResponse(res, 404, {
        error: `Firebase Authentication user not found with UID: ${uid}`,
      });
    }

    // 3. Check if Firestore profile already exists (NEVER OVERWRITE)
    const existingDoc = await adminDb.collection('users').doc(uid.trim()).get();
    if (existingDoc.exists) {
      return sendJsonResponse(res, 409, {
        error:
          'This Firebase Authentication account is already assigned to an ATHLON 26 coordinator profile. Profiles cannot be overwritten.',
        existingProfile: existingDoc.data(),
      });
    }

    // 4. Create coordinator profile
    const now = new Date();
    const finalFullName = (fullName || authUser.displayName || authUser.email || 'Coordinator').trim();
    const finalYear =
      roleValidation.role === 'year_coordinator' && yearValidation.academicYear
        ? yearValidation.academicYear
        : null;

    const coordinatorProfile: Record<string, any> = {
      uid: uid.trim(),
      name: finalFullName,
      fullName: finalFullName,
      email: authUser.email ? authUser.email.trim().toLowerCase() : '',
      role: roleValidation.role,
      assignedYear: finalYear,
      academicYear: finalYear,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    await adminDb.collection('users').doc(uid.trim()).set(coordinatorProfile);

    // If authUser doesn't have displayName set, optionally update it
    if (!authUser.displayName && finalFullName) {
      try {
        await adminAuth.updateUser(uid.trim(), { displayName: finalFullName });
      } catch (displayNameErr) {
        console.warn('Could not update Auth displayName:', displayNameErr);
      }
    }

    return sendJsonResponse(res, 201, {
      success: true,
      message: 'Coordinator profile assigned successfully',
      coordinator: {
        id: uid.trim(),
        uid: uid.trim(),
        name: coordinatorProfile.name,
        fullName: coordinatorProfile.fullName,
        email: coordinatorProfile.email,
        role: coordinatorProfile.role,
        assignedYear: coordinatorProfile.assignedYear || null,
        academicYear: coordinatorProfile.academicYear || null,
        active: true,
        createdAt: coordinatorProfile.createdAt,
      },
    });
  } catch (err: any) {
    console.error('Unhandled error in handleAssignCoordinator:', err);
    return sendJsonResponse(res, 500, {
      error: err?.message || 'An unexpected server error occurred',
    });
  }
}
