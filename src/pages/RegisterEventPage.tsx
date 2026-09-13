import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  Users,
  Printer,
  FileDown,
  ShieldCheck,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getEventById, isEventRegistrationOpen, isYearEligible } from '../services/eventService';
import { getScopedStudents, getAllStudents } from '../services/studentService';
import {
  submitRegistrationWithTransaction,
  updateRegistrationWithTransaction,
  getEventRegistrationForYear,
  getRegistrationById,
} from '../services/registrationService';
import { recordActivity } from '../services/activityLogService';
import { getCollegeSettings } from '../services/settingsService';
import { exportSingleRegistrationPDF } from '../services/exportService';
import { normalizeAcademicYear, isSameAcademicYear } from '../utils/academicYear';
import type {
  Event,
  Student,
  Registration,
  StudentParticipantSummary,
  CollegeSettings,
} from '../types';

export const RegisterEventPage: React.FC = () => {
  const { eventId, registrationId } = useParams<{ eventId: string; registrationId?: string }>();
  const { user, isSuperCoordinator, isYearCoordinator } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [event, setEvent] = useState<Event | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [settings, setSettings] = useState<CollegeSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Existing registration state (if year already registered or editing)
  const [existingRegistration, setExistingRegistration] = useState<Registration | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(Boolean(registrationId));

  // Search & Filters in student picker
  const [studentSearch, setStudentSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // Selected Scope
  const assignedYear = user?.assignedYear ? normalizeAcademicYear(user.assignedYear) : '1ST YEAR';

  // Form State: Individual & Team
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [teamName, setTeamName] = useState('');
  const [captainId, setCaptainId] = useState<string>('');

  // Success Confirmation View
  const [completedRegistration, setCompletedRegistration] = useState<Registration | null>(null);

  useEffect(() => {
    if (eventId) {
      loadData(eventId, registrationId);
    }
  }, [eventId, registrationId, user]);

  const loadData = async (id: string, editRegId?: string) => {
    setLoading(true);
    try {
      const [evt, colSettings] = await Promise.all([
        getEventById(id),
        getCollegeSettings(),
      ]);

      if (!evt) {
        showToast('Event Not Found', 'Could not locate event details.', 'error');
        navigate('/events');
        return;
      }

      setEvent(evt);
      setSettings(colSettings);

      // Load eligible students for the coordinator
      let eligibleStudents: Student[] = [];
      if (isYearCoordinator && user?.assignedYear) {
        const canonicalAssigned = normalizeAcademicYear(user.assignedYear);
        eligibleStudents = await getScopedStudents(canonicalAssigned);
      } else {
        eligibleStudents = await getAllStudents();
      }
      setStudents(eligibleStudents.filter((s) => s.active));

      // Check for existing registration
      let foundReg: Registration | null = null;
      if (editRegId) {
        foundReg = await getRegistrationById(editRegId, isYearCoordinator ? user?.assignedYear : undefined);
        setIsEditMode(true);
      }
      if (!foundReg && isYearCoordinator && user?.assignedYear) {
        foundReg = await getEventRegistrationForYear(id, user.assignedYear);
        if (foundReg && editRegId) {
          setIsEditMode(true);
        }
      }

      if (foundReg && foundReg.status === 'registered') {
        setExistingRegistration(foundReg);
        // If in edit mode, pre-populate form
        if (editRegId || isEditMode) {
          setSelectedStudentIds(foundReg.participantIds || []);
          setTeamName(foundReg.teamName || '');
          setCaptainId(foundReg.captainId || '');
        }
      }
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to initialize registration.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditing = () => {
    if (!existingRegistration) return;
    setIsEditMode(true);
    setSelectedStudentIds(existingRegistration.participantIds || []);
    setTeamName(existingRegistration.teamName || '');
    setCaptainId(existingRegistration.captainId || '');
  };

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
        <div className="spinner" style={{ margin: '0 auto var(--space-4)', width: 28, height: 28 }} />
        <p style={{ color: 'var(--text-secondary)' }}>Preparing registration portal...</p>
      </div>
    );
  }

  if (!event) return null;

  const { isOpen, reason } = isEventRegistrationOpen(event);
  const eligible = !assignedYear || isYearEligible(event, assignedYear);

  // Other registered student IDs in the event (excluding currently edited registration)
  const registeredIdsExcludingSelf = new Set<string>(
    (event.registeredParticipantIds || []).filter(
      (id) => !isEditMode || !existingRegistration?.participantIds?.includes(id)
    )
  );

  const maxAllowed = event.maxParticipantsPerYear || 10;
  const minRequired = event.minParticipantsPerYear || (event.eventType === 'team' ? 2 : 1);

  // Filter options derived from student roster
  const availableClasses = Array.from(new Set(students.map((s) => s.class))).filter(Boolean).sort();
  const availableDepts = Array.from(new Set(students.map((s) => s.department))).filter(Boolean).sort();

  // Filter available students
  const filteredStudents = students.filter((s) => {
    const q = studentSearch.toLowerCase();
    const matchesSearch =
      s.name.toLowerCase().includes(q) ||
      s.registerNumber.toLowerCase().includes(q);
    const matchesClass = !classFilter || s.class === classFilter;
    const matchesDept = !deptFilter || s.department === deptFilter;
    return matchesSearch && matchesClass && matchesDept;
  });

  // Toggle student selection
  const handleToggleStudent = (studentId: string) => {
    if (registeredIdsExcludingSelf.has(studentId)) return;

    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
      if (captainId === studentId) setCaptainId('');
    } else {
      if (selectedStudentIds.length >= maxAllowed) {
        showToast(
          'Capacity Limit',
          `Cannot exceed maximum quota of ${maxAllowed} participant(s) per year for ${assignedYear}.`,
          'warning'
        );
        return;
      }
      setSelectedStudentIds([...selectedStudentIds, studentId]);
      if (event.eventType === 'team' && !captainId) {
        setCaptainId(studentId);
      }
    }
  };

  // Submit registration handler
  const handleSubmit = async () => {
    if (!user) return;

    // Check window and eligibility
    if (!isSuperCoordinator && !isOpen) {
      showToast('Registration Closed', reason, 'error');
      return;
    }
    if (!eligible) {
      showToast('Ineligible', `${assignedYear} is not eligible for this competition.`, 'error');
      return;
    }

    // Validation by event type
    if (event.eventType === 'individual') {
      if (selectedStudentIds.length === 0) {
        showToast('Selection Required', 'Please select at least 1 athlete.', 'warning');
        return;
      }
      if (selectedStudentIds.length > maxAllowed) {
        showToast('Quota Exceeded', `Maximum allowed is ${maxAllowed} participants.`, 'warning');
        return;
      }
    } else if (event.eventType === 'team') {
      if (!teamName.trim()) {
        showToast('Team Name Required', 'Please provide an official team name.', 'warning');
        return;
      }
      if (selectedStudentIds.length < minRequired) {
        showToast('Team Size Incomplete', `A minimum of ${minRequired} players is required (currently: ${selectedStudentIds.length}).`, 'warning');
        return;
      }
      if (selectedStudentIds.length > maxAllowed) {
        showToast('Capacity Exceeded', `Team size cannot exceed ${maxAllowed} players.`, 'warning');
        return;
      }
      if (!captainId) {
        showToast('Captain Required', 'Please designate a team captain.', 'warning');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const finalStudentIds = selectedStudentIds;
      const studentSummaries: StudentParticipantSummary[] = selectedStudentIds.map((sId) => {
        const st = students.find((s) => s.studentId === sId);
        return {
          studentId: sId,
          name: st?.name || 'Student',
          registerNumber: st?.registerNumber || '',
          year: st?.year || assignedYear,
          class: st?.class || 'N/A',
          department: st?.department || 'N/A',
        };
      });

      // Security check: Ensure all participants belong to the coordinator's assigned year
      if (isYearCoordinator && user?.assignedYear) {
        const canonicalAssigned = normalizeAcademicYear(user.assignedYear);
        const crossYearStudent = studentSummaries.find((s) => !isSameAcademicYear(s.year, canonicalAssigned));
        if (crossYearStudent) {
          showToast(
            'Cross-Year Error',
            `Participant "${crossYearStudent.name}" belongs to "${crossYearStudent.year}", which is outside your assigned year "${user.assignedYear}".`,
            'error'
          );
          setIsSubmitting(false);
          return;
        }
      }

      const distinctClasses = Array.from(new Set(studentSummaries.map((s) => s.class))).filter(Boolean);
      const distinctDepts = Array.from(new Set(studentSummaries.map((s) => s.department))).filter(Boolean);
      const regClassName = distinctClasses.length === 1 ? distinctClasses[0] : (distinctClasses.join(', ') || 'All Sections');
      const regDept = distinctDepts.length === 1 ? distinctDepts[0] : (distinctDepts.join(', ') || 'Combined');
      const regYear = assignedYear;
      const captainStudent = event.eventType === 'team' ? students.find((s) => s.studentId === captainId) : undefined;

      if (isEditMode && existingRegistration) {
        // Update existing registration
        await updateRegistrationWithTransaction({
          registrationId: existingRegistration.docId || existingRegistration.registrationId,
          participantIds: finalStudentIds,
          participantsSnapshot: studentSummaries,
          teamName: event.eventType !== 'individual' ? teamName.trim() : undefined,
          captainId: event.eventType === 'team' ? captainId : undefined,
          captainName: captainStudent?.name,
          relayOrder: undefined,
          updatedByUid: user.uid,
          isSuperCoordinator,
          scopedYear: user.assignedYear,
        });

        await recordActivity(
          'update_registration',
          user.uid,
          user.name,
          user.role,
          'registration',
          existingRegistration.registrationId,
          {
            eventName: event.eventName,
            academicYear: regYear,
            participantCount: finalStudentIds.length,
          }
        );

        showToast('Registration Updated', 'Official registration entry successfully updated.', 'success');
        setCompletedRegistration({
          ...existingRegistration,
          participantIds: finalStudentIds,
          participantsSnapshot: studentSummaries,
          participantCount: finalStudentIds.length,
          teamName: teamName.trim(),
          captainId,
          captainName: captainStudent?.name,
        });
      } else {
        // Create new registration
        const resultReg = await submitRegistrationWithTransaction({
          eventId: event.eventId,
          year: regYear,
          className: regClassName,
          department: regDept,
          participantIds: finalStudentIds,
          participantsSnapshot: studentSummaries,
          registrationType: event.eventType,
          teamName: event.eventType !== 'individual' ? teamName.trim() : undefined,
          captainId: event.eventType === 'team' ? captainId : undefined,
          captainName: captainStudent?.name,
          relayOrder: undefined,
          coordinatorId: user.uid,
          coordinatorName: user.name,
          coordinatorEmail: user.email,
        });

        await recordActivity(
          'create_registration',
          user.uid,
          user.name,
          user.role,
          'registration',
          resultReg.registrationId,
          {
            eventName: event.eventName,
            academicYear: regYear,
            participantCount: finalStudentIds.length,
          }
        );

        setCompletedRegistration(resultReg);
        showToast('Registration Confirmed', 'Successfully submitted official entry.', 'success');
      }
    } catch (err: any) {
      showToast('Registration Error', err.message || 'Error executing registration transaction.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // SUCCESS CONFIRMATION SLIDE
  if (completedRegistration) {
    return (
      <div className="page-container" style={{ maxWidth: '800px', margin: 'var(--space-6) auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-6)' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--color-success-light)',
              color: 'var(--color-success)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 'var(--space-4)',
              border: '1px solid var(--color-success-border)',
            }}
          >
            <CheckCircle2 size={32} />
          </div>

          <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: '8px', color: 'var(--text-primary)' }}>
            Official Registration Confirmed
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)' }}>
            Entry successfully recorded for <strong>{completedRegistration.eventNameSnapshot}</strong>.
          </p>

          <div
            style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              textAlign: 'left',
              marginBottom: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: 'var(--text-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Registration Ref ID:</span>
              <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {completedRegistration.registrationId}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Academic Cohort Scope:</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {completedRegistration.year}
              </span>
            </div>
            {completedRegistration.teamName && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Team Name:</span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {completedRegistration.teamName}
                </strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Athletes:</span>
              <span style={{ color: '#34d399', fontWeight: 600 }}>
                {completedRegistration.participantCount} Participant(s)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button
              onClick={() => exportSingleRegistrationPDF(completedRegistration, settings || undefined)}
              className="btn btn-primary btn-md"
            >
              <FileDown size={15} /> Download PDF Slip
            </button>
            <button onClick={() => window.print()} className="btn btn-secondary btn-md">
              <Printer size={15} /> Print Slip
            </button>
            <Link to={`/events/${event.eventId}`} className="btn btn-secondary btn-md">
              Back to Event Details
            </Link>
            <Link to="/registrations" className="btn btn-ghost btn-md">
              All Registrations
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ALREADY REGISTERED BANNER (If Year already registered and not currently editing)
  if (existingRegistration && !isEditMode && isYearCoordinator) {
    return (
      <div className="page-container" style={{ maxWidth: '800px', margin: 'var(--space-6) auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-6)' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 'var(--space-4)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}
          >
            <Users size={32} />
          </div>

          <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: '8px', color: 'var(--text-primary)' }}>
            {assignedYear} is Already Registered
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-5)', fontSize: 'var(--text-sm)' }}>
            An official team registration for <strong>{event.eventName}</strong> has already been submitted for {assignedYear}.
            Each academic cohort is limited to one team entry.
          </p>

          <div
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              textAlign: 'left',
              marginBottom: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: 'var(--text-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Registration Ref:</span>
              <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {existingRegistration.registrationId}
              </strong>
            </div>
            {existingRegistration.teamName && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Team Name:</span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {existingRegistration.teamName}
                </strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Current Players:</span>
              <span style={{ color: '#34d399', fontWeight: 600 }}>
                {existingRegistration.participantCount} / {event.maxParticipantsPerYear}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {isOpen && (
              <button onClick={handleStartEditing} className="btn btn-primary btn-md">
                <Edit3 size={15} /> Edit Registration Roster
              </button>
            )}
            <Link to={`/events/${event.eventId}`} className="btn btn-secondary btn-md">
              Back to Event Details
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '1200px' }}>
      {/* Back Link */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link
          to={`/events/${event.eventId}`}
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
          <ArrowLeft size={13} /> Back to Event
        </Link>
      </div>

      {/* Header Banner */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
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
              <span className="badge badge-year">
                Academic Year: {assignedYear}
              </span>
              {isEditMode && (
                <span className="badge badge-warning">
                  EDIT MODE
                </span>
              )}
            </div>

            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isEditMode ? `Edit Registration: ${event.eventName}` : `Register for ${event.eventName}`}
            </h1>

            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
              {event.eventType === 'team'
                ? `Team size quota: ${minRequired}–${maxAllowed} students per year for ${assignedYear}.`
                : `Quota: Up to ${maxAllowed} participant(s) per year for ${assignedYear}.`}
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Selected for {assignedYear}:
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: selectedStudentIds.length >= minRequired ? '#34d399' : '#f59e0b' }}>
              {selectedStudentIds.length} / {maxAllowed}
            </div>
          </div>
        </div>

        {/* Warning if closed */}
        {!isOpen && !isSuperCoordinator && (
          <div className="alert alert-warning" style={{ marginTop: '12px' }}>
            <AlertTriangle size={15} />
            <span>Registration is currently closed: {reason}</span>
          </div>
        )}
      </div>

      <div className="grid-2col">
        {/* Left Column: Student Selector */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Users size={17} color="#3b82f6" /> Eligible {assignedYear} Students
              </h2>
              <p className="card-subtitle">
                Click any active student to add or remove them from your team
              </p>
            </div>
          </div>

          {/* Student Filter Toolbar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 'var(--space-4)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search by student name or register no..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <select
                className="filter-select"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                style={{ width: '100%', height: '34px', fontSize: 'var(--text-xs)' }}
              >
                <option value="">All Classes / Sections</option>
                {availableClasses.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                className="filter-select"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                style={{ width: '100%', height: '34px', fontSize: 'var(--text-xs)' }}
              >
                <option value="">All Departments</option>
                {availableDepts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4)' }}>
              No eligible {assignedYear} students found matching query or filters.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '440px', overflowY: 'auto' }}>
              {filteredStudents.map((st) => {
                const isSelected = selectedStudentIds.includes(st.studentId);
                const isRegisteredElsewhere = registeredIdsExcludingSelf.has(st.studentId);

                return (
                  <div
                    key={st.studentId}
                    onClick={() => !isRegisteredElsewhere && handleToggleStudent(st.studentId)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      background: isSelected
                        ? 'var(--color-primary-light)'
                        : 'var(--bg-surface-elevated)',
                      border: `1px solid ${isSelected ? 'var(--color-primary-border)' : 'var(--border-subtle)'}`,
                      cursor: isRegisteredElsewhere ? 'not-allowed' : 'pointer',
                      opacity: isRegisteredElsewhere ? 0.45 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: isSelected ? '#93c5fd' : 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
                        {st.name}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {st.registerNumber} &bull; <span style={{ color: 'var(--text-primary)' }}>{st.class}</span> &bull; {st.department}
                      </div>
                    </div>

                    <div>
                      {isRegisteredElsewhere ? (
                        <span className="badge" style={{ fontSize: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}>
                          Registered in Event
                        </span>
                      ) : isSelected ? (
                        <CheckCircle2 size={16} color="#60a5fa" />
                      ) : (
                        <span className="btn btn-ghost btn-sm" style={{ padding: '0.2rem 0.5rem', fontSize: '11px' }}>
                          Select
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Registration Configuration & Submission */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <ShieldCheck size={17} color="#10b981" />
                {isEditMode ? 'Edit Team Details' : 'Team Details & Confirmation'}
              </h2>
              <p className="card-subtitle">Configure team roster for {assignedYear}</p>
            </div>
          </div>

          {/* Team Details Inputs */}
          {event.eventType === 'team' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Official Team Name *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder={`e.g. ${assignedYear} Strikers`}
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Designate Team Captain *</label>
                <select
                  className="form-input"
                  value={captainId}
                  onChange={(e) => setCaptainId(e.target.value)}
                >
                  <option value="">Select captain from chosen players...</option>
                  {selectedStudentIds.map((sId) => {
                    const st = students.find((s) => s.studentId === sId);
                    return (
                      <option key={sId} value={sId}>
                        {st?.name} ({st?.registerNumber} • {st?.class})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          {/* Selected Roster Preview */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="form-label">Selected Athletes ({selectedStudentIds.length} / {maxAllowed})</span>
              <span style={{ fontSize: 'var(--text-xs)', color: selectedStudentIds.length < minRequired ? '#f87171' : 'var(--text-secondary)' }}>
                {event.eventType === 'team' && selectedStudentIds.length < minRequired
                  ? `Need ${minRequired - selectedStudentIds.length} more players`
                  : 'Meets requirements'}
              </span>
            </div>

            {selectedStudentIds.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                Click students in the left column to add them to this entry.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                {selectedStudentIds.map((sId) => {
                  const st = students.find((s) => s.studentId === sId);
                  return (
                    <span
                      key={sId}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-full)',
                        padding: '0.25rem 0.65rem',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {st?.name}
                      {captainId === sId && <strong style={{ color: '#f59e0b' }}>(C)</strong>}
                      <button
                        type="button"
                        onClick={() => handleToggleStudent(sId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#f87171',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '13px',
                          lineHeight: 1,
                        }}
                      >
                        &times;
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submission Verification */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} color="#10b981" />
              <span>
                Authorized by <strong>{user?.name}</strong> ({assignedYear})
              </span>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || (event.eventType === 'team' && selectedStudentIds.length < minRequired)}
              className="btn btn-primary btn-md"
              style={{ width: '100%' }}
            >
              {isSubmitting ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                  <span>Submitting Entry...</span>
                </>
              ) : isEditMode ? (
                <>
                  <CheckCircle2 size={16} /> Save &amp; Update Registration
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Confirm &amp; Submit Registration
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
