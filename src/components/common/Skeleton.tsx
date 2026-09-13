import React from 'react';

export const SkeletonKpiGrid: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid-kpi">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card skeleton skeleton-card" />
      ))}
    </div>
  );
};

export const SkeletonTable: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 5,
}) => {
  return (
    <div className="table-responsive">
      <table className="data-table">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i}>
                <div className="skeleton skeleton-text" style={{ width: '60px', height: '12px' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c}>
                  <div
                    className="skeleton skeleton-text"
                    style={{ width: `${Math.floor(40 + Math.random() * 50)}%`, height: '14px' }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
