import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getFirebaseAdmin() {
  if (getApps().length > 0) {
    const app = getApp();
    return {
      adminAuth: getAuth(app),
      adminDb: getFirestore(app),
    };
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [
      !projectId && 'FIREBASE_ADMIN_PROJECT_ID',
      !clientEmail && 'FIREBASE_ADMIN_CLIENT_EMAIL',
      !privateKey && 'FIREBASE_ADMIN_PRIVATE_KEY',
    ].filter(Boolean);
    throw new Error(`Missing Firebase Admin environment variables: ${missing.join(', ')}`);
  }

  privateKey = privateKey.trim();
  if (
    (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
    (privateKey.startsWith("'") && privateKey.endsWith("'"))
  ) {
    privateKey = privateKey.slice(1, -1);
  }

  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return {
    adminAuth: getAuth(app),
    adminDb: getFirestore(app),
  };
}

async function verifySuperCoordinatorCaller(req: any, adminAuth: any, adminDb: any) {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      statusCode: 401,
      error: 'Missing or malformed Authorization header with Bearer token',
    };
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim();
  if (!idToken) {
    return {
      success: false,
      statusCode: 401,
      error: 'Empty Bearer token',
    };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return {
        success: false,
        statusCode: 403,
        error: 'Forbidden: Caller profile does not exist in ATHLON 26 users collection',
      };
    }

    const userData = userDoc.data();
    if (userData?.role !== 'super_coordinator') {
      return {
        success: false,
        statusCode: 403,
        error: 'Forbidden: Only Super Coordinators can perform this operation',
      };
    }

    if (userData?.active === false) {
      return {
        success: false,
        statusCode: 403,
        error: 'Forbidden: Account is inactive or deactivated',
      };
    }

    return {
      success: true,
      caller: {
        uid,
        email: decodedToken.email,
        role: userData.role,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 401,
      error: `Unauthorized: ${err?.message || 'Invalid or expired authentication token'}`,
    };
  }
}

async function parseBody<T>(req: any): Promise<T> {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return req.body;
      }
    }
    return req.body as T;
  }

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: any) => {
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
    req.on('error', (err: any) => reject(err));
  });
}

const CANONICAL_ACADEMIC_YEARS = ['1ST YEAR', '2ND YEAR', '3RD YEAR', '4TH YEAR'];
const ALLOWED_ROLES = ['super_coordinator', 'year_coordinator', 'view_coordinator'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  try {
    const { adminAuth, adminDb } = getFirebaseAdmin();

    const authResult = await verifySuperCoordinatorCaller(req, adminAuth, adminDb);
    if (!authResult.success) {
      res.statusCode = authResult.statusCode || 401;
      return res.end(JSON.stringify({ error: authResult.error }));
    }

    const body = await parseBody<{
      fullName?: string;
      email?: string;
      password?: string;
      role?: string;
      academicYear?: string;
    }>(req);

    const { fullName, email, password, role, academicYear } = body;

    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Full Name is required' }));
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Valid email address is required' }));
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Password must be at least 6 characters long' }));
    }

    if (!role || !ALLOWED_ROLES.includes(role)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: `Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}` }));
    }

    if (role === 'year_coordinator') {
      if (!academicYear || !CANONICAL_ACADEMIC_YEARS.includes(academicYear)) {
        res.statusCode = 400;
        return res.end(
          JSON.stringify({
            error: `Assigned Academic Year is required for Year Coordinators (${CANONICAL_ACADEMIC_YEARS.join(', ')})`,
          })
        );
      }
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists in Firebase Auth
    try {
      const existingAuthUser = await adminAuth.getUserByEmail(normalizedEmail);
      if (existingAuthUser) {
        res.statusCode = 409;
        return res.end(
          JSON.stringify({
            error:
              'A Firebase Authentication account with this email already exists. You can assign this user as a coordinator in the "Use Existing Firebase Account" tab.',
            code: 'auth/email-already-exists',
            existingUid: existingAuthUser.uid,
          })
        );
      }
    } catch (err: any) {
      if (err.code !== 'auth/user-not-found') {
        throw err;
      }
    }

    // Create Firebase Auth account
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
      res.statusCode = 400;
      return res.end(
        JSON.stringify({
          error: err.message || 'Failed to create Firebase Authentication account',
          code: err.code,
        })
      );
    }

    // Create Firestore coordinator profile
    const now = new Date();
    const finalName = fullName.trim();
    const finalYear = role === 'year_coordinator' && academicYear ? academicYear : null;

    const coordinatorProfile: Record<string, any> = {
      uid: createdAuthUser.uid,
      name: finalName,
      fullName: finalName,
      email: normalizedEmail,
      role,
      assignedYear: finalYear,
      academicYear: finalYear,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await adminDb.collection('users').doc(createdAuthUser.uid).set(coordinatorProfile);
    } catch (firestoreError: any) {
      console.error('Firestore creation failed, rolling back auth user:', firestoreError);
      try {
        await adminAuth.deleteUser(createdAuthUser.uid);
      } catch (rollbackError) {
        console.error('Rollback deletion failed:', rollbackError);
      }
      res.statusCode = 500;
      return res.end(
        JSON.stringify({
          error: 'Failed to create coordinator profile in database. Operation rolled back.',
        })
      );
    }

    res.statusCode = 201;
    return res.end(
      JSON.stringify({
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
      })
    );
  } catch (err: any) {
    console.error('Error in /api/coordinators/create:', err);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        error: err?.message || 'Failed to create coordinator account',
      })
    );
  }
}
