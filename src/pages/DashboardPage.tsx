import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Calendar,
  ClipboardList,
  Clock,
  ArrowRight,
  UserPlus,
  FileSpreadsheet,
  PlusCircle,
  ShieldCheck,
  CalendarCheck,
  Eye,
  AlertTriangle,
  History,
  Trophy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAllEvents } from '../services/eventService';
import { getAllStudents, getScopedStudents } from '../services/studentService';
import { getAllRegistrations, getScopedRegistrations } from '../services/registrationService';
import { getActivityLogs } from '../services/activityLogService';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { SkeletonKpiGrid } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import type { Event, Registration, ActivityLog } from '../types';
import { normalizeAcademicYear } from '../utils/academicYear';

export const DashboardPage: React.FC = () => {
  const { user, isSuperCoordinator, isYearCoordinator } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [studentsCount, setStudentsCount] = useState<number>(0);
  const [activeStudentsCount, setActiveStudentsCount] = useState<number>(0);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Events
      const evts = await getAllEvents();
      setEvents(evts);

      // 2. Fetch Registrations & Students
      if (isYearCoordinator && user?.assignedYear) {
        const canonicalYear = normalizeAcademicYear(user.assignedYear);
        const regs = await getScopedRegistrations(canonicalYear);
        setRegistrations(regs);
        const scopedStuds = await getScopedStudents(canonicalYear);
        setStudentsCount(scopedStuds.length);
        setActiveStudentsCount(scopedStuds.filter((s) => s.active).length);
      } else {
        const regs = await getAllRegistrations();
        setRegistrations(regs);
        const allStuds = await getAllStudents();
        setStudentsCount(allStuds.length);
        setActiveStudentsCount(allStuds.filter((s) => s.active).length);
      }

      // 3. Activity Logs (Super Coordinator)
      if (isSuperCoordinator) {
        const logs = await getActivityLogs(6);
        setActivityLogs(logs);
      }
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  // Derived metrics
  const openEvents = events.filter((e) => e.status === 'open');

  // Registrations today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const registrationsToday = registrations.filter((r) => {
    const regDate = r.createdAt?.toDate ? r.createdAt.toDate() : new Date();
    return regDate >= todayStart;
  });

  // Upcoming deadlines (events open with future deadline)
  const now = Date.now();
  const upcomingDeadlines = events
    .filter((e) => e.status === 'open' && e.registrationDeadline)
    .map((e) => ({
      ...e,
      deadlineTime: new Date(e.registrationDeadline).getTime(),
    }))
    .filter((e) => e.deadlineTime > now)
    .sort((a, b) => a.deadlineTime - b.deadlineTime)
    .slice(0, 4);

  // Group registrations by Year for overview
  const yearCounts: Record<string, number> = {};
  registrations.forEach((r) => {
    if (r.status === 'registered') {
      yearCounts[r.year] = (yearCounts[r.year] || 0) + 1;
    }
  });

  // Role Scope Tag
  const renderScopeBadge = () => {
    if (isSuperCoordinator) {
      return (
        <span className="badge badge-super">
          <ShieldCheck size={12} /> All Departments Scope
        </span>
      );
    }
    if (isYearCoordinator) {
      return (
        <span className="badge badge-year">
          <CalendarCheck size={12} /> Academic Year: {user?.assignedYear || 'All Classes'}
        </span>
      );
    }
    return (
      <span className="badge badge-view">
        <Eye size={12} /> Read-Only Coordinator
      </span>
    );
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="Dashboard"
        subtitle="Annual Sports &amp; Athletics Registration Management"
        badge={renderScopeBadge()}
      />

      {/* Quick Actions Bar */}
      <div
        className="card card-compact"
        style={{
          marginBottom: 'var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Quick Actions
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {isSuperCoordinator && (
            <>
              <Link to="/students" className="btn btn-primary btn-sm">
                <UserPlus size={14} /> Add Student
              </Link>
              <Link to="/students/import" className="btn btn-secondary btn-sm">
                <FileSpreadsheet size={14} /> Import Students
              </Link>
              <Link to="/events" className="btn btn-secondary btn-sm">
                <PlusCircle size={14} /> Create Event
              </Link>
              <Link to="/coordinators" className="btn btn-secondary btn-sm">
                <Users size={14} /> Coordinators
              </Link>
            </>
          )}
          <Link to="/registrations" className="btn btn-secondary btn-sm">
            <ClipboardList size={14} /> View Registrations
          </Link>
          <Link to="/events" className="btn btn-ghost btn-sm">
            <Calendar size={14} /> Browse Events
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      {loading ? (
        <SkeletonKpiGrid count={4} />
      ) : (
        <div className="grid-kpi">
          <StatCard
            label="Total Students"
            value={studentsCount}
            icon={<Users size={16} />}
            subtitle={`${activeStudentsCount} active registered`}
          />
          <StatCard
            label="Competitions"
            value={events.length}
            icon={<Trophy size={16} />}
            subtitle={`${openEvents.length} open for entry`}
          />
          <StatCard
            label="Registrations"
            value={registrations.length}
            icon={<ClipboardList size={16} />}
            subtitle={`${registrationsToday.length} submitted today`}
          />
          <StatCard
            label="Upcoming Deadlines"
            value={upcomingDeadlines.length}
            icon={<Clock size={16} />}
            subtitle="Requires coordinator attention"
          />
        </div>
      )}

      {/* Main 2-Column Balanced Dashboard Layout */}
      <div className="grid-2col">
        {/* Left Column: Participation & Distribution */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <ClipboardList size={18} color="#3b82f6" />
                Participation Overview
              </h2>
              <p className="card-subtitle">Registrations distribution by academic cohort</p>
            </div>
            <Link to="/reports" className="btn btn-ghost btn-sm">
              Full Report <ArrowRight size={13} />
            </Link>
          </div>

          {Object.keys(yearCounts).length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={22} />}
              title="No Registrations Yet"
              description="Registrations made by year coordinators will be aggregated here."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {Object.entries(yearCounts).map(([year, count]) => {
                const percentage = registrations.length > 0
                  ? Math.round((count / registrations.length) * 100)
                  : 0;

                return (
                  <div key={year} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{year} Cohort</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        <strong>{count}</strong> entries ({percentage}%)
                      </span>
                    </div>
                    <div className="progress-bar-wrap">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${percentage}%`,
                          background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Upcoming Deadlines & Action List */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Clock size={18} color="#f59e0b" />
                Upcoming Deadlines
              </h2>
              <p className="card-subtitle">Pending registration windows closing soon</p>
            </div>
            <Link to="/events" className="btn btn-ghost btn-sm">
              All Events <ArrowRight size={13} />
            </Link>
          </div>

          {upcomingDeadlines.length === 0 ? (
            <EmptyState
              icon={<Calendar size={22} />}
              title="No Urgent Deadlines"
              description="All open event registration windows have active open periods."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {upcomingDeadlines.map((evt) => {
                const deadlineDate = new Date(evt.registrationDeadline);
                const isVerySoon = deadlineDate.getTime() - Date.now() < 24 * 60 * 60 * 1000;

                return (
                  <div
                    key={evt.eventId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3)',
                      background: 'var(--bg-surface-elevated)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {evt.eventName}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: isVerySoon ? '#f87171' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        {isVerySoon && <AlertTriangle size={12} />}
                        <span>Closes {deadlineDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    <Link
                      to={`/events/${evt.eventId}`}
                      className="btn btn-secondary btn-sm"
                      style={{ flexShrink: 0 }}
                    >
                      View
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Full-Width Section: Event Capacity Overview */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Trophy size={18} color="#10b981" />
              Event Capacity Status
            </h2>
            <p className="card-subtitle">Real-time slot utilization across official athletic competitions</p>
          </div>
          <Link to="/events" className="btn btn-secondary btn-sm">
            Manage Events
          </Link>
        </div>

        {events.length === 0 ? (
          <EmptyState
            icon={<Trophy size={22} />}
            title="No Events Created"
            description="Start by creating athletic and sports events for the ATHLON'26 meet."
            action={
              isSuperCoordinator ? (
                <Link to="/events" className="btn btn-primary btn-sm">
                  Create First Event
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event Name</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Per-Year Quota</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 6).map((evt) => {
                  const quota = evt.eventType === 'team'
                    ? `${evt.minParticipantsPerYear || 2}–${evt.maxParticipantsPerYear || 10} / yr`
                    : `${evt.maxParticipantsPerYear || 5} / yr`;

                  return (
                    <tr key={evt.eventId}>
                      <td>
                        <strong style={{ color: 'var(--text-primary)' }}>{evt.eventName}</strong>
                      </td>
                      <td>
                        <span className="table-cell-muted">{evt.category}</span>
                      </td>
                      <td>
                        <span style={{ textTransform: 'capitalize', fontSize: 'var(--text-xs)' }}>
                          {evt.eventType}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary)' }}>
                          {quota}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-${evt.status}`}>
                          {evt.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link to={`/events/${evt.eventId}`} className="btn btn-ghost btn-sm">
                          Details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Super Coordinator Audit Trail Section */}
      {isSuperCoordinator && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <History size={18} color="#a855f7" />
                Recent System Activity
              </h2>
              <p className="card-subtitle">Verified immutable audit log of administrative actions</p>
            </div>
            <Link to="/activity-log" className="btn btn-ghost btn-sm">
              All Activity <ArrowRight size={13} />
            </Link>
          </div>

          {activityLogs.length === 0 ? (
            <EmptyState
              icon={<History size={22} />}
              title="No Logged Activities"
              description="System audit records will appear here as administrative actions occur."
            />
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Coordinator</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {activityLogs.map((log) => {
                    const date = log.timestamp?.toDate
                      ? log.timestamp.toDate()
                      : new Date();

                    return (
                      <tr key={log.logId}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                          {date.toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td>
                          <strong style={{ fontSize: 'var(--text-sm)' }}>{log.actorName}</strong>
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: 'var(--bg-surface-elevated)',
                              border: '1px solid var(--border-medium)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {log.action.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                          {log.metadata?.details || log.action}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
