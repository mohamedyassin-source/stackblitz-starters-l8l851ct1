import { ReactNode } from 'react';

interface ModalShellProps {
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function ModalShell({ onClose, title, children }: ModalShellProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15,23,42,0.8)',
      display: 'flex',
      alignItems: 'center',
      justify: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div className="db-card" style={{
        width: '650px',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: 'var(--paper-card, #fff)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--navy-950, #0f172a)' }}>{title}</h3>
          <button 
            type="button" 
            onClick={onClose} 
            style={{ background: '#fef2f2', border: 0, color: '#dc2626', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            إغلاق ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
