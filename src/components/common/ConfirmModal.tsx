import React from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  type?: 'danger' | 'warning' | 'info';
  onCancel?: () => void;
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  type,
  onCancel,
  isLoading = false,
}) => {
  const isDanger = isDangerous || type === 'danger';
  const handleCancel = onCancel || onClose || (() => {});

  const renderIcon = () => {
    if (isDanger) {
      return (
        <div
          style={{
            padding: '8px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-danger-light)',
            color: 'var(--color-danger)',
            flexShrink: 0,
            border: '1px solid var(--color-danger-border)',
          }}
        >
          <AlertCircle size={20} />
        </div>
      );
    }
    return (
      <div
        style={{
          padding: '8px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-warning-light)',
          color: 'var(--color-warning)',
          flexShrink: 0,
          border: '1px solid var(--color-warning-border)',
        }}
      >
        <AlertTriangle size={20} />
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title={title} maxWidth="460px">
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', marginBottom: 'var(--space-5)' }}>
        {renderIcon()}
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.5, flex: 1 }}>
          {message}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <button
          type="button"
          onClick={handleCancel}
          className="btn btn-secondary btn-sm"
          disabled={isLoading}
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={isDanger ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm'}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <div className="spinner" style={{ width: 14, height: 14 }} />
              <span>Processing...</span>
            </>
          ) : (
            confirmText
          )}
        </button>
      </div>
    </Modal>
  );
};
