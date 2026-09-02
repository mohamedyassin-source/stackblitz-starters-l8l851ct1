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
        // ملاحظة: كان هذا اللون معرَّفًا هنا بدرجات "ذهبية" (#d1ab63...) بينما كل
        // الصفحات فعليًا تلوّن نفس العنصر عبر var(--brass-600) الموجود في
        // globals.css بدرجات "تركوازية" مختلفة تمامًا (#0d9488...). النتيجة كانت
        // ظهور لونين مختلفين لنفس عنصر الواجهة حسب الصفحة (bg-brass-600 مقابل
        // style={{ background: 'var(--brass-600)' }}) — وهو ما كان يكسر اتساق
        // الألوان. تم توحيد القيم هنا مع متغيرات CSS لتكون مصدر حقيقة واحد.
        brass: {
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#0d9488',
          600: '#0f766e',
          700: '#115e59',
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
        // كانت هذه تشير لخط "Cairo" غير المستورَد في globals.css (الخط الفعلي
        // المحمَّل هناك هو Tajawal) — تم توحيدهما حتى تعمل كلاسات font-display/font-body
        // بشكل صحيح إن استُخدمت مستقبلًا.
        display: ['Tajawal', 'Segoe UI', 'Tahoma', 'sans-serif'],
        body: ['Tajawal', 'Segoe UI', 'Tahoma', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.35s ease-out both',
        'fade-in': 'fadeIn 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
