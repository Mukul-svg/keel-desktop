import { StateCreator } from 'zustand';
import { KeelStore } from '../types';

export interface SettingsSlice {
  bgImageUrl: string;
  bgOpacity: number;
  bgBlur: number;
  bgOverlayOpacity: number;
  panelOpacity: number;
  isGlassEnabled: boolean;
  isSnowEnabled: boolean;
  theme: 'dark' | 'light';
  syncInterval: 'manual' | '1m' | '5m' | '15m' | '30m' | '1h';

  setBgImageUrl: (url: string) => void;
  setBgOpacity: (opacity: number) => void;
  setBgBlur: (blur: number) => void;
  setBgOverlayOpacity: (opacity: number) => void;
  setPanelOpacity: (opacity: number) => void;
  setGlassEnabled: (enabled: boolean) => void;
  setSnowEnabled: (enabled: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setSyncInterval: (interval: 'manual' | '1m' | '5m' | '15m' | '30m' | '1h') => void;
}

export const createSettingsSlice: StateCreator<
  KeelStore,
  [],
  [],
  SettingsSlice
> = (set) => ({
  bgImageUrl: localStorage.getItem('bgImageUrl') || '',
  bgOpacity: parseFloat(localStorage.getItem('bgOpacity') || '0.5'),
  bgBlur: parseFloat(localStorage.getItem('bgBlur') || '15'),
  bgOverlayOpacity: parseFloat(localStorage.getItem('bgOverlayOpacity') || '0.3'),
  panelOpacity: parseFloat(localStorage.getItem('panelOpacity') || '0.72'),
  isGlassEnabled: localStorage.getItem('isGlassEnabled') !== 'false',
  isSnowEnabled: localStorage.getItem('isSnowEnabled') === 'true',
  theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  syncInterval: (localStorage.getItem('syncInterval') as any) || 'manual',

  setBgImageUrl: (url) => {
    localStorage.setItem('bgImageUrl', url);
    set({ bgImageUrl: url });
  },
  setBgOpacity: (opacity) => {
    localStorage.setItem('bgOpacity', String(opacity));
    set({ bgOpacity: opacity });
  },
  setBgBlur: (blur) => {
    localStorage.setItem('bgBlur', String(blur));
    set({ bgBlur: blur });
  },
  setBgOverlayOpacity: (opacity) => {
    localStorage.setItem('bgOverlayOpacity', String(opacity));
    set({ bgOverlayOpacity: opacity });
  },
  setPanelOpacity: (opacity) => {
    localStorage.setItem('panelOpacity', String(opacity));
    set({ panelOpacity: opacity });
  },
  setGlassEnabled: (enabled) => {
    localStorage.setItem('isGlassEnabled', String(enabled));
    set({ isGlassEnabled: enabled });
  },
  setSnowEnabled: (enabled) => {
    localStorage.setItem('isSnowEnabled', String(enabled));
    set({ isSnowEnabled: enabled });
  },
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  },
  setSyncInterval: (interval) => {
    localStorage.setItem('syncInterval', interval);
    set({ syncInterval: interval });
  },
});
