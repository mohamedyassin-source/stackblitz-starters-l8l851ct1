import { ReactNode } from 'react';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function ModalShell({ title, onClose, children }: ModalShellProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        background: 'var(--paper-card, #ffffff)',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '20px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>{title}</h3>
          <button 
            type="button" 
            onClick={onClose}
            style={{ background: '#fef2f2', color: '#dc2626', border: 0, padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
