import React, { useState, useEffect } from 'react';
import {
  Building,
  Layers,
  Save,
  Plus,
  Trash2,
  Trophy,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getCollegeSettings,
  updateCollegeSettings,
} from '../services/settingsService';
import { recordActivity } from '../services/activityLogService';
import { PageHeader } from '../components/common/PageHeader';
import type { AcademicStructure } from '../types';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // General Form
  const [collegeName, setCollegeName] = useState('');
  const [sportsEventName, setSportsEventName] = useState("ATHLON'26");
  const [sportsYear, setSportsYear] = useState('2026');
  const [academicYear, setAcademicYear] = useState('2025-2026');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Academic Structure Form
  const [academicStructure, setAcademicStructure] = useState<AcademicStructure>({
    years: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
    classes: [],
    departments: [],
  });

  // Participation Limits Form
  const [gamesLimit, setGamesLimit] = useState<number>(6);
  const [athleticsLimit, setAthleticsLimit] = useState<number>(3);
  const [initialGamesLimit, setInitialGamesLimit] = useState<number>(6);
  const [initialAthleticsLimit, setInitialAthleticsLimit] = useState<number>(3);
  const [isSavingLimits, setIsSavingLimits] = useState<boolean>(false);

  // Inputs for adding items
  const [newYearInput, setNewYearInput] = useState('');
  const [newDeptInput, setNewDeptInput] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassYear, setNewClassYear] = useState('S1');
  const [newClassDept, setNewClassDept] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getCollegeSettings();
      setCollegeName(data.collegeName);
      setSportsEventName(data.sportsEventName);
      setSportsYear(data.sportsYear);
      setAcademicYear(data.academicYear);
      setContactEmail(data.contactEmail || '');
      setContactPhone(data.contactPhone || '');
      const gLimit = typeof data.gamesLimit === 'number' ? data.gamesLimit : 6;
      const aLimit = typeof data.athleticsLimit === 'number' ? data.athleticsLimit : 3;
      setGamesLimit(gLimit);
      setAthleticsLimit(aLimit);
      setInitialGamesLimit(gLimit);
      setInitialAthleticsLimit(aLimit);
      if (data.academicStructure) {
        setAcademicStructure(data.academicStructure);
        if (data.academicStructure.years.length > 0) {
          setNewClassYear(data.academicStructure.years[0]);
        }
        if (data.academicStructure.departments.length > 0) {
          setNewClassDept(data.academicStructure.departments[0]);
        }
      }
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to fetch settings.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    try {
      await updateCollegeSettings(
        {
          collegeName: collegeName.trim(),
          sportsEventName: sportsEventName.trim(),
          sportsYear: sportsYear.trim(),
          academicYear: academicYear.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
        },
        user.uid
      );

      await recordActivity(
        'update_settings',
        user.uid,
        user.name,
        user.role,
        'settings',
        'college',
        { details: 'Updated institution profile and contact details' }
      );

      showToast('Settings Saved', 'Institution configuration successfully updated.', 'success');
    } catch (err: any) {
      showToast('Save Error', err.message || 'Failed to save settings.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAcademic = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateCollegeSettings({ academicStructure }, user.uid);

      await recordActivity(
        'update_settings',
        user.uid,
        user.name,
        user.role,
        'settings',
        'college',
        { details: 'Updated academic cohort structure and department branches' }
      );

      showToast('Academic Structure Saved', 'Cohorts and class sections updated.', 'success');
    } catch (err: any) {
      showToast('Save Error', err.message || 'Failed to update academic structure.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const gLimit = Math.max(1, Math.floor(Number(gamesLimit) || 6));
    const aLimit = Math.max(1, Math.floor(Number(athleticsLimit) || 3));
    setIsSavingLimits(true);
    try {
      await updateCollegeSettings(
        {
          gamesLimit: gLimit,
          athleticsLimit: aLimit,
        },
        user.uid
      );

      await recordActivity(
        'PARTICIPATION_LIMITS_UPDATED' as any,
        user.uid,
        user.name,
        user.role,
        'settings',
        'college',
        {
          details: `Updated participation limits: Games = ${gLimit} (was ${initialGamesLimit}), Athletics = ${aLimit} (was ${initialAthleticsLimit})`,
          gamesLimit: gLimit,
          athleticsLimit: aLimit,
          previousGamesLimit: initialGamesLimit,
          previousAthleticsLimit: initialAthleticsLimit,
        }
      );

      setGamesLimit(gLimit);
      setAthleticsLimit(aLimit);
      setInitialGamesLimit(gLimit);
      setInitialAthleticsLimit(aLimit);

      showToast('Limits Saved', 'Participation limits successfully updated.', 'success');
    } catch (err: any) {
      showToast('Save Error', err.message || 'Failed to update participation limits.', 'error');
    } finally {
      setIsSavingLimits(false);
    }
  };

  // Add Cohort Year
  const handleAddYear = () => {
    if (!newYearInput.trim()) return;
    const y = newYearInput.trim().toUpperCase();
    if (academicStructure.years.includes(y)) {
      showToast('Duplicate Year', 'This cohort year is already configured.', 'warning');
      return;
    }
    setAcademicStructure((prev) => ({
      ...prev,
      years: [...prev.years, y],
    }));
    setNewYearInput('');
  };

  // Remove Cohort Year
  const handleRemoveYear = (yearToRemove: string) => {
    setAcademicStructure((prev) => ({
      ...prev,
      years: prev.years.filter((y) => y !== yearToRemove),
      classes: prev.classes.filter((c) => c.year !== yearToRemove),
    }));
  };

  // Add Department
  const handleAddDept = () => {
    if (!newDeptInput.trim()) return;
    const d = newDeptInput.trim();
    if (academicStructure.departments.includes(d)) {
      showToast('Duplicate Department', 'This department is already configured.', 'warning');
      return;
    }
    setAcademicStructure((prev) => ({
      ...prev,
      departments: [...prev.departments, d],
    }));
    setNewDeptInput('');
  };

  // Remove Department
  const handleRemoveDept = (deptToRemove: string) => {
    setAcademicStructure((prev) => ({
      ...prev,
      departments: prev.departments.filter((d) => d !== deptToRemove),
    }));
  };

  // Add Class
  const handleAddClass = () => {
    if (!newClassName.trim() || !newClassYear) return;
    const cName = newClassName.trim().toUpperCase();
    if (academicStructure.classes.some((c) => c.name === cName && c.year === newClassYear)) {
      showToast('Duplicate Class', 'This class already exists in this cohort year.', 'warning');
      return;
    }
    setAcademicStructure((prev) => ({
      ...prev,
      classes: [
        ...prev.classes,
        {
          year: newClassYear,
          name: cName,
          department: newClassDept || prev.departments[0] || 'Engineering',
        },
      ],
    }));
    setNewClassName('');
  };

  // Remove Class
  const handleRemoveClass = (index: number) => {
    setAcademicStructure((prev) => ({
      ...prev,
      classes: prev.classes.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
        <div className="spinner" style={{ margin: '0 auto var(--space-4)', width: 28, height: 28 }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading system configuration...</p>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '1100px' }}>
      {/* Page Header */}
      <PageHeader
        title="Settings"
        subtitle="Manage college institutional profile, competition identity, and academic class hierarchy"
        badge={
          <span className="badge badge-super">
            <ShieldCheck size={12} /> Super Coordinator Access
          </span>
        }
      />

      {/* Section 1: Institution & Sports Meet Details */}
      <form onSubmit={handleSaveGeneral}>
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Building size={17} color="#3b82f6" />
                Institution &amp; Sports Meet Profile
              </h2>
              <p className="card-subtitle">Official details displayed on PDF reports and registration slips</p>
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSaving}>
              <Save size={14} /> Save Profile
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">College / Institution Name *</label>
            <input
              type="text"
              required
              className="form-input"
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Sports Meet Title *</label>
              <input
                type="text"
                required
                className="form-input"
                value={sportsEventName}
                onChange={(e) => setSportsEventName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Competition Year *</label>
              <input
                type="text"
                required
                className="form-input"
                value={sportsYear}
                onChange={(e) => setSportsYear(e.target.value)}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Academic Year *</label>
              <input
                type="text"
                required
                className="form-input"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contact Official Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="sports@college.edu"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Coordinator Helpline Phone</label>
            <input
              type="text"
              className="form-input"
              placeholder="+91 98765 43210"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
        </div>
      </form>

      {/* Section: Participant Registration Limits */}
      <form onSubmit={handleSaveLimits}>
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Trophy size={17} color="#f59e0b" />
                Participant Registration Limits
              </h2>
              <p className="card-subtitle">
                Configure maximum independent event allocations per student for Games and Athletics
              </p>
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={
                isSavingLimits ||
                (gamesLimit === initialGamesLimit && athleticsLimit === initialAthleticsLimit)
              }
            >
              <Save size={14} /> Save Limits
            </button>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">
                Max Games per Student *
              </label>
              <input
                type="number"
                min="1"
                max="50"
                required
                className="form-input"
                value={gamesLimit}
                onChange={(e) => setGamesLimit(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                Default is 6. Controls individual/team sports categorized under <strong>Games</strong> (e.g., Football, Cricket, Badminton).
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">
                Max Athletics Events per Student *
              </label>
              <input
                type="number"
                min="1"
                max="50"
                required
                className="form-input"
                value={athleticsLimit}
                onChange={(e) => setAthleticsLimit(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                Default is 3. Controls track and field events categorized under <strong>Athletics</strong> (e.g., 100m, Relay, Long Jump).
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: 'var(--space-2)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <ShieldCheck size={14} color="#10b981" />
            <span>
              Limits are calculated dynamically from active registrations. Lowering limits will not delete or invalidate existing records.
            </span>
          </div>
        </div>
      </form>

      {/* Section 2: Academic Cohorts & Departments */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Layers size={17} color="#a855f7" />
              Academic Cohorts &amp; Departments
            </h2>
            <p className="card-subtitle">Define allowed cohort years (e.g. S1–S8) and academic disciplines</p>
          </div>
          <button onClick={handleSaveAcademic} className="btn btn-secondary btn-sm" disabled={isSaving}>
            <Save size={14} /> Save Structure
          </button>
        </div>

        <div className="grid-2col" style={{ marginBottom: 0 }}>
          {/* Cohort Years */}
          <div>
            <span className="form-label">Configured Cohort Years</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0 12px' }}>
              {academicStructure.years.map((y) => (
                <span
                  key={y}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.25rem 0.65rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <strong>{y}</strong>
                  {academicStructure.years.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveYear(y)}
                      style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                    >
                      &times;
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. S9, PG1"
                value={newYearInput}
                onChange={(e) => setNewYearInput(e.target.value)}
                style={{ padding: '0.4rem 0.65rem' }}
              />
              <button onClick={handleAddYear} className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>
                <Plus size={13} /> Add
              </button>
            </div>
          </div>

          {/* Departments */}
          <div>
            <span className="form-label">Configured Departments</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0 12px' }}>
              {academicStructure.departments.map((d) => (
                <span
                  key={d}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.25rem 0.65rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span>{d}</span>
                  {academicStructure.departments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDept(d)}
                      style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                    >
                      &times;
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Artificial Intelligence"
                value={newDeptInput}
                onChange={(e) => setNewDeptInput(e.target.value)}
                style={{ padding: '0.4rem 0.65rem' }}
              />
              <button onClick={handleAddDept} className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>
                <Plus size={13} /> Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Class Sections Directory */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Trophy size={17} color="#10b981" />
              Class Sections Directory
            </h2>
            <p className="card-subtitle">Active classes available for Year Coordinator account assignment</p>
          </div>
        </div>

        {/* Add Class Input Row */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3)',
            background: 'var(--bg-surface-elevated)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ flex: 1, minWidth: '120px' }}>
            <span className="form-label" style={{ fontSize: '11px' }}>Class Name</span>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. CSE-C"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              style={{ padding: '0.45rem 0.65rem' }}
            />
          </div>

          <div style={{ width: '110px' }}>
            <span className="form-label" style={{ fontSize: '11px' }}>Cohort</span>
            <select
              className="form-input"
              value={newClassYear}
              onChange={(e) => setNewClassYear(e.target.value)}
              style={{ padding: '0.45rem 0.65rem' }}
            >
              {academicStructure.years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1.5, minWidth: '180px' }}>
            <span className="form-label" style={{ fontSize: '11px' }}>Department</span>
            <select
              className="form-input"
              value={newClassDept}
              onChange={(e) => setNewClassDept(e.target.value)}
              style={{ padding: '0.45rem 0.65rem' }}
            >
              {academicStructure.departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <button onClick={handleAddClass} className="btn btn-primary btn-sm" style={{ height: '36px' }}>
            <Plus size={14} /> Add Class
          </button>
        </div>

        {/* Classes Table */}
        <div className="table-responsive" style={{ maxHeight: '320px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Class Section</th>
                <th>Cohort Year</th>
                <th>Department</th>
                <th style={{ textAlign: 'right' }}>Remove</th>
              </tr>
            </thead>
            <tbody>
              {academicStructure.classes.map((c, idx) => (
                <tr key={idx}>
                  <td>
                    <strong style={{ color: 'var(--text-primary)' }}>{c.name}</strong>
                  </td>
                  <td>
                    <span className="badge badge-year">{c.year}</span>
                  </td>
                  <td>
                    <span className="table-cell-muted">{c.department}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => handleRemoveClass(idx)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: '#f87171', padding: '0.3rem' }}
                      title="Remove Class"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSaveAcademic} className="btn btn-primary btn-sm" disabled={isSaving}>
            <Save size={14} /> Save All Changes
          </button>
        </div>
      </div>
    </div>
  );
};
