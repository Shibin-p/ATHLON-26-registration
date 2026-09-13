# ATHLON'26 — Security Architecture & Authorization Specification

This document details the backend security model, role-based authorization strategy, Firestore Security Rules, and account lifecycle for the **ATHLON'26 Annual Sports & Athletics Registration Management System**.

---

## 1. Authentication Model

- **Provider**: Firebase Authentication (Email / Password).
- **Credentials**: Passwords are encrypted and managed exclusively by Firebase Authentication. No passwords or sensitive auth tokens are stored in Firestore.
- **Session State**: Firebase Auth tokens (`JWT`) are verified on every network request to Firestore.
- **Profile Binding**: Each authenticated user corresponds to a document in the `users` collection keyed by their Firebase Auth UID (`users/{uid}`).
- **Active Status Check**:
  - The Firestore document contains an `active: boolean` flag.
  - Inactive users are rejected both at the application routing layer and at the Firestore Security Rules layer (`getUserDoc().active == true`).

---

## 2. User Roles & Permission Matrix

The system enforces three mutually exclusive coordinator roles:

| Feature / Collection | Super Coordinator (`super_coordinator`) | View Coordinator (`view_coordinator`) | Year Coordinator (`year_coordinator`) | Unauthenticated |
| :--- | :--- | :--- | :--- | :--- |
| **Portal Login** | Allowed | Allowed | Allowed (scoped) | Denied |
| **Users Collection** | Full CRUD | Read-only | Read own profile only | Denied |
| **Modify User Roles / Status** | Allowed | Denied | Denied (Tamper-proof) | Denied |
| **Students Database** | Full CRUD | Read-only (All) | Read-only (Own Year/Class) | Denied |
| **Events Collection** | Full CRUD | Read-only (All) | Read-only (All) | Denied |
| **Create Registrations** | Allowed (Global) | Denied | Allowed (Own Year/Class only) | Denied |
| **Update Registrations** | Full CRUD | Denied | Own registrations while open | Denied |
| **Cancel Registrations** | Allowed | Denied | Own registrations while open | Denied |
| **Activity Audit Logs** | Read-only | Denied | Append own action only | Denied |
| **System Settings** | Full CRUD | Read-only | Read-only | Denied |

---

## 3. Firestore Schema Collections

1. **`users/{uid}`**:
   - `uid`: string (matches Firebase Auth UID)
   - `name`: string
   - `email`: string
   - `role`: `'super_coordinator' | 'view_coordinator' | 'year_coordinator'`
   - `assignedYear`: string (e.g., `'S7'`)
   - `assignedClass`: string (e.g., `'CSE-A'`)
   - `department`: string (e.g., `'Computer Science'`)
   - `active`: boolean
   - `createdAt`, `updatedAt`, `createdBy`, `updatedBy`

2. **`students/{studentId}`**:
   - `studentId`: string
   - `registerNumber`: string (unique student identifier)
   - `name`: string
   - `year`: string (`'S1'`, `'S3'`, `'S5'`, `'S7'`)
   - `class`: string (`'CSE-A'`, `'ECE-B'`)
   - `department`: string
   - `active`: boolean
   - `createdAt`, `updatedAt`, `createdBy`, `updatedBy`

3. **`events/{eventId}`**:
   - `eventId`: string
   - `eventName`: string
   - `category`: string (`'Athletics'`, `'Team Sports'`, `'Indoor'`, `'Outdoor'`)
   - `eventType`: `'individual' | 'team' | 'relay'`
   - `maximumParticipants`: number
   - `minimumParticipants`: number
   - `date`: string (YYYY-MM-DD)
   - `startTime`, `endTime`, `venue`: string
   - `registrationDeadline`: ISO 8601 string
   - `instructions`: string
   - `status`: `'draft' | 'open' | 'closed' | 'completed'`
   - `createdAt`, `updatedAt`, `createdBy`, `updatedBy`

4. **`registrations/{registrationId}`**:
   - `registrationId`: string (deterministic e.g. `SPT-2026-EVT-REG`)
   - `eventId`: string
   - `eventNameSnapshot`: string
   - `year`: string (validated against coordinator's assigned year)
   - `class`: string (validated against coordinator's assigned class)
   - `department`: string
   - `participantIds`: string[]
   - `participantCount`: number
   - `registrationType`: `'individual' | 'team' | 'relay'`
   - `teamName`: string (if team event)
   - `captainId`: string (if team event)
   - `relayOrder`: array of runner positions (if relay event)
   - `status`: `'registered' | 'cancelled' | 'locked'`
   - `coordinatorId`: string (must equal `request.auth.uid`)
   - `coordinatorName`: string
   - `createdAt`, `updatedAt`, `createdBy`, `updatedBy`

5. **`activityLogs/{logId}`**:
   - `action`: string
   - `actorUid`: string (must equal `request.auth.uid`)
   - `actorName`: string
   - `actorRole`: string
   - `entityType`: `'student' | 'event' | 'registration' | 'coordinator' | 'settings' | 'system'`
   - `entityId`: string
   - `metadata`: map
   - `timestamp`: serverTimestamp

6. **`settings/{settingId}`**:
   - `settingId`: `'system'`
   - `collegeName`: string
   - `sportsEventName`: string
   - `sportsYear`: string
   - `academicYear`: string
   - `initializedBy`: string
   - `initializedAt`: timestamp

---

## 4. Server-Side Enforcement (Firestore Security Rules)

Client-side checks are provided solely for user experience and navigation ergonomics. The actual security boundary is enforced strictly server-side through [firestore.rules](file:///c:/Users/shibi/OneDrive/Desktop/athlon26-registrations/firestore.rules):

### A. Role Self-Escalation Prevention
A user updating their own profile document (`users/{uid}`) is explicitly restricted from altering:
- `role`
- `assignedYear`
- `assignedClass`
- `active`

```javascript
allow update: if isSuperCoordinator() || (
  isOwner(userId) &&
  request.resource.data.role == resource.data.role &&
  request.resource.data.assignedYear == resource.data.assignedYear &&
  request.resource.data.assignedClass == resource.data.assignedClass &&
  request.resource.data.active == resource.data.active
);
```

### B. Year Coordinator Scope Enforcement
Year Coordinators cannot read students or registrations outside their assigned year and class:

```javascript
function matchesYearScope(year, className) {
  return isYearCoordinator() &&
         getUserDoc().assignedYear == year &&
         (getUserDoc().assignedClass == null || getUserDoc().assignedClass == className);
}
```

### C. Registration Ownership & Event State Protection
When creating or updating registrations, Year Coordinators cannot forge `coordinatorId`, cannot register outside their assigned year, and the event's `status` must be `'open'`:

```javascript
allow create: if isSuperCoordinator() || (
  isActiveUser() &&
  matchesYearScope(request.resource.data.year, request.resource.data.class) &&
  request.resource.data.coordinatorId == request.auth.uid &&
  get(/databases/$(database)/documents/events/$(request.resource.data.eventId)).data.status == 'open'
);
```

### D. Audit Log Immutability
Audit records can be created by authenticated users, but `update` and `delete` are set to `false`. Once written, logs cannot be modified or erased.

---

## 5. Initial Super Coordinator Bootstrap Procedure

To prevent public signup or unauthorized self-promotion:
1. **Method 1 (In-App Bootstrap Route `/setup`)**:
   - If `settings/system` does NOT exist in Firestore, the project is considered uninitialized.
   - The owner logs in with their newly created Firebase Authentication account.
   - The system detects uninitialized status and routes to `/setup`.
   - The user enters their full name; the backend transaction writes `users/{uid}` with `role: 'super_coordinator'` and atomically writes `settings/system`.
   - Once `settings/system` exists, no subsequent self-assignment is permitted by Firestore rules.
2. **Method 2 (Firebase Console Direct)**:
   - Alternatively, the project owner can create a user in Firebase Auth Console, copy their `UID`, and create a document under `users/{UID}` in Cloud Firestore:
     ```json
     {
       "uid": "<USER_UID>",
       "name": "Super Coordinator",
       "email": "admin@college.edu",
       "role": "super_coordinator",
       "active": true
     }
     ```

---

## 6. Known Security Limits & Server-Authoritative Guidance

- **Simultaneous Registration Slot Capacity (Race Conditions)**:
  Firestore Security Rules can verify that an event is `'open'`, but evaluating total collection participant count dynamically across concurrent writes exceeds Firestore rules capabilities. In Phase 5, concurrent capacity limits (e.g. 16/16 participants) will be enforced using **Firestore Transactions (`runTransaction`)** on the event counter document to ensure deterministic atomic increments and reject overflowing registrations.
