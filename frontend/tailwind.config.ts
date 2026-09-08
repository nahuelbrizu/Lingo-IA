import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        display: [
          'var(--font-lexend)',
          'var(--font-inter)',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 4px 16px -4px rgb(15 23 42 / 0.08)',
        'soft-lg':
          '0 2px 4px 0 rgb(15 23 42 / 0.04), 0 12px 32px -8px rgb(15 23 42 / 0.14)',
        'glow-brand': '0 8px 30px -8px rgb(79 70 229 / 0.45)',
        'glow-brand-lg': '0 12px 40px -8px rgb(79 70 229 / 0.5)',
        'glow-accent': '0 8px 28px -6px rgb(13 148 136 / 0.4)',
        'glow-danger': '0 8px 24px -6px rgb(225 29 72 / 0.35)',
      },
      keyframes: {
        'fade-in-up': {
          from: {
            opacity: '0',
            transform: 'translateY(20px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.94)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'message-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.55' },
          '50%': { transform: 'scale(1.12)', opacity: '0.85' },
        },
        'wave-bar': {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.6s ease-out forwards',
        'fade-in': 'fade-in 0.5s ease-out forwards',
        'scale-in': 'scale-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'message-in': 'message-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        breathe: 'breathe 2.6s ease-in-out infinite',
        'wave-bar': 'wave-bar 1s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
      borderRadius: {
        '4xl': '1.75rem',
      },
    },
  },
  plugins: [],
};
export default config;
