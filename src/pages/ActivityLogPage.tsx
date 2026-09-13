import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  RotateCcw,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getActivityLogs } from '../services/activityLogService';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { SkeletonTable } from '../components/common/Skeleton';
import { Modal } from '../components/common/Modal';
import type { ActivityLog } from '../types';

export const ActivityLogPage: React.FC = () => {
  const { showToast } = useToast();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');

  // Viewing log detail modal
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getActivityLogs(150);
      setLogs(data);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to fetch audit log entries.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const q = searchTerm.toLowerCase();
    const detailsText = (log.metadata?.details || '').toLowerCase();
    const matchesSearch =
      log.actorName.toLowerCase().includes(q) ||
      detailsText.includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.entityId && log.entityId.toLowerCase().includes(q));

    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesEntity = entityFilter === 'all' || log.entityType === entityFilter;

    return matchesSearch && matchesAction && matchesEntity;
  });

  const getActionBadgeColor = (action: string) => {
    if (action.includes('create') || action.includes('import')) {
      return { bg: 'var(--color-success-light)', color: '#34d399', border: 'var(--color-success-border)' };
    }
    if (action.includes('delete') || action.includes('cancel')) {
      return { bg: 'var(--color-danger-light)', color: '#f87171', border: 'var(--color-danger-border)' };
    }
    if (action.includes('update') || action.includes('status')) {
      return { bg: 'var(--color-warning-light)', color: '#fcd34d', border: 'var(--color-warning-border)' };
    }
    return { bg: 'var(--bg-surface-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' };
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="Activity Audit Log"
        subtitle="Immutable security trail of administrative changes, registration updates, and platform events"
        badge={
          <span className="badge badge-super">
            <ShieldCheck size={12} /> Super Coordinator Access Only
          </span>
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
              placeholder="Search by coordinator name, details, or entity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="filter-select"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="all">All Actions</option>
            <option value="create_event">Create Event</option>
            <option value="update_event">Update Event</option>
            <option value="delete_event">Delete Event</option>
            <option value="create_registration">Create Registration</option>
            <option value="cancel_registration">Cancel Registration</option>
            <option value="create_student">Create Student</option>
            <option value="import_students">Import Students</option>
            <option value="create_coordinator">Create Coordinator</option>
            <option value="status_change">Status Change</option>
          </select>

          <select
            className="filter-select"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          >
            <option value="all">All Entity Types</option>
            <option value="event">Event</option>
            <option value="registration">Registration</option>
            <option value="student">Student</option>
            <option value="coordinator">Coordinator</option>
            <option value="settings">Settings</option>
          </select>

          {(searchTerm || actionFilter !== 'all' || entityFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setActionFilter('all');
                setEntityFilter('all');
              }}
              className="btn btn-ghost btn-sm"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredLogs.length}</strong> log records
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      {loading ? (
        <SkeletonTable rows={8} columns={5} />
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          icon={<History size={28} />}
          title="No Audit Entries Found"
          description="No activity log events match the current filter parameters."
        />
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Coordinator</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
                <th style={{ textAlign: 'right' }}>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const date = log.timestamp?.toDate
                  ? log.timestamp.toDate()
                  : new Date();
                const badgeStyle = getActionBadgeColor(log.action);

                return (
                  <tr key={log.logId}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      {date.toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <div>
                        <strong style={{ color: 'var(--text-primary)' }}>{log.actorName}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {log.actorRole.replace('_', ' ')}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: badgeStyle.bg,
                          color: badgeStyle.color,
                          border: `1px solid ${badgeStyle.border}`,
                          fontSize: '11px',
                        }}
                      >
                        {log.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                        {log.entityType}
                      </span>
                    </td>
                    <td style={{ maxWidth: '350px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                        {log.metadata?.details || log.action}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="btn btn-ghost btn-sm"
                        title="View Full Entry"
                      >
                        <Eye size={13} /> Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Detail Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Audit Log Event Details"
        subtitle={`Log ID: ${selectedLog?.logId}`}
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
            <div
              style={{
                background: 'var(--bg-surface-elevated)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Action:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedLog.action}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Entity Type:</span>
                <span style={{ color: 'var(--text-primary)' }}>{selectedLog.entityType}</span>
              </div>
              {selectedLog.entityId && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Target Entity ID:</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                    {selectedLog.entityId}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Actor Name:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedLog.actorName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Actor UID:</span>
                <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {selectedLog.actorUid}
                </span>
              </div>
            </div>

            <div>
              <span className="form-label">Action Narrative</span>
              <p style={{ color: 'var(--text-primary)', background: 'var(--bg-surface-elevated)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', marginTop: '4px', fontSize: 'var(--text-sm)' }}>
                {selectedLog.metadata?.details || selectedLog.action}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setSelectedLog(null)} className="btn btn-secondary btn-sm">
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
