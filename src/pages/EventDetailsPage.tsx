import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  Lock,
  ArrowLeft,
  ClipboardList,
  AlertTriangle,
  Info,
  Edit3,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getEventById,
  isEventRegistrationOpen,
  isYearEligible,
} from '../services/eventService';
import {
  getEventRegistrations,
  getEventRegistrationForYear,
  cancelRegistrationWithTransaction,
} from '../services/registrationService';
import { recordActivity } from '../services/activityLogService';
import { normalizeAcademicYear, CANONICAL_YEARS } from '../utils/academicYear';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { EmptyState } from '../components/common/EmptyState';
import type { Event, Registration } from '../types';

export const EventDetailsPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { user, isSuperCoordinator, isViewCoordinator, isYearCoordinator } = useAuth();
  const { showToast } = useToast();

  const [event, setEvent] = useState<Event | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [myYearRegistration, setMyYearRegistration] = useState<Registration | null>(null);
  const [loadingEvent, setLoadingEvent] = useState<boolean>(true);
  const [loadingRegistrations, setLoadingRegistrations] = useState<boolean>(true);

  // Cancellation Modal
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancellingRegistration, setCancellingRegistration] = useState<Registration | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const assignedYear = user?.assignedYear ? normalizeAcademicYear(user.assignedYear) : '';

  useEffect(() => {
    if (eventId) {
      loadEvent(eventId);
    }
  }, [eventId]);

  useEffect(() => {
    if (eventId && user) {
      loadRegistrations(eventId);
    }
  }, [eventId, user]);

  /**
   * 1. Independent event loading: guaranteed to render event details
   * even if registration query encounters an issue.
   */
  const loadEvent = async (id: string) => {
    setLoadingEvent(true);
    try {
      const evt = await getEventById(id);
      setEvent(evt);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to load event details', 'error');
    } finally {
      setLoadingEvent(false);
    }
  };

  /**
   * 2. Scoped registration loading based on user role
   */
  const loadRegistrations = async (id: string) => {
    setLoadingRegistrations(true);
    try {
      if (isYearCoordinator && assignedYear) {
        const myReg = await getEventRegistrationForYear(id, assignedYear);
        setMyYearRegistration(myReg);
      } else if (isSuperCoordinator || isViewCoordinator) {
        const allRegs = await getEventRegistrations(id);
        setRegistrations(allRegs);
      }
    } catch (err: any) {
      console.error('Failed to load registrations:', err);
    } finally {
      setLoadingRegistrations(false);
    }
  };

  const handleConfirmCancelRegistration = async () => {
    if (!cancellingRegistration || !user) return;
    setIsCancelling(true);
    try {
      await cancelRegistrationWithTransaction(
        (cancellingRegistration as any).docId || cancellingRegistration.registrationId,
        user.uid,
        isSuperCoordinator,
        cancellingRegistration.year
      );
      await recordActivity(
        'cancel_registration',
        user.uid,
        user.name,
        user.role,
        'registration',
        cancellingRegistration.registrationId,
        {
          eventId: cancellingRegistration.eventId,
          year: cancellingRegistration.year,
          participantCount: cancellingRegistration.participantCount,
        }
      );
      showToast(
        'Registration Cancelled',
        `Registration for ${cancellingRegistration.year} has been cancelled and capacity quota released.`,
        'success'
      );
      setShowCancelModal(false);
      setCancellingRegistration(null);

      // Refresh event and registration state
      if (eventId) {
        await Promise.all([loadEvent(eventId), loadRegistrations(eventId)]);
      }
    } catch (err: any) {
      showToast('Cancellation Failed', err.message || 'Failed to cancel registration', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  if (loadingEvent) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
        <div className="spinner" style={{ margin: '0 auto var(--space-4)', width: 28, height: 28 }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading competition event details...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="page-container" style={{ maxWidth: '600px', margin: 'var(--space-8) auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: '8px' }}>Event Not Found</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
            The requested competition event does not exist or has been removed.
          </p>
          <Link to="/events" className="btn btn-primary btn-sm">
            Back to Events
          </Link>
        </div>
      </div>
    );
  }

  const { isOpen, reason } = isEventRegistrationOpen(event);
  const eligible = !assignedYear || isYearEligible(event, assignedYear);
  const isRegistered = Boolean(myYearRegistration && myYearRegistration.status === 'registered');

  return (
    <div className="page-container" style={{ maxWidth: '1200px' }}>
      {/* Back Link */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link
          to="/events"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <ArrowLeft size={13} /> Back to Events
        </Link>
      </div>

      {/* Hero Header Card */}
      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span
                className="badge"
                style={{
                  background: 'var(--color-primary-light)',
                  color: '#93c5fd',
                  border: '1px solid var(--color-primary-border)',
                  textTransform: 'uppercase',
                }}
              >
                {event.category} &bull; {event.eventType}
              </span>

              {event.manualRegistrationOverride && (
                <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                  Manual Coordinator Extension
                </span>
              )}

              <span className={`status-badge status-${event.status}`}>
                {event.status === 'open' ? <CheckCircle2 size={11} /> : <Lock size={11} />}
                {event.status.toUpperCase()}
              </span>
            </div>

            <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {event.eventName}
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={14} color="#3b82f6" />
                <span>{new Date(event.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              {event.startTime && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} color="#3b82f6" />
                  <span>{event.startTime} {event.endTime ? `– ${event.endTime}` : ''}</span>
                </div>
              )}
              {event.venue && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="#3b82f6" />
                  <span>{event.venue}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Button for Year Coordinator */}
          {isYearCoordinator && (
            <div>
              {isRegistered ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {isOpen && (
                    <>
                      <Link
                        to={`/events/${event.eventId}/edit-registration/${(myYearRegistration as any)?.docId || myYearRegistration!.registrationId}`}
                        className="btn btn-secondary btn-md"
                      >
                        <Edit3 size={15} /> Edit Registration
                      </Link>
                      <button
                        onClick={() => {
                          setCancellingRegistration(myYearRegistration);
                          setShowCancelModal(true);
                        }}
                        className="btn btn-ghost btn-md"
                        style={{ color: '#f87171' }}
                      >
                        <XCircle size={15} /> Cancel Registration
                      </button>
                    </>
                  )}
                </div>
              ) : eligible && isOpen ? (
                <Link to={`/events/${event.eventId}/register`} className="btn btn-primary btn-md">
                  <ClipboardList size={15} /> Register {assignedYear} Team
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Grid: Capacity & Rules */}
      <div className="grid-2col" style={{ marginBottom: 'var(--space-5)' }}>
        {/* Capacity Model Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Users size={17} color="#3b82f6" /> Per-Year Capacity Quota
            </h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Independent per cohort
            </span>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Quota allocation model:
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
              {event.eventType === 'team'
                ? `Team Size: ${event.minParticipantsPerYear || 2}–${event.maxParticipantsPerYear} students per year`
                : `Maximum: ${event.maxParticipantsPerYear} participant(s) per year`}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
              <span>Event Category:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{event.category}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
              <span>Eligible Cohorts:</span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {event.eligibleYears && event.eligibleYears.length > 0 ? event.eligibleYears.join(', ') : 'All Academic Years'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
              <span>Registration Deadline:</span>
              <strong style={{ color: isOpen ? 'var(--text-primary)' : '#f87171' }}>
                {new Date(event.registrationDeadline).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '2px' }}>
              <span>Registration Window:</span>
              <strong style={{ color: isOpen ? '#34d399' : '#f87171' }}>
                {reason}
              </strong>
            </div>
          </div>
        </div>

        {/* Regulations & Instructions Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Info size={17} color="#f59e0b" /> Rules &amp; Regulations
            </h2>
          </div>

          {event.description ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {event.description}
            </p>
          ) : (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              Standard ATHLON&apos;26 athletic meet regulations apply. Competitors must be registered by their verified Year Coordinator and report 15 minutes prior to scheduled start time in athletic gear.
            </p>
          )}

          {!isOpen && (
            <div className="alert alert-warning" style={{ marginTop: '16px' }}>
              <AlertTriangle size={15} />
              <span>Registration is currently closed for this competition.</span>
            </div>
          )}
        </div>
      </div>

      {/* Year Coordinator Scope View: My Year Roster */}
      {isYearCoordinator && (
        <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <ClipboardList size={17} color="#3b82f6" />
                {assignedYear} Participation Status
              </h2>
              <p className="card-subtitle">Official registered roster for your assigned academic cohort</p>
            </div>
            <span className={`badge ${isRegistered ? 'badge-success' : 'badge-neutral'}`}>
              {isRegistered ? 'REGISTERED' : 'NOT REGISTERED'}
            </span>
          </div>

          {loadingRegistrations ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Checking year registration status...
            </div>
          ) : !isRegistered ? (
            <EmptyState
              icon={<Users size={24} />}
              title={`${assignedYear} has not registered yet`}
              description={
                isOpen
                  ? `Your cohort has up to ${event.maxParticipantsPerYear} slots available. Complete registration before the closing deadline.`
                  : 'Registration is currently closed for this competition.'
              }
              action={
                isOpen && eligible ? (
                  <Link to={`/events/${event.eventId}/register`} className="btn btn-primary btn-sm">
                    Register {assignedYear} Team
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div>
              {myYearRegistration?.teamName && (
                <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface-elevated)', borderRadius: '6px' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Official Team Name</div>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>{myYearRegistration.teamName}</div>
                  {myYearRegistration.captainName && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Team Captain: <strong>{myYearRegistration.captainName}</strong>
                    </div>
                  )}
                </div>
              )}

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student Name</th>
                      <th>Register Number</th>
                      <th>Class</th>
                      <th>Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myYearRegistration?.participantsSnapshot?.map((st, idx) => (
                      <tr key={st.studentId || idx}>
                        <td>{idx + 1}</td>
                        <td>
                          <strong style={{ color: 'var(--text-primary)' }}>{st.name}</strong>
                          {myYearRegistration.captainId === st.studentId && (
                            <span className="badge badge-primary" style={{ marginLeft: '6px', fontSize: '10px' }}>Captain</span>
                          )}
                        </td>
                        <td><span className="table-cell-muted">{st.registerNumber}</span></td>
                        <td><span className="table-cell-muted">{st.class}</span></td>
                        <td><span className="table-cell-muted">{st.department}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Super Coordinator / View Coordinator: Year-by-Year Breakdown */}
      {(isSuperCoordinator || isViewCoordinator) && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <ClipboardList size={17} color="#10b981" />
                Year-by-Year Cohort Participation
              </h2>
              <p className="card-subtitle">Independent per-year registration status across all academic cohorts</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Academic Cohort</th>
                  <th>Registration Status</th>
                  <th>Registered Count</th>
                  <th>Team / Details</th>
                  <th>Coordinator</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {CANONICAL_YEARS.map((yr) => {
                  const reg = registrations.find(
                    (r) => normalizeAcademicYear(r.year) === yr && r.status === 'registered'
                  );
                  const isReg = Boolean(reg);
                  const count = reg ? reg.participantCount : 0;
                  const max = event.maxParticipantsPerYear;

                  return (
                    <tr key={yr}>
                      <td>
                        <strong style={{ color: 'var(--text-primary)' }}>{yr}</strong>
                      </td>
                      <td>
                        <span className={`badge ${isReg ? 'badge-success' : 'badge-neutral'}`}>
                          {isReg ? 'REGISTERED' : 'NOT REGISTERED'}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: isReg ? '#34d399' : 'var(--text-tertiary)' }}>
                          {count}
                        </strong>{' '}
                        / {max}
                      </td>
                      <td>
                        {reg?.teamName ? (
                          <span>{reg.teamName}</span>
                        ) : reg ? (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>Individual ({count} players)</span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                          {reg?.coordinatorName || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {reg && (
                          <div style={{ display: 'inline-flex', gap: '4px' }}>
                            <Link to={`/events/${event.eventId}/edit-registration/${reg.registrationId}`} className="btn btn-ghost btn-sm">
                              Edit
                            </Link>
                            {isSuperCoordinator && (
                              <button
                                onClick={() => {
                                  setCancellingRegistration(reg);
                                  setShowCancelModal(true);
                                }}
                                className="btn btn-ghost btn-sm"
                                style={{ color: '#f87171' }}
                                title="Cancel this registration"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancel Registration Confirmation Modal */}
      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setCancellingRegistration(null);
        }}
        title="Cancel Competition Registration?"
        message={`Are you sure you want to cancel the ${cancellingRegistration?.year} registration for "${event.eventName}"? This will release the capacity quota and allow a new registration while the event remains open.`}
        confirmText={isCancelling ? 'Cancelling...' : 'Yes, Cancel Registration'}
        type="danger"
        onConfirm={handleConfirmCancelRegistration}
        onCancel={() => {
          setShowCancelModal(false);
          setCancellingRegistration(null);
        }}
      />
    </div>
  );
};
