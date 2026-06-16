/**
 * QRtravel — Design System Tokens v3
 * Glassmorphism Premium B2B
 *
 * Source of truth for all design values.
 * CSS variables in index.css mirror these tokens.
 */

export const colors = {
  // Backgrounds
  navy: '#0a0f1e',
  navyLight: '#0f1529',
  navySurface: '#141a2e',

  // Glass surfaces
  glass: 'rgba(255, 255, 255, 0.08)',
  glassHover: 'rgba(255, 255, 255, 0.12)',
  glassActive: 'rgba(255, 255, 255, 0.16)',

  // Borders
  border: 'rgba(255, 255, 255, 0.12)',
  borderLight: 'rgba(255, 255, 255, 0.20)',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',

  // Accent
  accent: '#6366f1',
  accentLight: '#818cf8',
  accentDark: '#4f46e5',
  accentGlow: 'rgba(99, 102, 241, 0.15)',
  accentGlowStrong: 'rgba(99, 102, 241, 0.25)',

  // Semantic
  success: '#10b981',
  successLight: '#34d399',
  successBg: 'rgba(16, 185, 129, 0.12)',

  warning: '#f59e0b',
  warningLight: '#fbbf24',
  warningBg: 'rgba(245, 158, 11, 0.12)',

  danger: '#ef4444',
  dangerLight: '#f87171',
  dangerBg: 'rgba(239, 68, 68, 0.12)',

  // Text
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',

  // Misc
  white: '#ffffff',
  black: '#000000',
};

export const blur = {
  glass: '20px',
  modal: '30px',
  subtle: '10px',
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '48px',
  '5xl': '64px',
};

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.3)',
  md: '0 4px 16px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
  xl: '0 16px 48px rgba(0, 0, 0, 0.6)',
  glow: '0 0 20px rgba(99, 102, 241, 0.15)',
  glowLg: '0 0 40px rgba(99, 102, 241, 0.25)',
  glass: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
};

export const zIndex = {
  sidebar: 50,
  bottomNav: 50,
  header: 40,
  dropdown: 60,
  modal: 100,
  toast: 200,
  scanFeedback: 300,
};

export const breakpoints = {
  mobile: '375px',
  tablet: '768px',
  desktop: '1024px',
  wide: '1440px',
};

export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  monoFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
};

export const transitions = {
  fast: '150ms ease',
  normal: '200ms ease',
  smooth: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
};
