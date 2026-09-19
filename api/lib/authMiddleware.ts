import { IncomingMessage } from 'http';
import { adminAuth, adminDb } from './firebaseAdmin';

export interface AuthenticatedCaller {
  uid: string;
  email?: string;
  role: string;
}

export interface AuthValidationResult {
  success: boolean;
  caller?: AuthenticatedCaller;
  statusCode?: number;
  error?: string;
}

export async function verifySuperCoordinatorCaller(
  req: IncomingMessage
): Promise<AuthValidationResult> {
  const authHeader = req.headers.authorization;
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
    console.error('Authentication token verification failed:', err);
    return {
      success: false,
      statusCode: 401,
      error: `Unauthorized: ${err?.message || 'Invalid or expired authentication token'}`,
    };
  }
}
