import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  FileDown,
  Printer,
  Trophy,
  Layers,
  Users,
  Download,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getAllEvents } from '../services/eventService';
import { getAllRegistrations, getScopedRegistrations } from '../services/registrationService';
import { getCollegeSettings } from '../services/settingsService';
import {
  exportRegistrationsToExcel,
  exportRegistrationsToPDF,
  exportDetailedStudentsToExcel,
  exportDetailedStudentsToPDF,
  filterRegistrationsForExport,
} from '../services/exportService';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { EmptyState } from '../components/common/EmptyState';
import { SkeletonKpiGrid } from '../components/common/Skeleton';
import { Modal } from '../components/common/Modal';
import type { Event, Registration, CollegeSettings } from '../types';
import { normalizeAcademicYear, CANONICAL_YEARS } from '../utils/academicYear';

export const ReportsPage: React.FC = () => {
  const { user, isSuperCoordinator, isYearCoordinator } = useAuth();
  const { showToast } = useToast();

  const [events, setEvents] = useState<Event[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [settings, setSettings] = useState<CollegeSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Student details export modal state
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportScope, setExportScope] = useState<'all' | 'event' | 'year'>('all');
  const [exportSelectedEvent, setExportSelectedEvent] = useState<string>('all');
  const [exportSelectedYear, setExportSelectedYear] = useState<string>('all');
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf'>('excel');

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [evts, colSettings] = await Promise.all([
        getAllEvents(),
        getCollegeSettings(),
      ]);
      setEvents(evts);
      setSettings(colSettings);

      let regs: Registration[] = [];
      if (isYearCoordinator && user?.assignedYear) {
        regs = await getScopedRegistrations(normalizeAcademicYear(user.assignedYear));
      } else {
        regs = await getAllRegistrations();
      }
      setRegistrations(regs);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to load report data.', 'error');
    } finally {
      setLoading(false);
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

  const activeRegistrations = registrations.filter((r) => r.status === 'registered');
  const totalParticipants = activeRegistrations.reduce((acc, r) => acc + r.participantCount, 0);

  // Group by Year
  const yearBreakdown: Record<string, { regs: number; parts: number }> = {};
  activeRegistrations.forEach((r) => {
    if (!yearBreakdown[r.year]) {
      yearBreakdown[r.year] = { regs: 0, parts: 0 };
    }
    yearBreakdown[r.year].regs += 1;
    yearBreakdown[r.year].parts += r.participantCount;
  });

  // Group by Department
  const deptBreakdown: Record<string, number> = {};
  activeRegistrations.forEach((r) => {
    const dept = r.department || 'General';
    deptBreakdown[dept] = (deptBreakdown[dept] || 0) + r.participantCount;
  });

  const uniqueEventNames = Array.from(new Set(events.map((e) => e.eventName))).filter(Boolean);

  return (
    <div className="page-container">
      {/* Page Header with Export Actions */}
      <PageHeader
        title="Registration Reports &amp; Analytics"
        subtitle={
          isYearCoordinator && user?.assignedYear
            ? `Official registration metrics and analytics for Academic Year ${user.assignedYear}`
            : 'Comprehensive metrics, cohort capacity breakdown, and official sports meet export sheets'
        }
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
              onClick={() => exportRegistrationsToExcel(registrations, 'ATHLON26_Sports_Report.xlsx')}
              className="btn btn-secondary btn-sm"
              disabled={registrations.length === 0}
            >
              <FileSpreadsheet size={14} /> Export Excel (.xlsx)
            </button>
            <button
              onClick={() => exportRegistrationsToPDF(registrations, 'Annual Sports Registration Report', settings || undefined)}
              className="btn btn-secondary btn-sm"
              disabled={registrations.length === 0}
            >
              <FileDown size={14} /> Export PDF Report
            </button>
            <button onClick={() => window.print()} className="btn btn-ghost btn-sm">
              <Printer size={14} /> Print
            </button>
          </div>
        }
      />

      {/* KPI Metrics */}
      {loading ? (
        <SkeletonKpiGrid count={4} />
      ) : (
        <div className="grid-kpi">
          <StatCard
            label="Total Entries"
            value={registrations.length}
            icon={<BarChart3 size={16} />}
            subtitle={`${activeRegistrations.length} confirmed registered`}
          />
          <StatCard
            label="Total Athletes"
            value={totalParticipants}
            icon={<Users size={16} />}
            subtitle="Participating students"
          />
          <StatCard
            label="Events Configured"
            value={events.length}
            icon={<Trophy size={16} />}
            subtitle="Annual competitions"
          />
          <StatCard
            label="Cohorts Engaged"
            value={Object.keys(yearBreakdown).length}
            icon={<Layers size={16} />}
            subtitle="Academic year divisions"
          />
        </div>
      )}

      {/* Breakdown Grid: Year & Department */}
      <div className="grid-2col">
        {/* Year-wise Cohort Breakdown */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Layers size={17} color="#3b82f6" />
                Cohort Participation
              </h2>
              <p className="card-subtitle">Registration volume and athlete headcount by year</p>
            </div>
          </div>

          {Object.keys(yearBreakdown).length === 0 ? (
            <EmptyState
              icon={<Layers size={22} />}
              title="No Cohort Data Available"
              description="Participation data will aggregate here once registrations are entered."
            />
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cohort Year</th>
                    <th>Registrations</th>
                    <th>Athletes</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(yearBreakdown).map(([year, data]) => {
                    const sharePct = totalParticipants > 0
                      ? Math.round((data.parts / totalParticipants) * 100)
                      : 0;

                    return (
                      <tr key={year}>
                        <td>
                          <span className="badge badge-year" style={{ whiteSpace: 'nowrap' }}>{year}</span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{data.regs} entries</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{data.parts}</strong> athletes
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '65px' }}>
                            <div className="progress-bar-wrap" style={{ flex: 1, minWidth: '35px', maxWidth: '70px' }}>
                              <div
                                className="progress-bar-fill"
                                style={{ width: `${sharePct}%`, background: 'var(--color-primary)' }}
                              />
                            </div>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', minWidth: '28px', textAlign: 'right' }}>
                              {sharePct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Department-wise Breakdown */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Users size={17} color="#10b981" />
                Department Participation
              </h2>
              <p className="card-subtitle">Athlete headcount across college departments</p>
            </div>
          </div>

          {Object.keys(deptBreakdown).length === 0 ? (
            <EmptyState
              icon={<Users size={22} />}
              title="No Department Data"
              description="Department metrics will display once entries are recorded."
            />
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Athletes</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(deptBreakdown).map(([dept, count]) => {
                    const sharePct = totalParticipants > 0
                      ? Math.round((count / totalParticipants) * 100)
                      : 0;

                    return (
                      <tr key={dept}>
                        <td>
                          <strong style={{ color: 'var(--text-primary)', fontSize: 'var(--text-xs)' }}>
                            {dept}
                          </strong>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'var(--text-primary)' }}>{count} athletes</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '65px' }}>
                            <div className="progress-bar-wrap" style={{ flex: 1, minWidth: '35px', maxWidth: '70px' }}>
                              <div
                                className="progress-bar-fill"
                                style={{ width: `${sharePct}%`, background: 'var(--color-success)' }}
                              />
                            </div>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', minWidth: '28px', textAlign: 'right' }}>
                              {sharePct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Event Capacity Report */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Trophy size={17} color="#f59e0b" />
              Event Slot Utilization Roster
            </h2>
            <p className="card-subtitle">Real-time breakdown of event capacities and remaining slots</p>
          </div>
        </div>

        {events.length === 0 ? (
          <EmptyState
            icon={<Trophy size={24} />}
            title="No Events Found"
            description="Competition capacity metrics will appear when events are published."
          />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event Name</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Cohort Scope</th>
                  <th>Per-Year Quota</th>
                  <th>Registered</th>
                  <th>Remaining</th>
                  <th>Utilization</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => {
                  const targetYear = user?.assignedYear ? normalizeAcademicYear(user.assignedYear) : 'All Cohorts';
                  const isCoord = user?.role === 'year_coordinator';
                  const maxQuota = evt.maxParticipantsPerYear || 10;
                  
                  let registeredCount = 0;
                  if (isCoord && user?.assignedYear) {
                    const canonical = normalizeAcademicYear(user.assignedYear);
                    const yearSummary = evt.yearRegistrations?.[canonical];
                    registeredCount = yearSummary?.status === 'registered' ? yearSummary.participantCount : 0;
                  } else {
                    // For admin overview, count active registered across all years
                    registeredCount = Object.values(evt.yearRegistrations || {}).reduce(
                      (acc, curr) => curr.status === 'registered' ? acc + curr.participantCount : acc,
                      0
                    );
                  }

                  const capacityBasis = isCoord ? maxQuota : maxQuota * 4;
                  const remaining = Math.max(0, capacityBasis - registeredCount);
                  const pct = Math.min(100, Math.round((registeredCount / capacityBasis) * 100));

                  return (
                    <tr key={evt.eventId}>
                      <td><strong style={{ color: 'var(--text-primary)' }}>{evt.eventName}</strong></td>
                      <td><span className="table-cell-muted">{evt.category}</span></td>
                      <td><span style={{ textTransform: 'capitalize', fontSize: 'var(--text-xs)' }}>{evt.eventType}</span></td>
                      <td><span className="badge badge-year">{isCoord ? targetYear : 'All 4 Years'}</span></td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: 'var(--text-xs)' }}>
                          {evt.eventType === 'team'
                            ? `${evt.minParticipantsPerYear || 2}–${maxQuota} / yr`
                            : `${maxQuota} / yr`}
                        </span>
                      </td>
                      <td><strong style={{ color: registeredCount > 0 ? '#34d399' : 'var(--text-tertiary)' }}>{registeredCount}</strong></td>
                      <td>
                        <span style={{ color: remaining === 0 ? '#f87171' : 'var(--text-secondary)' }}>
                          {remaining}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '100px' }}>
                          <div className="progress-bar-wrap" style={{ flex: 1 }}>
                            <div
                              className="progress-bar-fill"
                              style={{
                                width: `${pct}%`,
                                background: pct >= 100 ? 'var(--color-danger)' : pct >= 75 ? 'var(--color-warning)' : 'var(--color-primary)',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{pct}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge status-${evt.status}`}>{evt.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                  name="exportFormatReports"
                  value="excel"
                  checked={exportFormat === 'excel'}
                  onChange={() => setExportFormat('excel')}
                />
                <span>Excel Spreadsheet (.xlsx)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                <input
                  type="radio"
                  name="exportFormatReports"
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
    </div>
  );
};
