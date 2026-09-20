// User Roles
export type UserRole = 'super_coordinator' | 'view_coordinator' | 'year_coordinator';

// 1. User Profile in Firestore: users/{uid}
export interface UserProfile {
  uid: string;
  name: string;
  email?: string;
  role: UserRole;
  assignedYear?: string; // e.g., '4th Year' or 'S7'
  assignedClass?: string; // legacy/optional
  department?: string; // legacy/optional
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
}

// 2. Student Master Record in Firestore: students/{studentId}
export interface Student {
  studentId: string;
  registerNumber: string; // Unique student identifier
  name: string;
  year: string; // Academic Year e.g., 'S1', 'S3', 'S5', 'S7'
  class: string; // Division/Section e.g., 'CSE-A', 'ECE-B'
  department: string; // Academic Department
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
}

// 3. Event Record in Firestore: events/{eventId}
export type EventType = 'individual' | 'team' | 'relay';
export type EventStatus = 'draft' | 'open' | 'closed' | 'completed';

export interface YearRegistrationSummary {
  registrationId: string;
  docId?: string;
  participantCount: number;
  teamName?: string;
  status: 'registered' | 'cancelled';
  updatedAt?: any;
}

export interface Event {
  eventId: string;
  eventName: string;
  category: string; // 'Athletics' | 'Games' | string
  eventType: EventType;
  // Authoritative per-year capacity model
  maxParticipantsPerYear: number;
  minParticipantsPerYear?: number;
  eligibleYears?: string[]; // Empty/undefined = All academic years
  date: string; // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  venue?: string;
  registrationDeadline: string; // ISO 8601 string or Timestamp
  manualRegistrationOverride?: boolean;
  description?: string;
  status: EventStatus;
  yearRegistrations?: Record<string, YearRegistrationSummary>;

  // Legacy fields (retained solely for non-destructive backwards compatibility with existing documents)
  maximumParticipants?: number;
  minimumParticipants?: number;
  currentParticipants?: number;
  registeredParticipantIds?: string[];
  instructions?: string;

  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
}

// 4. Registration Record in Firestore: registrations/{registrationId}
export type RegistrationStatus = 'registered' | 'cancelled' | 'locked';

export interface RelayPosition {
  order: number; // 1, 2, 3, 4
  studentId: string;
  studentName: string;
  registerNumber: string;
}

export interface StudentParticipantSummary {
  studentId: string;
  name: string;
  registerNumber: string;
  year: string;
  class: string;
  department: string;
}

export interface Registration {
  registrationId: string;
  docId?: string;
  id?: string;
  eventId: string;
  eventNameSnapshot: string;
  year: string; // Authorized Year e.g., 'S7'
  class: string; // Authorized Class e.g., 'CSE-A'
  department: string;
  participantIds: string[]; // List of student IDs
  participantsSnapshot?: StudentParticipantSummary[]; // Snapshot for fast rendering/exports
  participantCount: number;
  registrationType: EventType;
  teamName?: string;
  captainId?: string;
  captainName?: string;
  relayOrder?: RelayPosition[];
  status: RegistrationStatus;
  coordinatorId: string;
  coordinatorName: string;
  coordinatorEmail?: string;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
}

// 5. Activity Log Record in Firestore: activityLogs/{logId}
export type EntityType = 'student' | 'event' | 'registration' | 'coordinator' | 'settings' | 'system';

export interface ActivityLog {
  logId: string;
  action: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  entityType: EntityType;
  entityId: string;
  metadata?: Record<string, any>;
  timestamp: any;
}

// 6. Academic Structure
export interface ClassDefinition {
  year: string;
  name: string;
  department?: string;
}

export interface AcademicStructure {
  years: string[];
  classes: ClassDefinition[];
  departments: string[];
}

// 7. Settings Record in Firestore: settings/{settingId}
export interface CollegeSettings {
  settingId: string;
  collegeName: string;
  sportsEventName: string;
  sportsYear: string;
  academicYear: string;
  contactEmail?: string;
  contactPhone?: string;
  academicStructure: AcademicStructure;
  gamesLimit?: number; // Maximum games per student (default 6)
  athleticsLimit?: number; // Maximum athletic events per student (default 3)
  updatedAt?: any;
  updatedBy?: string;
}

// Auth State Interface
export interface AuthState {
  user: UserProfile | null;
  firebaseUser: any | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isSuperCoordinator: boolean;
  isViewCoordinator: boolean;
  isYearCoordinator: boolean;
  isActive: boolean;
  isProfileMissing: boolean;
}

// Navigation Item Interface
export interface NavItem {
  name: string;
  path: string;
  iconName: string;
  allowedRoles: UserRole[];
}

// Toast Alert
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
}
