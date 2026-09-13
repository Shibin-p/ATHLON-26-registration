import React, { type ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  subtitle?: string | ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'default';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  subtitle,
}) => {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <span className="stat-label">{label}</span>
        <div className="stat-icon">{icon}</div>
      </div>
      <div className="stat-value">{value}</div>
      {subtitle && <div className="stat-meta">{subtitle}</div>}
    </div>
  );
};
