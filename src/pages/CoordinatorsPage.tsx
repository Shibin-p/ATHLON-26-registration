import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  CalendarCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Edit2,
  Search,
  RotateCcw,
  Copy,
  Check,
  Mail,
  UserCheck,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getAllCoordinators,
  updateUserProfile,
} from '../services/userService';
import {
  createCoordinatorAccount,
  listAuthUsers,
  assignExistingCoordinator,
  type EnrichedAuthUser,
} from '../services/coordinatorApiService';
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
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  // Add / Provision Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'create' | 'existing'>('create');

  // Tab 1: Create New Coordinator State
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateConfirmPassword, setShowCreateConfirmPassword] = useState(false);
  const [createRole, setCreateRole] = useState<UserRole>('year_coordinator');
  const [createYear, setCreateYear] = useState('4TH YEAR');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicateEmailCandidate, setDuplicateEmailCandidate] = useState<string | null>(null);

  // Tab 2: Existing Firebase Auth Users State
  const [authUsers, setAuthUsers] = useState<EnrichedAuthUser[]>([]);
  const [authUsersLoading, setAuthUsersLoading] = useState(false);
  const [authUsersSearch, setAuthUsersSearch] = useState('');
  const [authUsersAssignmentFilter, setAuthUsersAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [authUsersStatusFilter, setAuthUsersStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [authNextPageToken, setAuthNextPageToken] = useState<string | null>(null);
  const [authLoadingMore, setAuthLoadingMore] = useState(false);

  // Assign Existing User Sub-View State
  const [selectedUserToAssign, setSelectedUserToAssign] = useState<EnrichedAuthUser | null>(null);
  const [assignName, setAssignName] = useState('');
  const [assignRole, setAssignRole] = useState<UserRole>('year_coordinator');
  const [assignYear, setAssignYear] = useState('4TH YEAR');
  const [isAssigning, setIsAssigning] = useState(false);

  // Edit Coordinator Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCoordinator, setEditingCoordinator] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('year_coordinator');
  const [editYear, setEditYear] = useState('4TH YEAR');
  const [editActive, setEditActive] = useState(true);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

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
        const canonicalList = Array.from(
          new Set(settings.academicStructure.years.map(normalizeAcademicYear))
        ).filter(Boolean);
        const finalYears = canonicalList.length > 0 ? canonicalList : [...CANONICAL_YEARS];
        setAcademicStructure({
          ...settings.academicStructure,
          years: finalYears,
        });
        setCreateYear(finalYears.includes('4TH YEAR') ? '4TH YEAR' : finalYears[0]);
        setAssignYear(finalYears.includes('4TH YEAR') ? '4TH YEAR' : finalYears[0]);
      }
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to load coordinators', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAuthUsersList = async (reset = true) => {
    if (reset) {
      setAuthUsersLoading(true);
      setAuthNextPageToken(null);
    } else {
      setAuthLoadingMore(true);
    }

    try {
      const result = await listAuthUsers({
        search: authUsersSearch.trim(),
        assignment: authUsersAssignmentFilter,
        status: authUsersStatusFilter,
        pageToken: reset ? undefined : (authNextPageToken || undefined),
        limit: 50,
      });

      if (reset) {
        setAuthUsers(result.users);
      } else {
        setAuthUsers((prev) => [...prev, ...result.users]);
      }
      setAuthNextPageToken(result.nextPageToken);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to load Firebase Authentication users', 'error');
    } finally {
      setAuthUsersLoading(false);
      setAuthLoadingMore(false);
    }
  };

  const handleCopyUid = (uid: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(uid);
    }
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 2000);
    showToast('Copied', 'UID copied to clipboard', 'info');
  };

  const filteredCoordinators = coordinators.filter((c) => {
    const q = (searchTerm || '').toLowerCase();
    const nameStr = (c?.name || (c as any)?.fullName || '').toLowerCase();
    const uidStr = (c?.uid || '').toLowerCase();
    const emailStr = (c?.email || '').toLowerCase();
    const yearStr = (c?.assignedYear || (c as any)?.academicYear || '').toLowerCase();

    const matchesSearch =
      nameStr.includes(q) ||
      uidStr.includes(q) ||
      emailStr.includes(q) ||
      yearStr.includes(q);

    const matchesRole = roleFilter === 'all' || c.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const handleOpenAddModal = (initialTab: 'create' | 'existing' = 'create') => {
    setModalTab(initialTab);
    setCreateName('');
    setCreateEmail('');
    setCreatePassword('');
    setCreateConfirmPassword('');
    setShowCreatePassword(false);
    setShowCreateConfirmPassword(false);
    setCreateRole('year_coordinator');
    setCreateError(null);
    setDuplicateEmailCandidate(null);
    setSelectedUserToAssign(null);

    const defaultYear = academicStructure.years.includes('4TH YEAR')
      ? '4TH YEAR'
      : academicStructure.years[0] || '4TH YEAR';
    setCreateYear(defaultYear);
    setAssignYear(defaultYear);

    setIsAddModalOpen(true);

    if (initialTab === 'existing') {
      loadAuthUsersList(true);
    }
  };

  const handleTabChange = (tab: 'create' | 'existing') => {
    setModalTab(tab);
    setCreateError(null);
    setSelectedUserToAssign(null);
    if (tab === 'existing' && authUsers.length === 0) {
      loadAuthUsersList(true);
    }
  };

  // Action: Create New Coordinator Account
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setDuplicateEmailCandidate(null);

    if (!createName.trim()) {
      setCreateError('Full Name is required.');
      return;
    }

    if (!createEmail.trim() || !createEmail.includes('@')) {
      setCreateError('Valid email address is required.');
      return;
    }

    if (!createPassword || createPassword.length < 6) {
      setCreateError('Temporary password must be at least 6 characters long.');
      return;
    }

    if (createPassword !== createConfirmPassword) {
      setCreateError('Passwords do not match. Please verify.');
      return;
    }

    if (createRole === 'year_coordinator' && !createYear) {
      setCreateError('Assigned Academic Year is required for Year Coordinators.');
      return;
    }

    setIsCreating(true);
    try {
      const response = await createCoordinatorAccount({
        fullName: createName.trim(),
        email: createEmail.trim().toLowerCase(),
        password: createPassword,
        role: createRole,
        academicYear: createRole === 'year_coordinator' ? normalizeAcademicYear(createYear) : undefined,
      });

      if (user) {
        await recordActivity(
          'create_coordinator',
          user.uid,
          user.name,
          user.role,
          'coordinator',
          response.coordinator?.uid || 'unknown',
          {
            details: `Created coordinator account & profile for ${createName.trim()} (${createRole}, ${createEmail.trim().toLowerCase()})`,
          }
        );
      }

      showToast(
        'Coordinator Created',
        `Account created successfully for ${createName.trim()}. The coordinator can now log in.`,
        'success'
      );
      setIsAddModalOpen(false);
      await loadCoordinators();
    } catch (err: any) {
      console.error('Coordinator creation error:', err);
      if (err.code === 'auth/email-already-exists' || err.status === 409) {
        setDuplicateEmailCandidate(createEmail.trim().toLowerCase());
        setCreateError(
          'An account with this email already exists in Firebase Authentication. You can switch to the "Use Existing Firebase Account" tab to assign it.'
        );
      } else {
        setCreateError(err.message || 'Failed to create coordinator account.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleSwitchToExistingDuplicate = () => {
    const emailToSearch = duplicateEmailCandidate || createEmail.trim();
    setModalTab('existing');
    setAuthUsersSearch(emailToSearch);
    setCreateError(null);
    setDuplicateEmailCandidate(null);
    setTimeout(() => {
      listAuthUsers({ search: emailToSearch, limit: 50 }).then((res) => {
        setAuthUsers(res.users);
        setAuthNextPageToken(res.nextPageToken);
      }).catch(console.error);
    }, 50);
  };

  // Action: Select user from Auth table to assign
  const handleStartAssign = (authUser: EnrichedAuthUser) => {
    setSelectedUserToAssign(authUser);
    setAssignName(authUser.displayName || authUser.email.split('@')[0] || '');
    setAssignRole('year_coordinator');
    setAssignYear(academicStructure.years.includes('4TH YEAR') ? '4TH YEAR' : academicStructure.years[0] || '4TH YEAR');
  };

  // Action: Confirm assignment of existing user
  const handleConfirmAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserToAssign) return;

    if (!assignName.trim()) {
      showToast('Validation Error', 'Full Name is required.', 'warning');
      return;
    }

    if (assignRole === 'year_coordinator' && !assignYear) {
      showToast('Validation Error', 'Assigned Academic Year is required.', 'warning');
      return;
    }

    setIsAssigning(true);
    try {
      await assignExistingCoordinator({
        uid: selectedUserToAssign.uid,
        fullName: assignName.trim(),
        role: assignRole,
        academicYear: assignRole === 'year_coordinator' ? normalizeAcademicYear(assignYear) : undefined,
      });

      if (user) {
        await recordActivity(
          'create_coordinator',
          user.uid,
          user.name,
          user.role,
          'coordinator',
          selectedUserToAssign.uid,
          {
            details: `Assigned existing Firebase user ${selectedUserToAssign.email} as ${assignRole}`,
          }
        );
      }

      showToast(
        'Coordinator Assigned',
        `Successfully linked ${assignName.trim()} to ATHLON'26 profile.`,
        'success'
      );
      setIsAddModalOpen(false);
      setSelectedUserToAssign(null);
      await loadCoordinators();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to assign coordinator profile.', 'error');
    } finally {
      setIsAssigning(false);
    }
  };

  // Action: Edit Existing Coordinator Profile
  const handleOpenEdit = (coord: UserProfile) => {
    setEditingCoordinator(coord);
    setEditName(coord.name || (coord as any).fullName || '');
    setEditRole(coord.role);
    setEditYear(normalizeAcademicYear(coord.assignedYear || (coord as any).academicYear) || academicStructure.years[0] || '4TH YEAR');
    setEditActive(coord.active);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoordinator) return;
    if (!editName.trim()) {
      showToast('Validation Error', 'Full Name is required.', 'warning');
      return;
    }

    if (editRole === 'year_coordinator' && !editYear) {
      showToast('Validation Error', 'Please select an Assigned Academic Year.', 'warning');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const finalYear = editRole === 'year_coordinator' ? normalizeAcademicYear(editYear) : undefined;
      await updateUserProfile(editingCoordinator.uid, {
        name: editName.trim(),
        role: editRole,
        assignedYear: finalYear,
        active: editActive,
      });

      if (user) {
        await recordActivity(
          'update_coordinator',
          user.uid,
          user.name,
          user.role,
          'coordinator',
          editingCoordinator.uid,
          { details: `Updated coordinator details for ${editName.trim()} (${editRole})` }
        );
      }

      showToast('Profile Updated', 'Coordinator assignment saved.', 'success');
      setIsEditModalOpen(false);
      await loadCoordinators();
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to update profile.', 'error');
    } finally {
      setIsSubmittingEdit(false);
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
          {
            details: `${newActive ? 'Activated' : 'Deactivated'} coordinator account: ${confirmToggleCoord.name}`,
          }
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
        subtitle="Provision coordinator accounts directly, manage platform permissions, and inspect Firebase users"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleOpenAddModal('existing')}
              className="btn btn-secondary btn-sm"
              title="Inspect and link registered Firebase Authentication accounts"
            >
              <UserCheck size={14} /> Authentication Users
            </button>
            <button
              onClick={() => handleOpenAddModal('create')}
              className="btn btn-primary btn-sm"
              title="Create new coordinator with email & password"
            >
              <UserPlus size={14} /> Add Coordinator
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
              placeholder="Search by coordinator name, email, UID, or assigned year..."
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

          <div
            style={{
              marginLeft: 'auto',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
            }}
          >
            Showing <strong>{filteredCoordinators.length}</strong> coordinator profiles
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
            <button onClick={() => handleOpenAddModal('create')} className="btn btn-primary btn-sm">
              <UserPlus size={14} /> Add Coordinator
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
                      <strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
                        {c.name || (c as any).fullName || 'Coordinator'}
                      </strong>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '2px',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {c.email && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Mail size={11} /> {c.email}
                          </span>
                        )}
                        <span
                          style={{
                            fontFamily: 'monospace',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                          onClick={() => handleCopyUid(c.uid)}
                          title="Click to copy Firebase UID"
                        >
                          UID: {c.uid ? `${c.uid.slice(0, 8)}...` : 'N/A'}
                          {copiedUid === c.uid ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        </span>
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
                        {c.assignedYear || (c as any).academicYear || 'Unassigned'}
                      </span>
                    ) : c.role === 'view_coordinator' ? (
                      <span className="table-cell-muted">All Years (View Only)</span>
                    ) : (
                      <span className="table-cell-muted">All Access (Full Admin)</span>
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
                        title="Edit Permissions & Assigned Year"
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

      {/* Provision / Add Coordinator Modal (Two Tabs) */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Provision Coordinator"
        subtitle="Create a new login account directly or link an existing Firebase Authentication user."
      >
        {/* Modal Tab Switcher */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid var(--border-light)',
            paddingBottom: '12px',
            marginBottom: '16px',
          }}
        >
          <button
            type="button"
            onClick={() => handleTabChange('create')}
            className={`btn btn-sm ${modalTab === 'create' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <UserPlus size={14} /> Create New Account
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('existing')}
            className={`btn btn-sm ${modalTab === 'existing' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <UserCheck size={14} /> Use Existing Firebase Account
          </button>
        </div>

        {/* TAB 1: Create New Account */}
        {modalTab === 'create' && (
          <form onSubmit={handleCreateSubmit}>
            {createError && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>{createError}</div>
                </div>
                {duplicateEmailCandidate && (
                  <button
                    type="button"
                    onClick={handleSwitchToExistingDuplicate}
                    className="btn btn-sm"
                    style={{
                      alignSelf: 'flex-start',
                      marginTop: '4px',
                      background: '#ef4444',
                      color: '#ffffff',
                      border: 'none',
                    }}
                  >
                    Switch to &ldquo;Use Existing Firebase Account&rdquo; for {duplicateEmailCandidate}
                  </button>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="e.g. Prof. Rajesh Kumar"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={isCreating}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  className="form-input"
                  placeholder="coordinator@college.edu"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  disabled={isCreating}
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                This email will be registered in Firebase Authentication and used for login.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Temporary Password *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    className="form-input"
                    placeholder="Min. 6 characters"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    disabled={isCreating}
                    style={{ paddingRight: '36px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                    title={showCreatePassword ? 'Hide password' : 'Show password'}
                  >
                    {showCreatePassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showCreateConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    className="form-input"
                    placeholder="Re-enter password"
                    value={createConfirmPassword}
                    onChange={(e) => setCreateConfirmPassword(e.target.value)}
                    disabled={isCreating}
                    style={{ paddingRight: '36px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreateConfirmPassword(!showCreateConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                    title={showCreateConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showCreateConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Access Role *</label>
              <select
                className="form-input"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as UserRole)}
                disabled={isCreating}
              >
                <option value="year_coordinator">Year Coordinator (Academic Year Event Registration)</option>
                <option value="view_coordinator">View Coordinator (Read-Only All Years & Events)</option>
                <option value="super_coordinator">Super Coordinator (Full System Administrator)</option>
              </select>
            </div>

            {createRole === 'year_coordinator' && (
              <div className="form-group">
                <label className="form-label">Assigned Academic Year *</label>
                <select
                  className="form-input"
                  value={createYear}
                  onChange={(e) => setCreateYear(e.target.value)}
                  disabled={isCreating}
                >
                  {academicStructure.years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-tertiary)',
                    marginTop: '4px',
                    display: 'block',
                  }}
                >
                  Grants full management for events, students, and registrations in this academic year.
                </span>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                marginTop: '20px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-light)',
              }}
            >
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="btn btn-secondary btn-sm"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={isCreating}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {isCreating ? (
                  <>
                    <RefreshCw size={13} className="spin-animation" /> Creating Account...
                  </>
                ) : (
                  <>
                    <UserPlus size={14} /> Create Coordinator
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: Use Existing Firebase Account */}
        {modalTab === 'existing' && (
          <div>
            {/* Sub-view: Assignment Form when a user was chosen */}
            {selectedUserToAssign ? (
              <form onSubmit={handleConfirmAssign}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedUserToAssign(null)}
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '4px 8px' }}
                  >
                    <ArrowLeft size={14} /> Back to Users List
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Assigning: {selectedUserToAssign.email}
                  </span>
                </div>

                <div
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--card-subtle)',
                    border: '1px solid var(--border-medium)',
                    marginBottom: '16px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ color: 'var(--text-secondary)' }}>
                    <strong>Firebase UID:</strong>{' '}
                    <span style={{ fontFamily: 'monospace' }}>{selectedUserToAssign.uid}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                    <strong>Email:</strong> {selectedUserToAssign.email}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={assignName}
                    onChange={(e) => setAssignName(e.target.value)}
                    disabled={isAssigning}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Access Role *</label>
                  <select
                    className="form-input"
                    value={assignRole}
                    onChange={(e) => setAssignRole(e.target.value as UserRole)}
                    disabled={isAssigning}
                  >
                    <option value="year_coordinator">
                      Year Coordinator (Academic Year Event Registration)
                    </option>
                    <option value="view_coordinator">
                      View Coordinator (Read-Only All Years & Events)
                    </option>
                    <option value="super_coordinator">
                      Super Coordinator (Full System Administrator)
                    </option>
                  </select>
                </div>

                {assignRole === 'year_coordinator' && (
                  <div className="form-group">
                    <label className="form-label">Assigned Academic Year *</label>
                    <select
                      className="form-input"
                      value={assignYear}
                      onChange={(e) => setAssignYear(e.target.value)}
                      disabled={isAssigning}
                    >
                      {academicStructure.years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    marginTop: '20px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-light)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedUserToAssign(null)}
                    className="btn btn-secondary btn-sm"
                    disabled={isAssigning}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={isAssigning}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {isAssigning ? (
                      <>
                        <RefreshCw size={13} className="spin-animation" /> Assigning Profile...
                      </>
                    ) : (
                      <>
                        <UserCheck size={14} /> Confirm Assignment
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                {/* Search & Filters */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
                    <Search
                      size={13}
                      style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-tertiary)',
                      }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search email or name..."
                      value={authUsersSearch}
                      onChange={(e) => setAuthUsersSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          loadAuthUsersList(true);
                        }
                      }}
                      style={{ paddingLeft: '30px', height: '34px', fontSize: '12px' }}
                    />
                  </div>

                  <select
                    className="form-input"
                    value={authUsersAssignmentFilter}
                    onChange={(e) => {
                      setAuthUsersAssignmentFilter(e.target.value as any);
                    }}
                    style={{ width: '130px', height: '34px', fontSize: '12px' }}
                  >
                    <option value="all">All Assignments</option>
                    <option value="unassigned">Not Assigned</option>
                    <option value="assigned">Already Assigned</option>
                  </select>

                  <select
                    className="form-input"
                    value={authUsersStatusFilter}
                    onChange={(e) => {
                      setAuthUsersStatusFilter(e.target.value as any);
                    }}
                    style={{ width: '110px', height: '34px', fontSize: '12px' }}
                  >
                    <option value="all">All Status</option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => loadAuthUsersList(true)}
                    className="btn btn-secondary btn-sm"
                    title="Refresh user list"
                    style={{ height: '34px' }}
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>

                {/* Users List / Table */}
                {authUsersLoading ? (
                  <SkeletonTable rows={5} columns={4} />
                ) : authUsers.length === 0 ? (
                  <div
                    style={{
                      padding: '24px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '13px',
                    }}
                  >
                    No Firebase Authentication users found matching your criteria.
                  </div>
                ) : (
                  <div
                    className="table-responsive"
                    style={{ maxHeight: '340px', overflowY: 'auto' }}
                  >
                    <table className="data-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>ATHLON&apos;26 Profile</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {authUsers.map((u) => (
                          <tr key={u.uid}>
                            <td>
                              <div>
                                <strong style={{ color: 'var(--text-primary)' }}>
                                  {u.displayName || (u.email ? u.email.split('@')[0] : 'User')}
                                </strong>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                                  {u.email}
                                </div>
                                <div
                                  style={{
                                    fontFamily: 'monospace',
                                    fontSize: '10px',
                                    color: 'var(--text-tertiary)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                  onClick={() => handleCopyUid(u.uid)}
                                  title="Click to copy UID"
                                >
                                  UID: {u.uid ? `${u.uid.slice(0, 8)}...` : 'N/A'}
                                  {copiedUid === u.uid ? <Check size={10} color="#34d399" /> : <Copy size={10} />}
                                </div>
                              </div>
                            </td>
                            <td>
                              {u.isAssigned && u.profile ? (
                                <div>
                                  <span
                                    className="badge"
                                    style={{
                                      background: 'rgba(52, 211, 153, 0.15)',
                                      color: '#34d399',
                                      border: '1px solid rgba(52, 211, 153, 0.3)',
                                      fontSize: '10px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Assigned: {u.profile.role ? u.profile.role.replace('_', ' ').toUpperCase() : 'COORDINATOR'}
                                  </span>
                                  {u.profile.academicYear && (
                                    <div style={{ fontSize: '10px', color: '#93c5fd', marginTop: '2px' }}>
                                      {u.profile.academicYear}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span
                                  className="badge"
                                  style={{
                                    background: 'rgba(148, 163, 184, 0.12)',
                                    color: '#94a3b8',
                                    fontSize: '10px',
                                  }}
                                >
                                  Not Assigned
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`status-badge status-${u.disabled ? 'inactive' : 'active'}`}
                                style={{ fontSize: '10px', padding: '2px 6px' }}
                              >
                                {u.disabled ? 'Disabled' : 'Enabled'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {u.isAssigned ? (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: 'var(--text-tertiary)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  <CheckCircle2 size={12} color="#34d399" /> Assigned
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleStartAssign(u)}
                                  className="btn btn-primary btn-sm"
                                  style={{ padding: '3px 8px', fontSize: '11px' }}
                                >
                                  <UserPlus size={12} /> Assign
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination Load More */}
                {authNextPageToken && (
                  <div style={{ textAlign: 'center', marginTop: '12px' }}>
                    <button
                      type="button"
                      onClick={() => loadAuthUsersList(false)}
                      disabled={authLoadingMore}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '11px' }}
                    >
                      {authLoadingMore ? 'Loading More...' : 'Load More Users'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Edit Coordinator Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Coordinator Permissions"
        subtitle={`Updating profile for ${editingCoordinator?.name || (editingCoordinator as any)?.fullName || 'Coordinator'}`}
      >
        <form onSubmit={handleSaveEdit}>
          <div className="form-group">
            <label className="form-label">Firebase Authentication UID</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                disabled
                className="form-input"
                value={editingCoordinator?.uid || ''}
                style={{ opacity: 0.6, cursor: 'not-allowed', fontFamily: 'monospace' }}
              />
              <button
                type="button"
                onClick={() => editingCoordinator && handleCopyUid(editingCoordinator.uid)}
                className="btn btn-secondary btn-sm"
                title="Copy UID"
              >
                {copiedUid === editingCoordinator?.uid ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input
              type="text"
              required
              className="form-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={isSubmittingEdit}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Access Role *</label>
            <select
              className="form-input"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as UserRole)}
              disabled={isSubmittingEdit}
            >
              <option value="year_coordinator">
                Year Coordinator (Academic Year Event Registration)
              </option>
              <option value="view_coordinator">
                View Coordinator (Read-Only All Years & Events)
              </option>
              <option value="super_coordinator">
                Super Coordinator (Full System Administrator)
              </option>
            </select>
          </div>

          {editRole === 'year_coordinator' && (
            <div className="form-group">
              <label className="form-label">Assigned Academic Year *</label>
              <select
                className="form-input"
                value={editYear}
                onChange={(e) => setEditYear(e.target.value)}
                disabled={isSubmittingEdit}
              >
                {academicStructure.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                  marginTop: '4px',
                  display: 'block',
                }}
              >
                Grants access to all classes, sections, and departments within this academic year.
              </span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-light)',
            }}
          >
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="btn btn-secondary btn-sm"
              disabled={isSubmittingEdit}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isSubmittingEdit}
            >
              {isSubmittingEdit ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Toggle Status Confirmation Modal */}
      <ConfirmModal
        isOpen={!!confirmToggleCoord}
        title={confirmToggleCoord?.active ? 'Deactivate Coordinator?' : 'Activate Coordinator?'}
        message={`Are you sure you want to ${
          confirmToggleCoord?.active ? 'deactivate' : 'activate'
        } ${confirmToggleCoord?.name || (confirmToggleCoord as any)?.fullName || 'this coordinator'}'s account? Inactive coordinators are immediately blocked from accessing the system.`}
        confirmText={confirmToggleCoord?.active ? 'Deactivate' : 'Activate'}
        type={confirmToggleCoord?.active ? 'danger' : 'info'}
        onConfirm={handleToggleStatus}
        onCancel={() => setConfirmToggleCoord(null)}
      />
    </div>
  );
};
