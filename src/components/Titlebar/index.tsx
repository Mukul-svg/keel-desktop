import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

export const Titlebar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Initial check
    appWindow.isMaximized().then(setIsMaximized).catch(console.error);

    // Listen to window resize events to detect maximization state changes
    const unlisten = appWindow.listen('tauri://resize', async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch (err) {
        console.error('Error reading window maximized state:', err);
      }
    });

    return () => {
      unlisten.then((f) => f()).catch(console.error);
    };
  }, []);

  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch (err) {
      console.error('Failed to minimize window:', err);
    }
  };

  const handleMaximize = async () => {
    try {
      await appWindow.toggleMaximize();
    } catch (err) {
      console.error('Failed to maximize window:', err);
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (err) {
      console.error('Failed to close window:', err);
    }
  };

  return (
    <div className="custom-titlebar" onDoubleClick={handleMaximize} data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-logo" style={{ display: 'flex', alignItems: 'center' }} data-tauri-drag-region>
          <img src="/logo.png" alt="Logo" className="brand-logo" style={{ height: '14px', width: 'auto', objectFit: 'contain' }} data-tauri-drag-region />
        </span>
        <span className="titlebar-title" data-tauri-drag-region>Keel</span>
      </div>
      <div className="titlebar-drag" data-tauri-drag-region />
      <div className="titlebar-controls">
        <button className="control-btn minimize" onClick={handleMinimize} title="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="10" height="1" fill="currentColor"/>
          </svg>
        </button>
        <button className="control-btn maximize" onClick={handleMaximize} title={isMaximized ? "Restore" : "Maximize"}>
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 1H9V7H3V1Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M1 3H7V9H1V3Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1"/>
            </svg>
          )}
        </button>
        <button className="control-btn close" onClick={handleClose} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
};
