import { auth } from '../config/firebase';
import type { UserRole } from '../types';

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

export interface ListAuthUsersResponse {
  users: EnrichedAuthUser[];
  nextPageToken: string | null;
}

export interface CreateCoordinatorRequest {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  academicYear?: string;
}

export interface AssignCoordinatorRequest {
  uid: string;
  fullName: string;
  role: UserRole;
  academicYear?: string;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Authentication required. Please sign in as Super Coordinator.');
  }

  // Force refresh token if needed
  const idToken = await currentUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
}

async function parseResponsePayload(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      // In case json parsing fails, fallback to text
    }
  }
  const text = await response.text();
  return { error: text || `Server returned error status ${response.status}` };
}

/**
 * Call the secure server endpoint to create both a Firebase Authentication user
 * and an ATHLON'26 coordinator profile atomically.
 */
export async function createCoordinatorAccount(
  data: CreateCoordinatorRequest
): Promise<{ success: boolean; message: string; coordinator: any }> {
  const headers = await getAuthHeaders();

  const response = await fetch('/api/coordinators/create', {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  const result = await parseResponsePayload(response);

  if (!response.ok) {
    const error: any = new Error(result.error || 'Failed to create coordinator account');
    error.code = result.code;
    error.existingUid = result.existingUid;
    error.status = response.status;
    throw error;
  }

  return result;
}

/**
 * List Firebase Authentication users with pagination, filters, and ATHLON'26 profile enrichment.
 */
export async function listAuthUsers(params?: {
  search?: string;
  assignment?: 'all' | 'assigned' | 'unassigned';
  status?: 'all' | 'enabled' | 'disabled';
  pageToken?: string;
  limit?: number;
}): Promise<ListAuthUsersResponse> {
  const headers = await getAuthHeaders();

  const query = new URLSearchParams();
  if (params?.search) query.append('search', params.search);
  if (params?.assignment) query.append('assignment', params.assignment);
  if (params?.status) query.append('status', params.status);
  if (params?.pageToken) query.append('pageToken', params.pageToken);
  if (params?.limit) query.append('limit', params.limit.toString());

  const response = await fetch(`/api/coordinators/list-auth-users?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  const result = await parseResponsePayload(response);

  if (!response.ok) {
    throw new Error(result.error || 'Failed to load Firebase Authentication users');
  }

  return result;
}

/**
 * Assign an existing unassigned Firebase Authentication user to an ATHLON'26 coordinator profile.
 * Server prevents overwriting any existing profile.
 */
export async function assignExistingCoordinator(
  data: AssignCoordinatorRequest
): Promise<{ success: boolean; message: string; coordinator: any }> {
  const headers = await getAuthHeaders();

  const response = await fetch('/api/coordinators/assign', {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  const result = await parseResponsePayload(response);

  if (!response.ok) {
    const error: any = new Error(result.error || 'Failed to assign coordinator profile');
    error.status = response.status;
    error.existingProfile = result.existingProfile;
    throw error;
  }

  return result;
}
