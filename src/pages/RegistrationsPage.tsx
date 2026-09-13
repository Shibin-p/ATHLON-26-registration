import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Search,
  FileSpreadsheet,
  Printer,
  FileDown,
  XCircle,
  Eye,
  RotateCcw,
  Edit3,
  Download,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getAllRegistrations,
  getScopedRegistrations,
  cancelRegistrationWithTransaction,
} from '../services/registrationService';
import { recordActivity } from '../services/activityLogService';
import { getCollegeSettings } from '../services/settingsService';
import {
  exportRegistrationsToExcel,
  exportSingleRegistrationPDF,
  exportDetailedStudentsToExcel,
  exportDetailedStudentsToPDF,
  filterRegistrationsForExport,
} from '../services/exportService';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { SkeletonTable } from '../components/common/Skeleton';
import type { Registration, CollegeSettings } from '../types';
import { normalizeAcademicYear, CANONICAL_YEARS } from '../utils/academicYear';

export const RegistrationsPage: React.FC = () => {
  const { user, isSuperCoordinator, isYearCoordinator } = useAuth();
  const { showToast } = useToast();

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [settings, setSettings] = useState<CollegeSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Student details export modal state
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportScope, setExportScope] = useState<'all' | 'event' | 'year'>('all');
  const [exportSelectedEvent, setExportSelectedEvent] = useState<string>('all');
  const [exportSelectedYear, setExportSelectedYear] = useState<string>('all');
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf'>('excel');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Detail Modal
  const [viewingRegistration, setViewingRegistration] = useState<Registration | null>(null);

  // Cancel Confirmation Modal
  const [confirmCancelReg, setConfirmCancelReg] = useState<Registration | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    loadRegistrationsAndSettings();
  }, [user]);

  const loadRegistrationsAndSettings = async () => {
    setLoading(true);
    try {
      const [colSettings] = await Promise.all([getCollegeSettings()]);
      setSettings(colSettings);

      let data: Registration[] = [];
      if (isYearCoordinator && user?.assignedYear) {
        data = await getScopedRegistrations(normalizeAcademicYear(user.assignedYear));
      } else {
        data = await getAllRegistrations();
      }
      setRegistrations(data);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to fetch registrations', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Distinct values for filter drop downs
  const uniqueEventNames = Array.from(new Set(registrations.map((r) => r.eventNameSnapshot))).filter(Boolean);
  const uniqueYears = Array.from(new Set(registrations.map((r) => r.year))).filter(Boolean);
  const uniqueClasses = Array.from(new Set(registrations.map((r) => r.class))).filter(Boolean);

  const filteredRegistrations = registrations.filter((r) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      r.eventNameSnapshot.toLowerCase().includes(q) ||
      r.registrationId.toLowerCase().includes(q) ||
      r.coordinatorName.toLowerCase().includes(q) ||
      (r.teamName && r.teamName.toLowerCase().includes(q)) ||
      (r.participantsSnapshot && r.participantsSnapshot.some((s) => s.name.toLowerCase().includes(q) || s.registerNumber.toLowerCase().includes(q)));

    const matchesEvent = eventFilter === 'all' || r.eventNameSnapshot === eventFilter;
    const matchesYear = yearFilter === 'all' || r.year === yearFilter;
    const matchesClass = classFilter === 'all' || r.class === classFilter;
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;

    return matchesSearch && matchesEvent && matchesYear && matchesClass && matchesStatus;
  });

  const handleExecuteCancel = async () => {
    if (!confirmCancelReg || !user) return;
    setIsCancelling(true);
    try {
      await cancelRegistrationWithTransaction(
        (confirmCancelReg as any).docId || confirmCancelReg.registrationId,
        user.uid,
        isSuperCoordinator,
        confirmCancelReg.year
      );

      await recordActivity(
        'cancel_registration',
        user.uid,
        user.name,
        user.role,
        'registration',
        confirmCancelReg.registrationId,
        {
          eventName: confirmCancelReg.eventNameSnapshot,
          reason: cancelReason || 'Cancelled by coordinator',
        }
      );

      showToast('Registration Cancelled', 'Slot released and marked as cancelled.', 'info');
      setConfirmCancelReg(null);
      setCancelReason('');
      await loadRegistrationsAndSettings();
    } catch (err: any) {
      showToast('Cancellation Error', err.message || 'Failed to cancel registration.', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleExportStudents = () => {
    const filterVal = exportScope === 'event' ? exportSelectedEvent : exportScope === 'year' ? exportSelectedYear : undefined;
    if (exportFormat === 'excel') {
      exportDetailedStudentsToExcel(registrations, {
        scopeType: exportScope,
        filterValue: filterVal,
      });
      showToast('Export Generated', 'Detailed athlete spreadsheet downloaded.', 'success');
    } else {
      exportDetailedStudentsToPDF(registrations, {
        scopeType: exportScope,
        filterValue: filterVal,
        settings: settings || undefined,
      });
      showToast('Export Generated', 'Detailed athlete PDF report downloaded.', 'success');
    }
    setShowExportModal(false);
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="Registrations"
        subtitle="Manage official student event entries, participation rosters, and export verification slips"
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {isSuperCoordinator && (
              <button
                onClick={() => setShowExportModal(true)}
                className="btn btn-primary btn-sm"
                title="Export registered athletes year-wise or whole event-wise"
              >
                <Download size={14} /> Export Student Details
              </button>
            )}
            <button
              onClick={() => exportRegistrationsToExcel(filteredRegistrations, 'ATHLON26_Registrations.xlsx')}
              className="btn btn-secondary btn-sm"
              disabled={filteredRegistrations.length === 0}
            >
              <FileSpreadsheet size={14} /> Export Table (Excel)
            </button>
            <button onClick={() => window.print()} className="btn btn-ghost btn-sm">
              <Printer size={14} /> Print Roster
            </button>
          </div>
        }
      />

      {/* Filter Card */}
      <div className="filter-card">
        <div className="filter-bar">
          <div className="search-input-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search by event, student name, register no, team, or coordinator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="filter-select"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="all">All Competitions</option>
            {uniqueEventNames.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>

          {isYearCoordinator ? (
            <div
              className="badge"
              style={{
                background: 'var(--color-primary-light)',
                border: '1px solid var(--border-medium)',
                color: '#93c5fd',
                padding: '7px 12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              Year: {user?.assignedYear}
            </div>
          ) : (
            <select
              className="filter-select"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              <option value="all">All Cohorts</option>
              {uniqueYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          <select
            className="filter-select"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="all">All Classes</option>
            {uniqueClasses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="registered">Registered</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {(searchTerm || eventFilter !== 'all' || yearFilter !== 'all' || classFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setEventFilter('all');
                setYearFilter('all');
                setClassFilter('all');
                setStatusFilter('all');
              }}
              className="btn btn-ghost btn-sm"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredRegistrations.length}</strong> of {registrations.length} entries
          </div>
        </div>
      </div>

      {/* Registrations Data Table */}
      {loading ? (
        <SkeletonTable rows={6} columns={7} />
      ) : filteredRegistrations.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title="No Registrations Found"
          description="No registrations match the selected filter criteria."
          action={
            <Link to="/events" className="btn btn-primary btn-sm">
              Browse Events to Register
            </Link>
          }
        />
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Registration Ref</th>
                <th>Competition</th>
                <th>Cohort / Class</th>
                <th>Competitors</th>
                <th>Coordinator</th>
                <th>Status</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRegistrations.map((r) => {
                const date = r.createdAt?.toDate ? r.createdAt.toDate() : new Date();

                return (
                  <tr key={r.registrationId}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {r.registrationId.slice(0, 8)}
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--text-primary)' }}>{r.eventNameSnapshot}</strong>
                      {r.teamName && (
                        <div style={{ fontSize: 'var(--text-xs)', color: '#93c5fd' }}>
                          Team: {r.teamName}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                        {r.year} {r.class}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 'var(--text-xs)' }}>
                        <strong>{r.participantCount}</strong> participant(s)
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.participantsSnapshot?.map((s) => s.name).join(', ')}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {r.coordinatorName}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge status-${r.status}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          onClick={() => setViewingRegistration(r)}
                          className="btn btn-ghost btn-sm"
                          title="View Details"
                        >
                          <Eye size={13} /> Details
                        </button>
                        {r.status === 'registered' && (isSuperCoordinator || isYearCoordinator) && (
                          <Link
                            to={`/events/${r.eventId}/edit-registration/${(r as any).docId || r.registrationId}`}
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#60a5fa' }}
                            title="Edit Registration"
                          >
                            <Edit3 size={13} /> Edit
                          </Link>
                        )}
                        <button
                          onClick={() => exportSingleRegistrationPDF(r, settings || undefined)}
                          className="btn btn-ghost btn-sm"
                          title="Download Slip"
                        >
                          <FileDown size={13} />
                        </button>
                        {r.status === 'registered' && isSuperCoordinator && (
                          <button
                            onClick={() => {
                              setConfirmCancelReg(r);
                              setCancelReason('');
                            }}
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#f87171' }}
                            title="Cancel Entry"
                          >
                            <XCircle size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Registration Details Modal */}
      <Modal
        isOpen={!!viewingRegistration}
        onClose={() => setViewingRegistration(null)}
        title="Registration Entry Details"
        subtitle={`Reference ID: ${viewingRegistration?.registrationId}`}
      >
        {viewingRegistration && (
          <div>
            <div
              style={{
                background: 'var(--bg-surface-elevated)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                marginBottom: 'var(--space-4)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: 'var(--text-sm)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Event:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{viewingRegistration.eventNameSnapshot}</strong>
              </div>
              {viewingRegistration.teamName && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Team Name:</span>
                  <strong style={{ color: '#93c5fd' }}>{viewingRegistration.teamName}</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Class Scope:</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {viewingRegistration.year} {viewingRegistration.class} ({viewingRegistration.department})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Registered By:</span>
                <span style={{ color: 'var(--text-primary)' }}>{viewingRegistration.coordinatorName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                <span className={`status-badge status-${viewingRegistration.status}`}>
                  {viewingRegistration.status}
                </span>
              </div>
            </div>

            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Participants Roster ({viewingRegistration.participantCount})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto', marginBottom: 'var(--space-5)' }}>
              {viewingRegistration.participantsSnapshot?.map((s, idx) => (
                <div
                  key={s.studentId || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-surface-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>{s.name}</strong>
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>{s.registerNumber}</span>
                  </div>
                  <span className="badge" style={{ fontSize: '10px', background: 'var(--color-primary-light)', color: '#93c5fd' }}>
                    {s.year} {s.class}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
              {viewingRegistration.status === 'registered' && (isSuperCoordinator || isYearCoordinator) && (
                <Link
                  to={`/events/${viewingRegistration.eventId}/edit-registration/${(viewingRegistration as any).docId || viewingRegistration.registrationId}`}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit3 size={14} /> Edit Entry
                </Link>
              )}
              <button
                onClick={() => exportSingleRegistrationPDF(viewingRegistration, settings || undefined)}
                className="btn btn-primary btn-sm"
              >
                <FileDown size={14} /> Download PDF Slip
              </button>
              <button onClick={() => setViewingRegistration(null)} className="btn btn-secondary btn-sm">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Student Details Export Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Registered Students Roster"
        subtitle="Export detailed student athlete lists with team, category, and class details"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Scope selection */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>1. Export Scope</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                className={`btn btn-sm ${exportScope === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setExportScope('all')}
              >
                All Events &amp; Cohorts
              </button>
              <button
                type="button"
                className={`btn btn-sm ${exportScope === 'event' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setExportScope('event')}
              >
                Whole Event Wise
              </button>
              <button
                type="button"
                className={`btn btn-sm ${exportScope === 'year' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setExportScope('year')}
              >
                Year Wise (Team Wise)
              </button>
            </div>
          </div>

          {/* Conditional dropdown for Event */}
          {exportScope === 'event' && (
            <div className="form-group">
              <label className="form-label">Select Competition Event</label>
              <select
                className="form-input"
                value={exportSelectedEvent}
                onChange={(e) => setExportSelectedEvent(e.target.value)}
              >
                <option value="all">All Events</option>
                {uniqueEventNames.map((evtName) => (
                  <option key={evtName} value={evtName}>
                    {evtName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Conditional dropdown for Year */}
          {exportScope === 'year' && (
            <div className="form-group">
              <label className="form-label">Select Academic Year / Cohort</label>
              <select
                className="form-input"
                value={exportSelectedYear}
                onChange={(e) => setExportSelectedYear(e.target.value)}
              >
                <option value="all">All Academic Years</option>
                {CANONICAL_YEARS.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Format selection */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>2. File Format</label>
            <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                <input
                  type="radio"
                  name="exportFormat"
                  value="excel"
                  checked={exportFormat === 'excel'}
                  onChange={() => setExportFormat('excel')}
                />
                <span>Excel Spreadsheet (.xlsx)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                <input
                  type="radio"
                  name="exportFormat"
                  value="pdf"
                  checked={exportFormat === 'pdf'}
                  onChange={() => setExportFormat('pdf')}
                />
                <span>PDF Document (.pdf)</span>
              </label>
            </div>
          </div>

          {/* Preview Metrics Box */}
          <div style={{ padding: '12px', background: 'var(--bg-surface-elevated)', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            <strong>Selected Scope:</strong> {exportScope === 'all' ? 'All active registrations' : exportScope === 'event' ? `Event: ${exportSelectedEvent === 'all' ? 'All Events' : exportSelectedEvent}` : `Year Cohort: ${exportSelectedYear === 'all' ? 'All Years' : exportSelectedYear}`}
            <div style={{ marginTop: '4px', color: '#93c5fd' }}>
              Active Registration Entries: {filterRegistrationsForExport(registrations, exportScope, exportScope === 'event' ? exportSelectedEvent : exportScope === 'year' ? exportSelectedYear : undefined).length}
            </div>
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setShowExportModal(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExportStudents}
              className="btn btn-primary btn-sm"
            >
              <Download size={14} /> Download Export File
            </button>
          </div>
        </div>
      </Modal>

      {/* Cancel Confirmation Modal */}
      <ConfirmModal
        isOpen={!!confirmCancelReg}
        onClose={() => setConfirmCancelReg(null)}
        title="Cancel Event Registration?"
        message={`Are you sure you want to cancel registration ${confirmCancelReg?.registrationId.slice(0, 8)} for ${confirmCancelReg?.eventNameSnapshot}? The allocated slots will be released immediately.`}
        confirmText="Cancel Entry"
        type="danger"
        isLoading={isCancelling}
        onConfirm={handleExecuteCancel}
        onCancel={() => setConfirmCancelReg(null)}
      />
    </div>
  );
};
