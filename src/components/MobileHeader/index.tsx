import React from 'react';
import { useStore } from '../../stores/useStore';
import { Menu, X, FileText } from 'lucide-react';

export const MobileHeader: React.FC = () => {
  const {
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    isMobileNotesListOpen,
    setMobileNotesListOpen,
  } = useStore();

  return (
    <header className="mobile-top-nav">
      <button
        className="mobile-nav-btn"
        onClick={() => {
          setMobileSidebarOpen(!isMobileSidebarOpen);
          setMobileNotesListOpen(false);
        }}
        title="Toggle Sidebar"
      >
        {isMobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <div className="mobile-brand-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <img src="/logo.png" alt="Logo" className="brand-logo" style={{ height: '16px', width: 'auto', objectFit: 'contain' }} /> Keel
      </div>
      <button
        className="mobile-nav-btn mobile-nav-right-btn"
        onClick={() => {
          setMobileNotesListOpen(!isMobileNotesListOpen);
          setMobileSidebarOpen(false);
        }}
        title="Toggle Notes List"
      >
        {isMobileNotesListOpen ? <X size={20} /> : <FileText size={20} />}
      </button>
    </header>
  );
};
