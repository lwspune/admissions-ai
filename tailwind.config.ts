import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Minimum touch target for the 4-inch Android 8 floor (spec 10).
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
      fontFamily: {
        // Set by next/font in the root layout, self-hosted at build time.
        // Devanagari comes second, for the Hindi questions (2026-10-11).
        sans: ['var(--font-sans)', 'var(--font-hindi)', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // Indigo, the parent score sheet's colour, as the one accent.
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // The page behind the cards: white cards need something to sit on.
        canvas: '#f4f6fb',
      },
      backgroundImage: {
        // The parent sheet's header, blue-900 to indigo-700.
        'brand-gradient': 'linear-gradient(135deg, #1e3a8a 0%, #4338ca 100%)',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        raised: '0 2px 4px -1px rgb(15 23 42 / 0.05), 0 12px 32px -8px rgb(15 23 42 / 0.14)',
      },
      // The homepage animation's one entrance. Always used as `motion-safe:`,
      // so a visitor who asks for less motion gets the finished frame.
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-up': 'fade-up 450ms ease-out both' },
    },
  },
  plugins: [],
} satisfies Config
