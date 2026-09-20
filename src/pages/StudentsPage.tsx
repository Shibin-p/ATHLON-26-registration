import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Search,
  UserPlus,
  FileSpreadsheet,
  Edit2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getAllStudents,
  getStudentsByYear,
  addStudent,
  updateStudent,
  toggleStudentStatus,
  deleteStudent,
  checkStudentRegistrations,
} from '../services/studentService';
import { recordActivity } from '../services/activityLogService';
import { getCollegeSettings } from '../services/settingsService';
import { getAllEvents } from '../services/eventService';
import { getAllRegistrations, getScopedRegistrations } from '../services/registrationService';
import {
  calculateParticipationFromRegistrations,
  getParticipationLimits,
} from '../services/participationService';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { SkeletonTable } from '../components/common/Skeleton';
import type { Student, AcademicStructure, CollegeSettings } from '../types';
import { CANONICAL_YEARS, normalizeAcademicYear, isSameAcademicYear } from '../utils/academicYear';
import { sortStudentsByName, sortStudentsByRegisterNumber } from '../utils/studentSort';

export const StudentsPage: React.FC = () => {
  const { user, isSuperCoordinator, isYearCoordinator } = useAuth();
  const { showToast } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [academicStructure, setAcademicStructure] = useState<AcademicStructure>({
    years: [...CANONICAL_YEARS],
    classes: [],
    departments: [],
  });
  const [settings, setSettings] = useState<CollegeSettings | null>(null);
  const [participationMap, setParticipationMap] = useState<Record<string, { games: number; athletics: number }>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState(
    isYearCoordinator && user?.assignedYear ? normalizeAcademicYear(user.assignedYear) : ''
  );
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Add / Edit Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Form fields
  const [formRegNo, setFormRegNo] = useState('');
  const [formName, setFormName] = useState('');
  const [formYear, setFormYear] = useState('4TH YEAR');
  const [formClass, setFormClass] = useState('S7 CSE');
  const [formDept, setFormDept] = useState('CSE');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deactivate/Activate Confirm Modal
  const [confirmToggleStudent, setConfirmToggleStudent] = useState<Student | null>(null);

  // Safe Delete Modal State (Super Coordinator Only)
  const [deleteCandidate, setDeleteCandidate] = useState<Student | null>(null);
  const [deleteHasRegistrations, setDeleteHasRegistrations] = useState<boolean>(false);
  const [deleteRegistrationCount, setDeleteRegistrationCount] = useState<number>(0);
  const [isCheckingRegistrations, setIsCheckingRegistrations] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Global Sorting Option: Default Name (A-Z) vs Register Number
  const [sortBy, setSortBy] = useState<'name' | 'registerNumber'>('name');

  useEffect(() => {
    loadStudentsAndStructure();
  }, [user]);

  const loadStudentsAndStructure = async () => {
    setLoading(true);
    try {
      const canonicalAssigned = normalizeAcademicYear(user?.assignedYear);
      const studentPromise = isYearCoordinator && canonicalAssigned
        ? getStudentsByYear(canonicalAssigned)
        : getAllStudents();

      const regsPromise = isYearCoordinator && canonicalAssigned
        ? getScopedRegistrations(canonicalAssigned)
        : getAllRegistrations();

      const [studs, colSettings, allEventsList, allRegsList] = await Promise.all([
        studentPromise,
        getCollegeSettings(),
        getAllEvents(),
        regsPromise,
      ]);

      setStudents(studs);
      setSettings(colSettings);

      const eventsMap = new Map(allEventsList.map((e) => [e.eventId, e]));
      const pMap = calculateParticipationFromRegistrations(allRegsList, eventsMap);
      setParticipationMap(pMap);

      if (isYearCoordinator && canonicalAssigned) {
        setSelectedYear(canonicalAssigned);
      }

      if (colSettings.academicStructure) {
        const canonicalList = Array.from(
          new Set(colSettings.academicStructure.years.map(normalizeAcademicYear))
        ).filter(Boolean);
        const finalYears = canonicalList.length > 0 ? canonicalList : [...CANONICAL_YEARS];

        setAcademicStructure({
          ...colSettings.academicStructure,
          years: finalYears,
        });

        if (finalYears.length > 0) {
          setFormYear(finalYears.includes('4TH YEAR') ? '4TH YEAR' : finalYears[0]);
        }
        if (colSettings.academicStructure.classes.length > 0) {
          setFormClass(colSettings.academicStructure.classes[0].name);
        }
        if (colSettings.academicStructure.departments.length > 0) {
          setFormDept(colSettings.academicStructure.departments[0]);
        }
      }
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to load student data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Distinct classes belonging to the active year population (convenience filter inside scope)
  const availableClasses = useMemo(() => {
    const classesSet = new Set<string>();
    students.forEach((s) => {
      if (s.class && (!selectedYear || isSameAcademicYear(s.year, selectedYear))) {
        classesSet.add(s.class);
      }
    });
    // If students haven't loaded yet or set is empty, fallback to settings matching selectedYear
    if (classesSet.size === 0 && academicStructure.classes.length > 0) {
      academicStructure.classes.forEach((c) => {
        if (!selectedYear || isSameAcademicYear(c.year, selectedYear)) {
          classesSet.add(c.name);
        }
      });
    }
    return Array.from(classesSet).sort();
  }, [students, selectedYear, academicStructure.classes]);

  // Distinct departments belonging to the active year population (convenience filter inside scope)
  const availableDepartments = useMemo(() => {
    const deptsSet = new Set<string>();
    students.forEach((s) => {
      if (s.department && (!selectedYear || isSameAcademicYear(s.year, selectedYear))) {
        deptsSet.add(s.department);
      }
    });
    if (deptsSet.size === 0 && academicStructure.departments.length > 0) {
      academicStructure.departments.forEach((d) => deptsSet.add(d));
    }
    return Array.from(deptsSet).sort();
  }, [students, selectedYear, academicStructure.departments]);

  // Filter and sort students (Deterministic sorting)
  const filteredStudents = useMemo(() => {
    const list = students.filter((s) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        s.name.toLowerCase().includes(q) ||
        s.registerNumber.toLowerCase().includes(q);
      const matchesYear = !selectedYear || isSameAcademicYear(s.year, selectedYear);
      const matchesClass = !selectedClass || s.class === selectedClass;
      const matchesDept = !selectedDept || s.department === selectedDept;
      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'active' ? s.active : !s.active);

      return matchesSearch && matchesYear && matchesClass && matchesDept && matchesStatus;
    });

    if (sortBy === 'registerNumber') {
      return sortStudentsByRegisterNumber(list);
    }
    return sortStudentsByName(list);
  }, [students, searchTerm, selectedYear, selectedClass, selectedDept, selectedStatus, sortBy]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedYear(isYearCoordinator ? normalizeAcademicYear(user?.assignedYear) : '');
    setSelectedClass('');
    setSelectedDept('');
    setSelectedStatus('all');
    setSortBy('name');
    setCurrentPage(1);
  };

  const handleOpenAdd = () => {
    setFormRegNo('');
    setFormName('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormRegNo(student.registerNumber);
    setFormName(student.name);
    setFormYear(student.year);
    setFormClass(student.class);
    setFormDept(student.department);
    setIsEditModalOpen(true);
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRegNo.trim() || !formName.trim()) {
      showToast('Validation Error', 'Register Number and Full Name are required.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const newStudent = await addStudent(
        {
          registerNumber: formRegNo.trim().toUpperCase(),
          name: formName.trim(),
          year: formYear,
          class: formClass,
          department: formDept,
          active: true,
        },
        user?.uid || ''
      );

      if (user) {
        await recordActivity(
          'create_student',
          user.uid,
          user.name,
          user.role,
          'student',
          newStudent.studentId,
          { details: `Added student ${formName.trim()} (${formRegNo.trim().toUpperCase()})` }
        );
      }

      showToast('Student Added', `${formName.trim()} successfully registered in database.`, 'success');
      setIsAddModalOpen(false);
      await loadStudentsAndStructure();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to add student.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    if (!formRegNo.trim() || !formName.trim()) {
      showToast('Validation Error', 'Register Number and Full Name are required.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateStudent(
        editingStudent.studentId,
        {
          registerNumber: formRegNo.trim().toUpperCase(),
          name: formName.trim(),
          year: formYear,
          class: formClass,
          department: formDept,
        },
        user?.uid || ''
      );

      if (user) {
        await recordActivity(
          'update_student',
          user.uid,
          user.name,
          user.role,
          'student',
          editingStudent.studentId,
          { details: `Updated student record: ${formName.trim()} (${formRegNo.trim().toUpperCase()})` }
        );
      }

      showToast('Student Updated', 'Record successfully saved.', 'success');
      setIsEditModalOpen(false);
      await loadStudentsAndStructure();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to update student.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!confirmToggleStudent) return;
    try {
      const newStatus = !confirmToggleStudent.active;
      await toggleStudentStatus(confirmToggleStudent.studentId, newStatus, user?.uid || '');

      if (user) {
        await recordActivity(
          'status_change',
          user.uid,
          user.name,
          user.role,
          'student',
          confirmToggleStudent.studentId,
          { details: `${newStatus ? 'Activated' : 'Deactivated'} student: ${confirmToggleStudent.name}` }
        );
      }

      showToast(
        newStatus ? 'Student Activated' : 'Student Deactivated',
        `${confirmToggleStudent.name} status updated.`,
        'info'
      );
      setConfirmToggleStudent(null);
      await loadStudentsAndStructure();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to update student status.', 'error');
    }
  };

  const handleInitiateDelete = async (student: Student) => {
    setIsCheckingRegistrations(true);
    try {
      const existingRegs = await checkStudentRegistrations(student.studentId);
      setDeleteCandidate(student);
      setDeleteHasRegistrations(existingRegs.length > 0);
      setDeleteRegistrationCount(existingRegs.length);
    } catch (err: any) {
      showToast('Inspection Error', err.message || 'Failed to verify existing registrations.', 'error');
    } finally {
      setIsCheckingRegistrations(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidate || !user) return;
    setIsDeleting(true);
    try {
      if (deleteHasRegistrations) {
        // Safe strategy: Deactivate student to preserve historical registration records
        await toggleStudentStatus(deleteCandidate.studentId, false, user.uid);

        await recordActivity(
          'STUDENT_DEACTIVATED',
          user.uid,
          user.name,
          user.role,
          'student',
          deleteCandidate.studentId,
          {
            studentName: deleteCandidate.name,
            registerNumber: deleteCandidate.registerNumber,
            studentId: deleteCandidate.studentId,
            class: deleteCandidate.class,
            academicYear: deleteCandidate.year,
            details: `Deactivated student with ${deleteRegistrationCount} historical event registration(s): ${deleteCandidate.name} (${deleteCandidate.registerNumber})`,
          }
        );

        showToast(
          'Student Deactivated',
          `${deleteCandidate.name} has been deactivated to preserve event registration history.`,
          'info'
        );

        // Reactive local update
        setStudents((prev) =>
          prev.map((s) => (s.studentId === deleteCandidate.studentId ? { ...s, active: false } : s))
        );
      } else {
        // Safe to permanently delete from database
        await deleteStudent(deleteCandidate.studentId);

        await recordActivity(
          'STUDENT_DELETED',
          user.uid,
          user.name,
          user.role,
          'student',
          deleteCandidate.studentId,
          {
            studentName: deleteCandidate.name,
            registerNumber: deleteCandidate.registerNumber,
            studentId: deleteCandidate.studentId,
            class: deleteCandidate.class,
            academicYear: deleteCandidate.year,
            details: `Permanently removed student: ${deleteCandidate.name} (${deleteCandidate.registerNumber}) from ${deleteCandidate.year} ${deleteCandidate.class}`,
          }
        );

        showToast(
          'Student Deleted',
          `${deleteCandidate.name} (${deleteCandidate.registerNumber}) was removed from the database.`,
          'success'
        );

        // Reactive local update
        setStudents((prev) => prev.filter((s) => s.studentId !== deleteCandidate.studentId));
      }
      setDeleteCandidate(null);
    } catch (err: any) {
      showToast('Delete Error', err.message || 'Failed to process student deletion.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title={isYearCoordinator && user?.assignedYear ? `${user.assignedYear} Students` : 'Students'}
        subtitle={
          isYearCoordinator && user?.assignedYear
            ? `Academic Year ${user.assignedYear} student roster — view and filter eligible athletes across all classes and departments`
            : 'Maintain college master student roster, cohort assignments, and eligibility for athletic events'
        }
        actions={
          isSuperCoordinator ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
                <UserPlus size={14} /> Add Student
              </button>
              <Link to="/students/import" className="btn btn-secondary btn-sm">
                <FileSpreadsheet size={14} /> Import Excel
              </Link>
            </div>
          ) : undefined
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
              placeholder="Search by student name or register no..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

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
              Academic Year: {user?.assignedYear}
            </div>
          ) : (
            <select
              className="filter-select"
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Cohorts</option>
              {academicStructure.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          <select
            className="filter-select"
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">All Classes</option>
            {availableClasses.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">All Departments</option>
            {availableDepartments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value as any);
              setCurrentPage(1);
            }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          <select
            className="filter-select"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as any);
              setCurrentPage(1);
            }}
            title="Order student list"
          >
            <option value="name">Sort: Name (A–Z)</option>
            <option value="registerNumber">Sort: Register No</option>
          </select>

          {(searchTerm || selectedYear || selectedClass || selectedDept || selectedStatus !== 'all' || sortBy !== 'name') && (
            <button onClick={resetFilters} className="btn btn-ghost btn-sm">
              <RotateCcw size={13} /> Reset
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredStudents.length}</strong> total records
          </div>
        </div>
      </div>

      {/* Student Data Table */}
      {loading ? (
        <SkeletonTable rows={8} columns={6} />
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title="No Students Found"
          description="No student records match the specified search or filter criteria."
          action={
            isSuperCoordinator ? (
              <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
                <UserPlus size={14} /> Add First Student
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Register No</th>
                  <th>Student Name</th>
                  <th>Cohort</th>
                  <th>Class</th>
                  <th>Department</th>
                  <th>Participation</th>
                  <th>Status</th>
                  {isSuperCoordinator && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedStudents.map((st) => {
                  const limits = getParticipationLimits(settings);
                  const usage = participationMap[st.studentId] || { games: 0, athletics: 0 };
                  const gamesLeft = Math.max(0, limits.gamesLimit - usage.games);
                  const athleticsLeft = Math.max(0, limits.athleticsLimit - usage.athletics);

                  return (
                    <tr key={st.studentId}>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--text-xs)' }}>
                          {st.registerNumber}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: 'var(--text-primary)' }}>{st.name}</strong>
                      </td>
                      <td>
                        <span className="badge" style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                          {st.year}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>{st.class}</span>
                      </td>
                      <td>
                        <span className="table-cell-muted">{st.department}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: 'var(--text-xs)' }}>
                          <span style={{ whiteSpace: 'nowrap' }}>
                            Games: <strong style={{ color: usage.games >= limits.gamesLimit ? '#f87171' : usage.games > 0 ? '#60a5fa' : 'var(--text-secondary)' }}>{usage.games}/{limits.gamesLimit}</strong>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginLeft: '4px' }}>({gamesLeft} left)</span>
                          </span>
                          <span style={{ whiteSpace: 'nowrap' }}>
                            Athletics: <strong style={{ color: usage.athletics >= limits.athleticsLimit ? '#f87171' : usage.athletics > 0 ? '#34d399' : 'var(--text-secondary)' }}>{usage.athletics}/{limits.athleticsLimit}</strong>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginLeft: '4px' }}>({athleticsLeft} left)</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge status-${st.active ? 'active' : 'inactive'}`}>
                          {st.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    {isSuperCoordinator && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => handleOpenEdit(st)}
                            className="btn btn-ghost btn-sm"
                            title="Edit Student"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmToggleStudent(st)}
                            className="btn btn-ghost btn-sm"
                            title={st.active ? 'Deactivate' : 'Activate'}
                            style={{ color: st.active ? '#f87171' : '#34d399' }}
                          >
                            {st.active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                          </button>
                          <button
                            onClick={() => handleInitiateDelete(st)}
                            className="btn btn-ghost btn-sm"
                            title="Delete Student"
                            style={{ color: '#f87171' }}
                            disabled={isCheckingRegistrations}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>

          {/* Compact Pagination Bar */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 'var(--space-4)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
              }}
            >
              <span>
                Page <strong>{currentPage}</strong> of {totalPages} ({filteredStudents.length} students)
              </span>

              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '0.25rem 0.5rem' }}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '0.25rem 0.5rem' }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Student Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Student"
        subtitle="Enter student register number and academic assignment."
      >
        <form onSubmit={handleSaveAdd}>
          <div className="form-group">
            <label className="form-label">Register Number *</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="e.g. 21CS045"
              value={formRegNo}
              onChange={(e) => setFormRegNo(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="e.g. Arjun Ramanathan"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Cohort Year *</label>
              <select
                className="form-input"
                value={formYear}
                onChange={(e) => setFormYear(e.target.value)}
              >
                {academicStructure.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Class Section *</label>
              <select
                className="form-input"
                value={formClass}
                onChange={(e) => setFormClass(e.target.value)}
              >
                {academicStructure.classes.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Department *</label>
            <select
              className="form-input"
              value={formDept}
              onChange={(e) => setFormDept(e.target.value)}
            >
              {academicStructure.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary btn-sm"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Add Student'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Student Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Student Record"
        subtitle={`Updating profile for ${editingStudent?.name}`}
      >
        {editingStudent && (
          <div
            style={{
              marginBottom: '16px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: 'var(--text-xs)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              ATHLON'26 Participation Usage:
            </div>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <span>
                Games: <strong style={{ color: (participationMap[editingStudent.studentId]?.games || 0) >= (settings?.gamesLimit ?? 6) ? '#f87171' : '#60a5fa' }}>
                  {participationMap[editingStudent.studentId]?.games || 0}/{settings?.gamesLimit ?? 6}
                </strong> ({Math.max(0, (settings?.gamesLimit ?? 6) - (participationMap[editingStudent.studentId]?.games || 0))} left)
              </span>
              <span>
                Athletics: <strong style={{ color: (participationMap[editingStudent.studentId]?.athletics || 0) >= (settings?.athleticsLimit ?? 3) ? '#f87171' : '#34d399' }}>
                  {participationMap[editingStudent.studentId]?.athletics || 0}/{settings?.athleticsLimit ?? 3}
                </strong> ({Math.max(0, (settings?.athleticsLimit ?? 3) - (participationMap[editingStudent.studentId]?.athletics || 0))} left)
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveEdit}>
          <div className="form-group">
            <label className="form-label">Register Number *</label>
            <input
              type="text"
              required
              className="form-input"
              value={formRegNo}
              onChange={(e) => setFormRegNo(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input
              type="text"
              required
              className="form-input"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Cohort Year *</label>
              <select
                className="form-input"
                value={formYear}
                onChange={(e) => setFormYear(e.target.value)}
              >
                {academicStructure.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Class Section *</label>
              <select
                className="form-input"
                value={formClass}
                onChange={(e) => setFormClass(e.target.value)}
              >
                {academicStructure.classes.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Department *</label>
            <select
              className="form-input"
              value={formDept}
              onChange={(e) => setFormDept(e.target.value)}
            >
              {academicStructure.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="btn btn-secondary btn-sm"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Record'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Activate/Deactivate Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmToggleStudent}
        title={confirmToggleStudent?.active ? 'Deactivate Student?' : 'Activate Student?'}
        message={`Are you sure you want to ${confirmToggleStudent?.active ? 'deactivate' : 'activate'} ${confirmToggleStudent?.name}? Inactive students cannot be selected for competition entries.`}
        confirmText={confirmToggleStudent?.active ? 'Deactivate' : 'Activate'}
        type={confirmToggleStudent?.active ? 'danger' : 'info'}
        onConfirm={handleToggleStatus}
        onCancel={() => setConfirmToggleStudent(null)}
      />

      {/* Safe Delete / Deactivate Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteCandidate}
        title={deleteHasRegistrations ? 'Student Has Existing Event Registrations' : 'Delete Student?'}
        message={
          deleteHasRegistrations ? (
            <div>
              <p style={{ marginBottom: '8px', color: '#fbbf24', fontWeight: 600 }}>
                This student is referenced by {deleteRegistrationCount} existing registration record(s).
              </p>
              <div
                style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 12px',
                  marginBottom: '10px',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <div><strong>Name:</strong> {deleteCandidate?.name}</div>
                <div><strong>Register Number:</strong> {deleteCandidate?.registerNumber}</div>
                <div><strong>Cohort / Class:</strong> {deleteCandidate?.year} {deleteCandidate?.class} ({deleteCandidate?.department})</div>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                This student is referenced by existing registration records. Deactivating the student will preserve historical registration data.
              </p>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: '8px' }}>
                Are you sure you want to delete:
              </p>
              <div
                style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 12px',
                  marginBottom: '10px',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <div><strong>Name:</strong> {deleteCandidate?.name}</div>
                <div><strong>Register Number:</strong> {deleteCandidate?.registerNumber}</div>
                <div><strong>Cohort / Class:</strong> {deleteCandidate?.year} {deleteCandidate?.class} ({deleteCandidate?.department})</div>
              </div>
              <p style={{ color: '#f87171', fontSize: 'var(--text-xs)', fontWeight: 500 }}>
                This action will remove the student from the student database.
              </p>
            </div>
          )
        }
        confirmText={deleteHasRegistrations ? 'Deactivate Student' : 'Delete Student'}
        cancelText="Cancel"
        type={deleteHasRegistrations ? 'warning' : 'danger'}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteCandidate(null)}
      />
    </div>
  );
};
