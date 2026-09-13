import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy,
  Calendar,
  MapPin,
  PlusCircle,
  Search,
  Edit2,
  Trash2,
  RotateCcw,
  Lock,
  Unlock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  isEventRegistrationOpen,
  isYearEligible,
  toggleEventRegistrationStatus,
} from '../services/eventService';
import { recordActivity } from '../services/activityLogService';
import { normalizeAcademicYear, CANONICAL_YEARS } from '../utils/academicYear';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { SkeletonTable } from '../components/common/Skeleton';
import type { Event, EventType, EventStatus } from '../types';

export const EventsPage: React.FC = () => {
  const { user, isSuperCoordinator, isYearCoordinator } = useAuth();
  const { showToast } = useToast();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Create / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Athletics');
  const [formType, setFormType] = useState<EventType>('individual');
  const [formMaxParticipants, setFormMaxParticipants] = useState<number>(5);
  const [formMinParticipants, setFormMinParticipants] = useState<number>(7);
  const [formDate, setFormDate] = useState('2026-09-25');
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('12:00');
  const [formVenue, setFormVenue] = useState('College Main Stadium');
  const [formDeadline, setFormDeadline] = useState('2026-09-23T23:59');
  const [formManualOverride, setFormManualOverride] = useState(false);
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<EventStatus>('open');
  const [formEligibleYears, setFormEligibleYears] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Confirmation
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<Event | null>(null);

  const assignedYear = user?.assignedYear ? normalizeAcademicYear(user.assignedYear) : '';

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await getAllEvents();
      setEvents(data);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to fetch events', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      e.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.venue && e.venue.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter;
    const matchesType = typeFilter === 'all' || e.eventType === typeFilter;
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesCategory && matchesType && matchesStatus;
  });

  const handleOpenCreate = () => {
    setEditingEvent(null);
    setFormName('');
    setFormCategory('Athletics');
    setFormType('individual');
    setFormMaxParticipants(5);
    setFormMinParticipants(7);
    setFormDate('2026-09-25');
    setFormStartTime('09:00');
    setFormEndTime('12:00');
    setFormVenue('College Main Stadium');
    setFormDeadline('2026-09-23T23:59');
    setFormManualOverride(false);
    setFormDescription('');
    setFormStatus('open');
    setFormEligibleYears([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (evt: Event) => {
    setEditingEvent(evt);
    setFormName(evt.eventName);
    setFormCategory(evt.category || 'Athletics');
    setFormType(evt.eventType || 'individual');
    setFormMaxParticipants(evt.maxParticipantsPerYear || 5);
    setFormMinParticipants(evt.minParticipantsPerYear || 7);
    setFormDate(evt.date);
    setFormStartTime(evt.startTime || '');
    setFormEndTime(evt.endTime || '');
    setFormVenue(evt.venue || '');
    setFormDeadline(evt.registrationDeadline);
    setFormManualOverride(Boolean(evt.manualRegistrationOverride));
    setFormDescription(evt.description || '');
    setFormStatus(evt.status);
    setFormEligibleYears(evt.eligibleYears || []);
    setIsModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formDate || !formDeadline) {
      showToast('Validation Error', 'Please complete all required fields.', 'warning');
      return;
    }

    if (formType === 'team') {
      if (Number(formMinParticipants) > Number(formMaxParticipants)) {
        showToast('Capacity Error', 'Minimum participants cannot exceed maximum participants.', 'warning');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (editingEvent) {
        const updates: Partial<Event> = {
          eventName: formName.trim(),
          category: formCategory,
          eventType: formType,
          maxParticipantsPerYear: Number(formMaxParticipants),
          minParticipantsPerYear: formType === 'team' ? Number(formMinParticipants) : undefined,
          eligibleYears: formEligibleYears.length > 0 ? formEligibleYears : undefined,
          date: formDate,
          startTime: formStartTime || undefined,
          endTime: formEndTime || undefined,
          venue: formVenue.trim() || undefined,
          registrationDeadline: formDeadline,
          manualRegistrationOverride: formManualOverride,
          description: formDescription.trim(),
          status: formStatus,
        };
        await updateEvent(editingEvent.eventId, updates, user?.uid || '');
        if (user) {
          await recordActivity(
            'update_event',
            user.uid,
            user.name,
            user.role,
            'event',
            editingEvent.eventId,
            { eventName: formName.trim() }
          );
        }
        showToast('Event Updated', `${formName.trim()} has been successfully updated.`, 'success');
      } else {
        const newEvt = await createEvent(
          {
            eventName: formName.trim(),
            category: formCategory,
            eventType: formType,
            maxParticipantsPerYear: Number(formMaxParticipants),
            minParticipantsPerYear: formType === 'team' ? Number(formMinParticipants) : undefined,
            eligibleYears: formEligibleYears.length > 0 ? formEligibleYears : undefined,
            date: formDate,
            startTime: formStartTime || undefined,
            endTime: formEndTime || undefined,
            venue: formVenue.trim() || undefined,
            registrationDeadline: formDeadline,
            manualRegistrationOverride: formManualOverride,
            description: formDescription.trim(),
            status: formStatus,
          },
          user?.uid || ''
        );
        if (user) {
          await recordActivity(
            'create_event',
            user.uid,
            user.name,
            user.role,
            'event',
            newEvt.eventId,
            { eventName: formName.trim() }
          );
        }
        showToast('Event Created', `${formName.trim()} is now configured.`, 'success');
      }
      setIsModalOpen(false);
      await loadEvents();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to save event', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleEventStatus = async (evt: Event) => {
    if (!user) return;
    const nextStatus: EventStatus = evt.status === 'open' ? 'closed' : 'open';
    try {
      await toggleEventRegistrationStatus(
        evt.eventId,
        nextStatus,
        Boolean(evt.manualRegistrationOverride),
        user.uid
      );
      showToast(
        'Status Updated',
        `Registration for "${evt.eventName}" is now ${nextStatus.toUpperCase()}.`,
        'info'
      );
      await loadEvents();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to update status', 'error');
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteEvent) return;
    try {
      await deleteEvent(confirmDeleteEvent.eventId);
      if (user) {
        await recordActivity(
          'delete_event',
          user.uid,
          user.name,
          user.role,
          'event',
          confirmDeleteEvent.eventId,
          { eventName: confirmDeleteEvent.eventName }
        );
      }
      showToast('Event Deleted', `${confirmDeleteEvent.eventName} has been removed.`, 'success');
      setConfirmDeleteEvent(null);
      await loadEvents();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to delete event', 'error');
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="Events"
        subtitle="Manage competition events, per-year capacity quotas, and registration schedules"
        actions={
          isSuperCoordinator ? (
            <button onClick={handleOpenCreate} className="btn btn-primary btn-sm">
              <PlusCircle size={15} /> Create Event
            </button>
          ) : undefined
        }
      />

      {/* Filter Bar */}
      <div className="filter-card">
        <div className="filter-bar">
          <div className="search-input-wrap">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search by event title or venue..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="draft">Draft</option>
            <option value="completed">Completed</option>
          </select>

          <select
            className="filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            <option value="Athletics">Athletics</option>
            <option value="Games">Games</option>
          </select>

          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="individual">Individual</option>
            <option value="team">Team</option>
          </select>

          {(searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' || typeFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setCategoryFilter('all');
                setTypeFilter('all');
              }}
              className="btn btn-ghost btn-sm"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setViewMode('cards')}
              className={`btn btn-sm ${viewMode === 'cards' ? 'btn-secondary' : 'btn-ghost'}`}
              title="Card Grid View"
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`btn btn-sm ${viewMode === 'table' ? 'btn-secondary' : 'btn-ghost'}`}
              title="Table View"
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Events Presentation */}
      {loading ? (
        <SkeletonTable rows={5} columns={6} />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon={<Trophy size={28} />}
          title="No Matching Events Found"
          description="Try adjusting your filter criteria or search query to find relevant sports events."
          action={
            isSuperCoordinator ? (
              <button onClick={handleOpenCreate} className="btn btn-primary btn-sm">
                <PlusCircle size={14} /> Add New Event
              </button>
            ) : undefined
          }
        />
      ) : viewMode === 'cards' ? (
        <div className="grid-cards">
          {filteredEvents.map((evt) => {
            const { isOpen } = isEventRegistrationOpen(evt);
            const eligible = !assignedYear || isYearEligible(evt, assignedYear);
            
            // Year-specific status for Year Coordinator
            const myYearSummary = assignedYear && evt.yearRegistrations?.[assignedYear]?.status === 'registered'
              ? evt.yearRegistrations[assignedYear]
              : null;
            const isRegistered = Boolean(myYearSummary);

            // Participating years count for Super Coordinator
            const participatingYearsCount = Object.values(evt.yearRegistrations || {}).filter(
              (s) => s.status === 'registered'
            ).length;

            return (
              <div key={evt.eventId} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                  <span
                    className="badge"
                    style={{
                      background: 'var(--color-primary-light)',
                      color: '#93c5fd',
                      border: '1px solid var(--color-primary-border)',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {evt.category} &bull; {evt.eventType}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {evt.manualRegistrationOverride && (
                      <span className="badge badge-warning" style={{ fontSize: '10px' }} title="Manual extension active">
                        Override
                      </span>
                    )}
                    <span className={`status-badge status-${evt.status}`}>
                      {evt.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  {evt.eventName}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={13} color="#94a3b8" />
                    <span>{new Date(evt.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  {evt.venue && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={13} color="#94a3b8" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.venue}</span>
                    </div>
                  )}
                </div>

                {/* Per-Year Capacity Info */}
                <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Capacity Model:</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                      {evt.eventType === 'team'
                        ? `Team size: ${evt.minParticipantsPerYear || 2}–${evt.maxParticipantsPerYear} per year`
                        : `Max: ${evt.maxParticipantsPerYear} per year`}
                    </span>
                  </div>

                  {/* Year Coordinator Scope View */}
                  {isYearCoordinator && assignedYear && (
                    <div style={{ marginTop: '6px', padding: '6px 8px', borderRadius: '4px', background: isRegistered ? 'rgba(16, 185, 129, 0.1)' : 'var(--surface-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{assignedYear}:</span>
                      {isRegistered ? (
                        <span style={{ color: '#34d399', fontWeight: 600 }}>
                          Registered ({myYearSummary?.participantCount || 0} players)
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>Not Registered</span>
                      )}
                    </div>
                  )}

                  {/* Super Coordinator / Admin Summary */}
                  {isSuperCoordinator && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      <span>Participating Cohorts: <strong>{participatingYearsCount}</strong> registered</span>
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', gap: '8px' }}>
                  <Link to={`/events/${evt.eventId}`} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                    Details
                  </Link>

                  {isYearCoordinator && eligible && (
                    isRegistered ? (
                      <Link to={`/events/${evt.eventId}`} className="btn btn-ghost btn-sm" style={{ color: '#34d399' }}>
                        View Team
                      </Link>
                    ) : isOpen ? (
                      <Link to={`/events/${evt.eventId}/register`} className="btn btn-primary btn-sm">
                        Register
                      </Link>
                    ) : (
                      <span className="badge badge-neutral" style={{ fontSize: '11px' }}>Closed</span>
                    )
                  )}

                  {isSuperCoordinator && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => handleToggleEventStatus(evt)}
                        className="btn btn-ghost btn-sm"
                        title={evt.status === 'open' ? 'Close Registration' : 'Open Registration'}
                        style={{ padding: '0.4rem', color: evt.status === 'open' ? '#f59e0b' : '#10b981' }}
                      >
                        {evt.status === 'open' ? <Lock size={13} /> : <Unlock size={13} />}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(evt)}
                        className="btn btn-ghost btn-sm"
                        title="Edit Event"
                        style={{ padding: '0.4rem' }}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteEvent(evt)}
                        className="btn btn-ghost btn-sm"
                        title="Delete Event"
                        style={{ padding: '0.4rem', color: '#f87171' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event Name</th>
                <th>Category</th>
                <th>Type</th>
                <th>Schedule Date</th>
                <th>Per-Year Capacity</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((evt) => (
                <tr key={evt.eventId}>
                  <td>
                    <strong style={{ color: 'var(--text-primary)' }}>{evt.eventName}</strong>
                    {evt.venue && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{evt.venue}</div>}
                  </td>
                  <td><span className="table-cell-muted">{evt.category}</span></td>
                  <td><span style={{ textTransform: 'capitalize', fontSize: 'var(--text-xs)' }}>{evt.eventType}</span></td>
                  <td><span style={{ fontSize: 'var(--text-xs)' }}>{evt.date}</span></td>
                  <td>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary)' }}>
                      {evt.eventType === 'team'
                        ? `${evt.minParticipantsPerYear || 2}–${evt.maxParticipantsPerYear} / year`
                        : `${evt.maxParticipantsPerYear} / year`}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge status-${evt.status}`}>{evt.status}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '4px' }}>
                      <Link to={`/events/${evt.eventId}`} className="btn btn-ghost btn-sm">
                        View
                      </Link>
                      {isYearCoordinator && isEventRegistrationOpen(evt).isOpen && !evt.yearRegistrations?.[assignedYear] && (
                        <Link to={`/events/${evt.eventId}/register`} className="btn btn-primary btn-sm">
                          Register
                        </Link>
                      )}
                      {isSuperCoordinator && (
                        <>
                          <button
                            onClick={() => handleOpenEdit(evt)}
                            className="btn btn-ghost btn-sm"
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteEvent(evt)}
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#f87171' }}
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Event Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEvent ? 'Edit Competition Event' : 'Create New Competition Event'}
        subtitle="Configure event rules, per-year quota limits, and registration timeline."
      >
        <form onSubmit={handleSaveEvent}>
          <div className="form-group">
            <label className="form-label">Event Name *</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="e.g. Football, 500m Run, 100m Sprint, Cricket"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select
                className="form-input"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
              >
                <option value="Athletics">Athletics</option>
                <option value="Games">Games</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Participation Type *</label>
              <select
                className="form-input"
                value={formType}
                onChange={(e) => {
                  const t = e.target.value as EventType;
                  setFormType(t);
                  if (t === 'individual') {
                    setFormMaxParticipants(5);
                  } else if (t === 'team') {
                    setFormMinParticipants(7);
                    setFormMaxParticipants(10);
                  }
                }}
              >
                <option value="individual">Individual</option>
                <option value="team">Team</option>
              </select>
            </div>
          </div>

          {/* Dynamic Per-Year Capacity Fields */}
          {formType === 'individual' ? (
            <div className="form-group">
              <label className="form-label">Maximum Participants Per Year *</label>
              <input
                type="number"
                required
                min={1}
                max={100}
                className="form-input"
                placeholder="e.g. 5"
                value={formMaxParticipants}
                onChange={(e) => setFormMaxParticipants(Number(e.target.value))}
              />
              <small style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                Each academic year (1st, 2nd, 3rd, 4th Year) can register up to this many individual student competitors.
              </small>
            </div>
          ) : (
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Minimum Participants Per Year *</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={50}
                  className="form-input"
                  placeholder="e.g. 7"
                  value={formMinParticipants}
                  onChange={(e) => setFormMinParticipants(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Maximum Participants Per Year *</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={50}
                  className="form-input"
                  placeholder="e.g. 10"
                  value={formMaxParticipants}
                  onChange={(e) => setFormMaxParticipants(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Competition Date *</label>
              <input
                type="date"
                required
                className="form-input"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Venue Location (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Main Ground, Outdoor Court"
                value={formVenue}
                onChange={(e) => setFormVenue(e.target.value)}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Start Time (Optional)</label>
              <input
                type="time"
                className="form-input"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">End Time (Optional)</label>
              <input
                type="time"
                className="form-input"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Registration Deadline *</label>
              <input
                type="datetime-local"
                required
                className="form-input"
                value={formDeadline}
                onChange={(e) => setFormDeadline(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Registration Status *</label>
              <select
                className="form-input"
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as EventStatus)}
              >
                <option value="open">Open (Accepting registrations)</option>
                <option value="closed">Closed (Locked)</option>
                <option value="draft">Draft (Hidden)</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Super Coordinator Manual Extension Override */}
          <div className="form-group" style={{ background: 'var(--surface-elevated)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={formManualOverride}
                onChange={(e) => setFormManualOverride(e.target.checked)}
              />
              <span>Allow registration past deadline (manual override)</span>
            </label>
            <p style={{ margin: '4px 0 0 24px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
              If enabled, coordinators can continue registering even if the registration deadline has passed, until you manually close the event.
            </p>
          </div>

          {/* Optional Eligible Academic Years */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Eligible Academic Years (Optional)</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '11px', padding: '2px 8px', height: '24px', minHeight: 'unset', lineHeight: '1.2' }}
                  onClick={() => setFormEligibleYears([...CANONICAL_YEARS])}
                >
                  All
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '11px', padding: '2px 8px', height: '24px', minHeight: 'unset', lineHeight: '1.2' }}
                  onClick={() => setFormEligibleYears([])}
                >
                  Clear
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
              {CANONICAL_YEARS.map((yr) => (
                <label key={yr} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formEligibleYears.includes(yr)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormEligibleYears([...formEligibleYears, yr]);
                      } else {
                        setFormEligibleYears(formEligibleYears.filter((y) => y !== yr));
                      }
                    }}
                  />
                  <span>{yr}</span>
                </label>
              ))}
            </div>
            <small style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
              Leave all unchecked to make this event open to all academic years.
            </small>
          </div>

          {/* Optional Description / Rules & Regulations */}
          <div className="form-group">
            <label className="form-label">Description / Rules &amp; Regulations (Optional)</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Enter optional competition rules, chest number requirements, gear guidelines..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn btn-secondary btn-sm"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                  <span>Saving...</span>
                </>
              ) : editingEvent ? (
                'Update Event'
              ) : (
                'Create Event'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!confirmDeleteEvent}
        onClose={() => setConfirmDeleteEvent(null)}
        title="Delete Competition Event?"
        message={`Are you sure you want to permanently delete "${confirmDeleteEvent?.eventName}"? This cannot be undone.`}
        confirmText="Delete Event"
        type="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteEvent(null)}
      />
    </div>
  );
};
