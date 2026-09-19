import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { UserRecord } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
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

    const listUsersResult = await adminAuth.listUsers(limit, pageToken ? String(pageToken) : undefined);

    const usersSnapshot = await adminDb.collection('users').get();
    const profileMap = new Map<string, any>();
    usersSnapshot.forEach((doc: QueryDocumentSnapshot) => {
      profileMap.set(doc.id, doc.data());
    });

    let enrichedUsers = listUsersResult.users.map((user: UserRecord) => {
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

    if (search) {
      enrichedUsers = enrichedUsers.filter((u) => {
        const emailMatch = u.email.toLowerCase().includes(search);
        const nameMatch = u.displayName.toLowerCase().includes(search);
        const profileNameMatch = u.profile?.fullName.toLowerCase().includes(search) || false;
        return emailMatch || nameMatch || profileNameMatch;
      });
    }

    if (assignmentFilter === 'assigned') {
      enrichedUsers = enrichedUsers.filter((u) => u.isAssigned);
    } else if (assignmentFilter === 'unassigned') {
      enrichedUsers = enrichedUsers.filter((u) => !u.isAssigned);
    }

    if (statusFilter === 'enabled') {
      enrichedUsers = enrichedUsers.filter((u) => !u.disabled);
    } else if (statusFilter === 'disabled') {
      enrichedUsers = enrichedUsers.filter((u) => u.disabled);
    }

    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        users: enrichedUsers,
        nextPageToken: listUsersResult.pageToken || null,
      })
    );
  } catch (err: any) {
    console.error('Error in /api/coordinators/list-auth-users:', err);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        error: err?.message || 'Failed to list authentication users',
      })
    );
  }
}
