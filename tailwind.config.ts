import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class', // 🌟 تفعيل الوضع الداكن بناءً على الكلاس
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 🌟 ربط ألوان Tailwind بالمتغيرات التي أنشأناها في CSS
        background: 'var(--bg-color)',
        card: 'var(--card-bg)',
        primary: 'var(--text-main)',
        muted: 'var(--text-muted)',
        border: 'var(--border-color)',
        gold: {
          DEFAULT: 'var(--accent-gold)',
          hover: 'var(--accent-gold-hover)',
        },
        navy: {
          DEFAULT: 'var(--accent-navy)',
        },
        danger: {
          bg: 'var(--danger-bg)',
          text: 'var(--danger-text)',
        },
        success: {
          bg: 'var(--success-bg)',
          text: 'var(--success-text)',
        },
        warning: {
          bg: 'var(--warning-bg)',
          text: 'var(--warning-text)',
        }
      },
    },
  },
  plugins: [],
}
export default config
