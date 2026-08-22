import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0a0f1c',
          900: '#101828',
          800: '#182238',
          700: '#232f4a',
        },
        brass: {
          300: '#e3c689',
          400: '#d1ab63',
          500: '#b8934a',
          600: '#9c7a2e',
          700: '#7c611f',
        },
        paper: {
          DEFAULT: '#f6f3ea',
          card: '#fffdf8',
          line: '#e6dfc9',
        },
        ink: {
          DEFAULT: '#1b1f2a',
          muted: '#6b7280',
        },
        stamp: {
          green: '#1f5c3a',
          amber: '#8a5a12',
          red: '#8f2323',
          blue: '#1f3f66',
        },
      },
      fontFamily: {
        display: ['Cairo', 'sans-serif'],
        body: ['Cairo', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};
export default config;
