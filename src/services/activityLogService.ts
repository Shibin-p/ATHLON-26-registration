import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ActivityLog, EntityType, UserRole } from '../types';

/**
 * Record an activity in the audit log
 */
export const recordActivity = async (
  action: string,
  actorUid: string,
  actorName: string,
  actorRole: UserRole,
  entityType: EntityType,
  entityId: string,
  metadata?: Record<string, any>
): Promise<void> => {
  try {
    const colRef = collection(db, 'activityLogs');
    await addDoc(colRef, {
      action,
      actorUid,
      actorName,
      actorRole,
      entityType,
      entityId,
      metadata: metadata || {},
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to write activity log:', error);
    // Non-blocking for client operations, but logged
  }
};

/**
 * Fetch recent activity logs (Super Coordinator only)
 */
export const getActivityLogs = async (maxLogs: number = 50): Promise<ActivityLog[]> => {
  const colRef = collection(db, 'activityLogs');
  const q = query(colRef, orderBy('timestamp', 'desc'), limit(maxLogs));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    logId: d.id,
    ...(d.data() as Omit<ActivityLog, 'logId'>),
  }));
};
