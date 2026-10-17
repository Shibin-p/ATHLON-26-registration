import React, { useState, useEffect, useMemo } from 'react';
import {
  Hash,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Edit2,
  RefreshCw,
  Award,
  Eye,
  ArrowUpDown,
  Download,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getAllStudents } from '../services/studentService';
import { getAllEvents } from '../services/eventService';
import { getAllRegistrations } from '../services/registrationService';
import {
  adminCorrectChestNumber,
  backfillExistingAthleticsChestNumbers,
  isValidChestNumberForYear,
  getChestNumberPrefix,
} from '../services/chestNumberService';
import { isAthleticsEvent } from '../services/participationService';
import { PageHeader } from '../components/common/PageHeader';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { EmptyState } from '../components/common/EmptyState';
import { SkeletonTable } from '../components/common/Skeleton';
import type { Student, Event, Registration } from '../types';
import { CANONICAL_YEARS, normalizeAcademicYear } from '../utils/academicYear';
import * as XLSX from 'xlsx';

interface StudentAthleticsRow {
  student: Student;
  studentId: string;
  name: string;
  registerNumber: string;
  year: string;
  class: string;
  department: string;
  chestNumber?: string;
  athleticsCount: number;
  athleticsEvents: Array<{
    eventId: string;
    eventName: string;
    registrationId: string;
  }>;
}

export const ChestNumbersPage: React.FC = () => {
  const { user, isSuperCoordinator, isViewCoordinator } = useAuth();
  const { showToast } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned' | 'athletics_unassigned' | 'unassigned'>('all');
  const [sortBy, setSortBy] = useState<'chestNumber' | 'name' | 'registerNumber'>('chestNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Administrative Correction Modal
  const [editingRow, setEditingRow] = useState<StudentAthleticsRow | null>(null);
  const [newChestNumberInput, setNewChestNumberInput] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Backfill Modal
  const [showBackfillModal, setShowBackfillModal] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);

  // Details Modal
  const [viewingRow, setViewingRow] = useState<StudentAthleticsRow | null>(null);

  const loadData = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setLoading(true);
    else setRefreshing(true);

    try {
      const [allStudents, allEvents, allRegs] = await Promise.all([
        getAllStudents(),
        getAllEvents(),
        getAllRegistrations(),
      ]);

      setStudents(allStudents);
      setEvents(allEvents);
      setRegistrations(allRegs);
    } catch (err: any) {
      console.error('Failed to load chest number records:', err);
      showToast('Loading Error', err.message || 'Unable to load chest number data.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Map students to athletics registration summaries
  const athleticsEventIds = useMemo(() => {
    const ids = new Set<string>();
    events.forEach((e) => {
      if (isAthleticsEvent(e.category)) {
        ids.add(e.eventId);
      }
    });
    return ids;
  }, [events]);

  const rows: StudentAthleticsRow[] = useMemo(() => {
    // Index athletics registrations by participantId
    const studentToAthletics = new Map<string, Array<{ eventId: string; eventName: string; registrationId: string }>>();

    registrations.forEach((r) => {
      if (r.status === 'registered' && athleticsEventIds.has(r.eventId)) {
        (r.participantIds || []).forEach((pid) => {
          const list = studentToAthletics.get(pid) || [];
          // Avoid duplicate event entries if registered twice somehow
          if (!list.some((item) => item.eventId === r.eventId)) {
            list.push({
              eventId: r.eventId,
              eventName: r.eventNameSnapshot,
              registrationId: r.registrationId,
            });
          }
          studentToAthletics.set(pid, list);
        });
      }
    });

    return students.map((s) => {
      const canonicalYear = normalizeAcademicYear(s.year);
      const studentAthletics = studentToAthletics.get(s.studentId) || [];

      return {
        student: s,
        studentId: s.studentId,
        name: s.name,
        registerNumber: s.registerNumber,
        year: canonicalYear,
        class: s.class || '',
        department: s.department || '',
        chestNumber: s.chestNumber ? String(s.chestNumber).trim() : undefined,
        athleticsCount: studentAthletics.length,
        athleticsEvents: studentAthletics,
      };
    });
  }, [students, registrations, athleticsEventIds]);

  // Statistics
  const stats = useMemo(() => {
    let totalAssigned = 0;
    const yearCounts: Record<string, number> = {
      '1ST YEAR': 0,
      '2ND YEAR': 0,
      '3RD YEAR': 0,
      '4TH YEAR': 0,
    };
    let athleticsPendingCount = 0;

    rows.forEach((r) => {
      if (r.chestNumber) {
        totalAssigned++;
        const yr = normalizeAcademicYear(r.year);
        if (yearCounts[yr] !== undefined) {
          yearCounts[yr]++;
        }
      } else if (r.athleticsCount > 0) {
        athleticsPendingCount++;
      }
    });

    return {
      totalAssigned,
      yearCounts,
      athleticsPendingCount,
    };
  }, [rows]);

  // Filter and sort rows
  const filteredRows = useMemo(() => {
    let result = rows;

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter(
        (r) =>
          (r.chestNumber && r.chestNumber.toLowerCase().includes(q)) ||
          r.name.toLowerCase().includes(q) ||
          r.registerNumber.toLowerCase().includes(q) ||
          r.class.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q)
      );
    }

    // Year filter
    if (selectedYear !== 'all') {
      result = result.filter((r) => r.year === selectedYear);
    }

    // Assignment status filter
    if (assignmentFilter === 'assigned') {
      result = result.filter((r) => Boolean(r.chestNumber));
    } else if (assignmentFilter === 'athletics_unassigned') {
      result = result.filter((r) => !r.chestNumber && r.athleticsCount > 0);
    } else if (assignmentFilter === 'unassigned') {
      result = result.filter((r) => !r.chestNumber);
    }

    // Sort
    return result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'chestNumber') {
        // Unassigned sorted to bottom
        if (!a.chestNumber && !b.chestNumber) {
          cmp = a.name.localeCompare(b.name);
        } else if (!a.chestNumber) {
          return 1;
        } else if (!b.chestNumber) {
          return -1;
        } else {
          cmp = a.chestNumber.localeCompare(b.chestNumber, undefined, { numeric: true });
        }
      } else if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === 'registerNumber') {
        cmp = a.registerNumber.localeCompare(b.registerNumber, undefined, { numeric: true });
      }

      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [rows, searchTerm, selectedYear, assignmentFilter, sortBy, sortOrder]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  const handleOpenEdit = (row: StudentAthleticsRow) => {
    if (!isSuperCoordinator) return;
    setEditingRow(row);
    setNewChestNumberInput(row.chestNumber || '');
    setCorrectionReason('');
    setCorrectionError(null);
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow || !isSuperCoordinator || !user) return;

    const trimmed = newChestNumberInput.trim();
    if (!trimmed) {
      setCorrectionError('Chest number cannot be empty.');
      return;
    }

    if (!isValidChestNumberForYear(trimmed, editingRow.year)) {
      const prefix = getChestNumberPrefix(editingRow.year);
      setCorrectionError(
        `Invalid number for ${editingRow.year}. Must be 4 digits starting with '${prefix}' (Range: ${prefix}001 - ${prefix}999).`
      );
      return;
    }

    setIsSubmittingCorrection(true);
    setCorrectionError(null);

    try {
      await adminCorrectChestNumber({
        studentId: editingRow.studentId,
        newChestNumber: trimmed,
        userRole: user.role,
        actorUid: user.uid,
        actorName: user.name,
        reason: correctionReason.trim() || undefined,
      });

      showToast(
        'Chest Number Updated',
        `Successfully updated chest number for ${editingRow.name} to #${trimmed}.`,
        'success'
      );
      setEditingRow(null);
      await loadData(true);
    } catch (err: any) {
      console.error('Failed to correct chest number:', err);
      setCorrectionError(err.message || 'Failed to update chest number.');
    } finally {
      setIsSubmittingCorrection(false);
    }
  };

  const handleConfirmBackfill = async () => {
    if (!isSuperCoordinator || !user) return;
    setIsBackfilling(true);

    try {
      const res = await backfillExistingAthleticsChestNumbers(user.uid, user.name, user.role);
      showToast('Backfill Completed', res.message, 'success');
      setShowBackfillModal(false);
      await loadData(true);
    } catch (err: any) {
      console.error('Failed to backfill chest numbers:', err);
      showToast('Backfill Failed', err.message || 'Unable to backfill chest numbers.', 'error');
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredRows.map((r, idx) => ({
      'Sl No': idx + 1,
      'Chest Number': r.chestNumber || 'Not Assigned',
      'Student Name': r.name,
      'Register Number': r.registerNumber,
      'Academic Year': r.year,
      'Class': r.class,
      'Department': r.department,
      'Active Athletics Count': r.athleticsCount,
      'Registered Athletics Events': r.athleticsEvents.map((e) => e.eventName).join(', ') || 'None',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 24 },
      { wch: 16 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 22 },
      { wch: 45 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Chest Numbers');
    XLSX.writeFile(wb, `ATHLON26_Chest_Numbers_${Date.now()}.xlsx`);
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Athletics Chest Numbers"
        subtitle="Manage permanent four-digit athletic chest numbers across all student cohorts"
        badge={
          isViewCoordinator ? (
            <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Eye size={12} /> Read-Only Access
            </span>
          ) : (
            <span className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Award size={12} /> Super Coordinator Authority
            </span>
          )
        }
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => loadData(true)}
              className="btn btn-secondary btn-sm"
              disabled={refreshing || loading}
              title="Refresh records"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>

            <button onClick={handleExportExcel} className="btn btn-secondary btn-sm" title="Export table to Excel">
              <Download size={14} /> Export Excel
            </button>

            {isSuperCoordinator && (
              <button
                onClick={() => setShowBackfillModal(true)}
                className="btn btn-primary btn-sm"
                title="Backfill missing numbers for existing athletics participants"
              >
                <Hash size={14} /> Backfill Athletics Numbers
              </button>
            )}
          </div>
        }
      />

      {/* Cohort Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div className="stat-card">
          <div className="stat-label">Total Assigned</div>
          <div className="stat-value" style={{ color: 'var(--color-primary-light)' }}>
            {stats.totalAssigned}
          </div>
          <div className="stat-subtext">Across all academic years</div>
        </div>

        {CANONICAL_YEARS.map((yr) => {
          const prefix = getChestNumberPrefix(yr);
          return (
            <div key={yr} className="stat-card">
              <div className="stat-label">{yr}</div>
              <div className="stat-value">{stats.yearCounts[yr] || 0}</div>
              <div className="stat-subtext">Prefix: {prefix}XXX ({prefix}001 - {prefix}999)</div>
            </div>
          );
        })}

        {stats.athleticsPendingCount > 0 && (
          <div
            className="stat-card"
            style={{
              borderColor: 'rgba(245, 158, 11, 0.4)',
              background: 'rgba(245, 158, 11, 0.05)',
            }}
          >
            <div className="stat-label" style={{ color: '#fbbf24' }}>
              Pending Numbers
            </div>
            <div className="stat-value" style={{ color: '#f59e0b' }}>
              {stats.athleticsPendingCount}
            </div>
            <div className="stat-subtext">Athletics participants awaiting number</div>
          </div>
        )}
      </div>

      {/* Search & Filter Toolbar */}
      <div
        className="card"
        style={{
          padding: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)',
              }}
            />
            <input
              type="text"
              placeholder="Search by Chest No, Name, or Register No..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="form-control"
              style={{ paddingLeft: '36px' }}
            />
          </div>

          {/* Academic Year Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={14} color="var(--text-tertiary)" />
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setCurrentPage(1);
              }}
              className="form-control"
              style={{ minWidth: '150px' }}
            >
              <option value="all">All Academic Years</option>
              {CANONICAL_YEARS.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={assignmentFilter}
              onChange={(e) => {
                setAssignmentFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="form-control"
              style={{ minWidth: '180px' }}
            >
              <option value="all">All Students ({rows.length})</option>
              <option value="assigned">Assigned Chest No ({stats.totalAssigned})</option>
              <option value="athletics_unassigned">
                Athletics Participants Without Number ({stats.athleticsPendingCount})
              </option>
              <option value="unassigned">All Unassigned</option>
            </select>
          </div>

          {/* Sort By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowUpDown size={14} color="var(--text-tertiary)" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="form-control"
              style={{ minWidth: '140px' }}
            >
              <option value="chestNumber">Sort by Chest No</option>
              <option value="name">Sort by Name</option>
              <option value="registerNumber">Sort by Reg No</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="btn btn-ghost btn-sm"
              title={`Toggle sort direction (currently ${sortOrder.toUpperCase()})`}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <SkeletonTable rows={10} columns={6} />
      ) : filteredRows.length === 0 ? (
        <div className="card" style={{ padding: 'var(--space-8)' }}>
          <EmptyState
            icon={<Hash size={36} color="var(--text-tertiary)" />}
            title="No Matching Students Found"
            description="No student records match your current search and filter criteria."
            action={
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedYear('all');
                  setAssignmentFilter('all');
                }}
                className="btn btn-secondary btn-sm"
              >
                Clear Filters
              </button>
            }
          />
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Chest No.</th>
                  <th>Student Name</th>
                  <th>Register No.</th>
                  <th>Academic Year</th>
                  <th>Class / Department</th>
                  <th>Athletics Events</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((r) => {
                  const hasChest = Boolean(r.chestNumber);
                  const isAthleticsParticipant = r.athleticsCount > 0;

                  return (
                    <tr key={r.studentId}>
                      {/* Chest Number */}
                      <td>
                        {hasChest ? (
                          <span
                            className="badge badge-primary"
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '13px',
                              letterSpacing: '0.06em',
                              fontWeight: 700,
                              padding: '4px 10px',
                            }}
                          >
                            #{r.chestNumber}
                          </span>
                        ) : isAthleticsParticipant ? (
                          <span
                            className="badge badge-warning"
                            style={{
                              fontSize: '11px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                            }}
                          >
                            Not Assigned
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>—</span>
                        )}
                      </td>

                      {/* Student Name */}
                      <td>
                        <strong style={{ color: 'var(--text-primary)' }}>{r.name}</strong>
                      </td>

                      {/* Register Number */}
                      <td>
                        <span className="table-cell-muted">{r.registerNumber}</span>
                      </td>

                      {/* Year */}
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                          {r.year}
                        </span>
                      </td>

                      {/* Class & Department */}
                      <td>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                          {r.class || '—'} {r.department ? `(${r.department})` : ''}
                        </span>
                      </td>

                      {/* Registered Athletics Events */}
                      <td>
                        {r.athleticsEvents.length === 0 ? (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>None</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '320px' }}>
                            {r.athleticsEvents.map((evt) => (
                              <span
                                key={evt.eventId}
                                className="badge"
                                style={{
                                  fontSize: '10px',
                                  background: 'var(--surface-elevated)',
                                  border: '1px solid var(--border-subtle)',
                                  color: 'var(--text-primary)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {evt.eventName}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            onClick={() => setViewingRow(r)}
                            className="btn btn-ghost btn-sm"
                            title="View student athletics summary"
                          >
                            <Eye size={13} /> View
                          </button>

                          {isSuperCoordinator && (
                            <button
                              onClick={() => handleOpenEdit(r)}
                              className="btn btn-ghost btn-sm"
                              title="Administratively correct chest number"
                              style={{ color: '#93c5fd' }}
                            >
                              <Edit2 size={13} /> Edit
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

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-4)',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
              }}
            >
              <div>
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length} students
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="btn btn-ghost btn-sm"
                >
                  Previous
                </button>
                <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="btn btn-ghost btn-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Administrative Correction Modal (Super Coordinator Only) */}
      <Modal
        isOpen={Boolean(editingRow)}
        onClose={() => {
          if (!isSubmittingCorrection) {
            setEditingRow(null);
            setCorrectionError(null);
          }
        }}
        title="Administrative Chest Number Correction"
      >
        {editingRow && (
          <form onSubmit={handleSubmitCorrection}>
            <div
              style={{
                background: 'var(--surface-elevated)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--text-xs)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Student Name:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{editingRow.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Register Number:</span>
                <span style={{ color: 'var(--text-primary)' }}>{editingRow.registerNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Academic Cohort:</span>
                <span className="badge badge-neutral" style={{ fontSize: '10px' }}>{editingRow.year}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Current Assignment:</span>
                <strong style={{ color: editingRow.chestNumber ? '#34d399' : '#fbbf24' }}>
                  {editingRow.chestNumber ? `#${editingRow.chestNumber}` : 'Not Assigned'}
                </strong>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
              <label className="form-label" style={{ fontWeight: 600 }}>
                New 4-Digit Chest Number: <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                maxLength={4}
                value={newChestNumberInput}
                onChange={(e) => {
                  setNewChestNumberInput(e.target.value.replace(/\D/g, ''));
                  setCorrectionError(null);
                }}
                placeholder={`e.g. ${getChestNumberPrefix(editingRow.year)}001`}
                className="form-control"
                style={{
                  fontFamily: 'monospace',
                  fontSize: 'var(--text-base)',
                  letterSpacing: '0.1em',
                  fontWeight: 700,
                }}
                disabled={isSubmittingCorrection}
                required
              />
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                Prefix constraint: For {editingRow.year}, chest number must begin with '{getChestNumberPrefix(editingRow.year)}' and end with 001–999.
              </p>
            </div>

            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
              <label className="form-label">Correction Reason (Logged to Audit Trail):</label>
              <input
                type="text"
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="e.g. Resolving student registry conflict or typo correction"
                className="form-control"
                disabled={isSubmittingCorrection}
              />
            </div>

            {correctionError && (
              <div
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: 'var(--text-xs)',
                  marginBottom: 'var(--space-4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertCircle size={14} />
                <span>{correctionError}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setEditingRow(null);
                  setCorrectionError(null);
                }}
                className="btn btn-secondary btn-sm"
                disabled={isSubmittingCorrection}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={isSubmittingCorrection || !newChestNumberInput.trim()}
              >
                {isSubmittingCorrection ? 'Saving...' : 'Confirm Correction'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Backfill Confirm Modal */}
      <ConfirmModal
        isOpen={showBackfillModal}
        onClose={() => setShowBackfillModal(false)}
        title="Backfill Athletics Chest Numbers?"
        message={`This will scan all registered athletics events and safely assign unique 4-digit chest numbers (${getChestNumberPrefix('1ST YEAR')}XXX, ${getChestNumberPrefix('2ND YEAR')}XXX, ${getChestNumberPrefix('3RD YEAR')}XXX, ${getChestNumberPrefix('4TH YEAR')}XXX) to any participating students who currently lack one. Existing numbers are preserved.`}
        confirmText={isBackfilling ? 'Backfilling...' : 'Run Backfill'}
        type="warning"
        onConfirm={handleConfirmBackfill}
        onCancel={() => setShowBackfillModal(false)}
      />

      {/* View Student Athletics Summary Modal */}
      <Modal
        isOpen={Boolean(viewingRow)}
        onClose={() => setViewingRow(null)}
        title="Student Athletics Profile"
      >
        {viewingRow && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                background: 'var(--surface-elevated)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: viewingRow.chestNumber ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: viewingRow.chestNumber ? '#60a5fa' : 'var(--text-tertiary)',
                  fontWeight: 700,
                  fontSize: '18px',
                }}
              >
                <Hash size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {viewingRow.name}
                </h3>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {viewingRow.registerNumber} • {viewingRow.year} • {viewingRow.class} ({viewingRow.department})
                </p>
              </div>
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Chest Number Assignment:
              </div>
              {viewingRow.chestNumber ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    className="badge badge-primary"
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '15px',
                      padding: '6px 14px',
                      fontWeight: 700,
                    }}
                  >
                    #{viewingRow.chestNumber}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={13} /> Active & Permanent
                  </span>
                </div>
              ) : (
                <span
                  className="badge badge-warning"
                  style={{
                    fontSize: '12px',
                    padding: '4px 10px',
                  }}
                >
                  Not Assigned Yet
                </span>
              )}
            </div>

            <div>
              <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Active Athletics Registrations ({viewingRow.athleticsCount}):
              </h4>
              {viewingRow.athleticsEvents.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  This student has not yet been registered for any Athletics events. (Chest numbers are automatically generated upon their first Athletics registration).
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {viewingRow.athleticsEvents.map((evt, idx) => (
                    <div
                      key={evt.eventId || idx}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--surface-elevated)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{evt.eventName}</span>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>{evt.registrationId}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
              <button onClick={() => setViewingRow(null)} className="btn btn-secondary btn-sm">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
