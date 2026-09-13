import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  CalendarCheck,
  Eye,
  CheckCircle2,
  XCircle,
  Edit2,
  Search,
  RotateCcw,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getAllCoordinators,
  createUserProfile,
  updateUserProfile,
} from '../services/userService';
import { recordActivity } from '../services/activityLogService';
import { getCollegeSettings } from '../services/settingsService';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { SkeletonTable } from '../components/common/Skeleton';
import type { UserProfile, UserRole, AcademicStructure } from '../types';

import { CANONICAL_YEARS, normalizeAcademicYear } from '../utils/academicYear';

export const CoordinatorsPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [coordinators, setCoordinators] = useState<UserProfile[]>([]);
  const [academicStructure, setAcademicStructure] = useState<AcademicStructure>({
    years: [...CANONICAL_YEARS],
    classes: [],
    departments: [],
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Add / Edit Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCoordinator, setEditingCoordinator] = useState<UserProfile | null>(null);

  // Form Fields (Email, Class, Dept removed per requirements)
  const [formUid, setFormUid] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('year_coordinator');
  const [formYear, setFormYear] = useState('4TH YEAR');
  const [formActive, setFormActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Status toggle confirmation
  const [confirmToggleCoord, setConfirmToggleCoord] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadCoordinators();
  }, []);

  const loadCoordinators = async () => {
    setLoading(true);
    try {
      const [coords, settings] = await Promise.all([
        getAllCoordinators(),
        getCollegeSettings(),
      ]);
      setCoordinators(coords);
      if (settings.academicStructure && settings.academicStructure.years.length > 0) {
        const canonicalList = Array.from(new Set(settings.academicStructure.years.map(normalizeAcademicYear))).filter(Boolean);
        const finalYears = canonicalList.length > 0 ? canonicalList : [...CANONICAL_YEARS];
        setAcademicStructure({
          ...settings.academicStructure,
          years: finalYears,
        });
        setFormYear(finalYears.includes('4TH YEAR') ? '4TH YEAR' : finalYears[0]);
      }
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to load coordinators', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredCoordinators = coordinators.filter((c) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(q) ||
      c.uid.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.assignedYear && c.assignedYear.toLowerCase().includes(q));

    const matchesRole = roleFilter === 'all' || c.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const handleOpenAdd = () => {
    setEditingCoordinator(null);
    setFormUid('');
    setFormName('');
    setFormRole('year_coordinator');
    if (academicStructure.years.length > 0) {
      setFormYear(academicStructure.years.includes('4TH YEAR') ? '4TH YEAR' : academicStructure.years[0]);
    }
    setFormActive(true);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (coord: UserProfile) => {
    setEditingCoordinator(coord);
    setFormUid(coord.uid);
    setFormName(coord.name);
    setFormRole(coord.role);
    setFormYear(normalizeAcademicYear(coord.assignedYear) || academicStructure.years[0] || '4TH YEAR');
    setFormActive(coord.active);
    setIsEditModalOpen(true);
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUid.trim() || !formName.trim()) {
      showToast('Validation Error', 'Firebase Auth UID and Full Name are required.', 'warning');
      return;
    }

    if (formRole === 'year_coordinator' && !formYear) {
      showToast('Validation Error', 'Please select an Assigned Academic Year.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const newProfile: UserProfile = {
        uid: formUid.trim(),
        name: formName.trim(),
        role: formRole,
        assignedYear: formRole === 'year_coordinator' ? normalizeAcademicYear(formYear) : undefined,
        active: formActive,
      };

      await createUserProfile(newProfile);

      if (user) {
        await recordActivity(
          'create_coordinator',
          user.uid,
          user.name,
          user.role,
          'coordinator',
          formUid.trim(),
          { details: `Provisioned coordinator profile for ${formName.trim()} (${formRole})` }
        );
      }

      showToast('Coordinator Added', `Profile created for ${formName.trim()}.`, 'success');
      setIsAddModalOpen(false);
      await loadCoordinators();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to create coordinator profile.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoordinator) return;
    if (!formName.trim()) {
      showToast('Validation Error', 'Full Name is required.', 'warning');
      return;
    }

    if (formRole === 'year_coordinator' && !formYear) {
      showToast('Validation Error', 'Please select an Assigned Academic Year.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateUserProfile(editingCoordinator.uid, {
        name: formName.trim(),
        role: formRole,
        assignedYear: formRole === 'year_coordinator' ? normalizeAcademicYear(formYear) : undefined,
        active: formActive,
      });

      if (user) {
        await recordActivity(
          'update_coordinator',
          user.uid,
          user.name,
          user.role,
          'coordinator',
          editingCoordinator.uid,
          { details: `Updated coordinator details for ${formName.trim()} (${formRole})` }
        );
      }

      showToast('Profile Updated', 'Coordinator assignment saved.', 'success');
      setIsEditModalOpen(false);
      await loadCoordinators();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to update profile.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!confirmToggleCoord) return;
    try {
      const newActive = !confirmToggleCoord.active;
      await updateUserProfile(confirmToggleCoord.uid, { active: newActive });

      if (user) {
        await recordActivity(
          'status_change',
          user.uid,
          user.name,
          user.role,
          'coordinator',
          confirmToggleCoord.uid,
          { details: `${newActive ? 'Activated' : 'Deactivated'} coordinator account: ${confirmToggleCoord.name}` }
        );
      }

      showToast(
        newActive ? 'Coordinator Activated' : 'Coordinator Deactivated',
        `${confirmToggleCoord.name} status updated.`,
        'info'
      );
      setConfirmToggleCoord(null);
      await loadCoordinators();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to toggle status.', 'error');
    }
  };

  const renderRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'super_coordinator':
        return (
          <span className="badge badge-super">
            <ShieldCheck size={11} /> SUPER COORDINATOR
          </span>
        );
      case 'year_coordinator':
        return (
          <span className="badge badge-year">
            <CalendarCheck size={11} /> YEAR COORDINATOR
          </span>
        );
      case 'view_coordinator':
        return (
          <span className="badge badge-view">
            <Eye size={11} /> VIEW COORDINATOR
          </span>
        );
      default:
        return <span className="badge">{role}</span>;
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="Coordinators"
        subtitle="Manage platform coordinator profiles, access roles, and academic year authority"
        actions={
          <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
            <UserPlus size={14} /> Add Coordinator
          </button>
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
              placeholder="Search by coordinator name, UID, or assigned year..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="filter-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="super_coordinator">Super Coordinator</option>
            <option value="year_coordinator">Year Coordinator</option>
            <option value="view_coordinator">View Coordinator</option>
          </select>

          {(searchTerm || roleFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setRoleFilter('all');
              }}
              className="btn btn-ghost btn-sm"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredCoordinators.length}</strong> coordinator accounts
          </div>
        </div>
      </div>

      {/* Coordinators Table */}
      {loading ? (
        <SkeletonTable rows={6} columns={5} />
      ) : filteredCoordinators.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title="No Coordinators Found"
          description="No coordinator accounts matched your filter criteria."
          action={
            <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
              <UserPlus size={14} /> Provision Coordinator
            </button>
          }
        />
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Coordinator</th>
                <th>Role</th>
                <th>Assigned Year</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCoordinators.map((c) => (
                <tr key={c.uid}>
                  <td>
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>{c.name}</strong>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                        {c.email ? c.email : `UID: ${c.uid.slice(0, 14)}...`}
                      </div>
                    </div>
                  </td>
                  <td>{renderRoleBadge(c.role)}</td>
                  <td>
                    {c.role === 'year_coordinator' ? (
                      <span
                        className="badge"
                        style={{
                          background: 'var(--color-primary-light)',
                          border: '1px solid var(--border-medium)',
                          color: '#93c5fd',
                          fontWeight: 600,
                        }}
                      >
                        {c.assignedYear || 'Unassigned'}
                      </span>
                    ) : c.role === 'view_coordinator' ? (
                      <span className="table-cell-muted">All Years</span>
                    ) : (
                      <span className="table-cell-muted">All Access</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge status-${c.active ? 'active' : 'inactive'}`}>
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '4px' }}>
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className="btn btn-ghost btn-sm"
                        title="Edit Permissions"
                      >
                        <Edit2 size={13} /> Edit
                      </button>
                      {c.uid !== user?.uid && (
                        <button
                          onClick={() => setConfirmToggleCoord(c)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: c.active ? '#f87171' : '#34d399' }}
                          title={c.active ? 'Deactivate' : 'Activate'}
                        >
                          {c.active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Coordinator Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Provision Coordinator Profile"
        subtitle="Associate a Firebase Authentication user UID with platform permissions."
      >
        <form onSubmit={handleSaveAdd}>
          <div className="form-group">
            <label className="form-label">Firebase Authentication UID *</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="Paste UID from Firebase Authentication"
              value={formUid}
              onChange={(e) => setFormUid(e.target.value)}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
              Create the coordinator&apos;s account in Firebase Authentication first, then paste the user&apos;s UID here.
            </span>
            <div
              style={{
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
                fontSize: '11px',
                color: 'var(--text-tertiary)',
                marginTop: '4px',
              }}
            >
              <Info size={12} />
              <span>The UID links this coordinator profile to their Firebase Authentication account.</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="e.g. Prof. Rajesh Kumar"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Access Role *</label>
            <select
              className="form-input"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as UserRole)}
            >
              <option value="year_coordinator">Year Coordinator (Academic Year Event Registration)</option>
              <option value="view_coordinator">View Coordinator (Read-Only All Years & Events)</option>
              <option value="super_coordinator">Super Coordinator (Full System Administrator)</option>
            </select>
          </div>

          {formRole === 'year_coordinator' && (
            <div className="form-group">
              <label className="form-label">Assigned Academic Year *</label>
              <select
                className="form-input"
                value={formYear}
                onChange={(e) => setFormYear(e.target.value)}
              >
                {academicStructure.years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                Grants access to all classes, sections, and departments within this academic year.
              </span>
            </div>
          )}

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
              {isSubmitting ? 'Provisioning...' : 'Provision Coordinator'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Coordinator Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Coordinator Permissions"
        subtitle={`Updating profile for ${editingCoordinator?.name}`}
      >
        <form onSubmit={handleSaveEdit}>
          <div className="form-group">
            <label className="form-label">Firebase Authentication UID</label>
            <input
              type="text"
              disabled
              className="form-input"
              value={formUid}
              style={{ opacity: 0.6, cursor: 'not-allowed', fontFamily: 'monospace' }}
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

          <div className="form-group">
            <label className="form-label">Access Role *</label>
            <select
              className="form-input"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as UserRole)}
            >
              <option value="year_coordinator">Year Coordinator (Academic Year Event Registration)</option>
              <option value="view_coordinator">View Coordinator (Read-Only All Years & Events)</option>
              <option value="super_coordinator">Super Coordinator (Full System Administrator)</option>
            </select>
          </div>

          {formRole === 'year_coordinator' && (
            <div className="form-group">
              <label className="form-label">Assigned Academic Year *</label>
              <select
                className="form-input"
                value={formYear}
                onChange={(e) => setFormYear(e.target.value)}
              >
                {academicStructure.years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                Grants access to all classes, sections, and departments within this academic year.
              </span>
            </div>
          )}

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
              {isSubmitting ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Toggle Status Confirmation Modal */}
      <ConfirmModal
        isOpen={!!confirmToggleCoord}
        title={confirmToggleCoord?.active ? 'Deactivate Coordinator?' : 'Activate Coordinator?'}
        message={`Are you sure you want to ${confirmToggleCoord?.active ? 'deactivate' : 'activate'} ${confirmToggleCoord?.name}'s account? Inactive coordinators are immediately blocked from accessing the system.`}
        confirmText={confirmToggleCoord?.active ? 'Deactivate' : 'Activate'}
        type={confirmToggleCoord?.active ? 'danger' : 'info'}
        onConfirm={handleToggleStatus}
        onCancel={() => setConfirmToggleCoord(null)}
      />
    </div>
  );
};
