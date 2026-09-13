import React from 'react';
import { ShieldCheck, Layers, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface PlaceholderPageProps {
  title: string;
  subtitle: string;
  scheduledPhase: string;
  expectedFeatures: string[];
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  subtitle,
  scheduledPhase,
  expectedFeatures,
}) => {
  const { user } = useAuth();

  return (
    <div style={{ maxWidth: 1000, margin: '2rem auto', padding: '0 1.5rem', width: '100%' }}>
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--color-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <ShieldCheck size={18} color="#10b981" />
              <span style={{ fontSize: '0.8rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Role-Based Route Guard Verified
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>{title}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{subtitle}</p>
          </div>

          <div className="badge badge-super" style={{ padding: '0.45rem 0.85rem' }}>
            <Layers size={14} /> Scheduled for {scheduledPhase}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Security &amp; Authorization Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Authenticated User:</span>
              <strong>{user?.name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Active Role:</span>
              <strong style={{ textTransform: 'capitalize' }}>{user?.role.replace('_', ' ')}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Scoped Year &amp; Class:</span>
              <strong>{user?.assignedYear ? `${user.assignedYear} (${user.assignedClass || 'All'})` : 'Global / Admin'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Firestore Security Rule:</span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>Enforced Server-Side</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Planned Implementation Features</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
            {expectedFeatures.map((feat, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={15} color="#3b82f6" style={{ flexShrink: 0 }} />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
