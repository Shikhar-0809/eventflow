/** @type {import('tailwindcss').Config} */
// Design tokens from docs/design/DIRECTIONS.md 2.3, 2.8 and 1.5. Custom names only: slate, teal etc. stay Tailwind's.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
const pair = (fg, bg) => ({ fg, bg })

export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        sidebar: v('sidebar'),
        input: v('input'),
        canvas: v('canvas'),
        raised: v('raised'),
        overlay: v('overlay'),
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        fg: { 1: v('text-1'), 2: v('text-2'), 3: v('text-3') },
        accent: { DEFAULT: v('accent'), hover: v('accent-hover'), ink: v('accent-ink'), soft: v('accent-soft') },
        focus: v('focus'),
        // Fixed per theme-independent values (2.3).
        danger: { DEFAULT: '#F87171', hover: '#FCA5A5', ink: '#2A0A0A' },
        whatsapp: { DEFAULT: '#22C55E', hover: '#4ADE80', ink: '#052E16' },
        disabled: pair('#67728B', '#1D2537'),
        status: { error: '#FCA5A5', success: '#6EE7B7' },
        badge: {
          confirmed: pair('#5EEAD4', '#0F2A2D'),
          pending: pair('#FCD34D', '#2A2312'),
          completed: pair('#A5B4FC', '#1C1E3A'),
          cancelled: pair('#A9B3C6', '#222B3E'),
          available: pair('#6EE7B7', '#0B2A22'),
          'in-use': pair('#FCD34D', '#2A2312'),
          damaged: pair('#FCA5A5', '#2B1519'),
          count: pair('#422006', '#FCD34D'),
        },
        banner: {
          clash: { bg: '#2B1519', body: '#FCA5A5', edge: '#F87171' },
          shortfall: { bg: '#2A2312', body: '#FCD34D', edge: '#F59E0B' },
        },
        pill: {
          confirmed: { fg: '#F0FDFA', bg: '#115E59', stripe: '#5EEAD4' },
          pending: pair('#FEF3C7', '#78350F'),
          completed: pair('#E0E7FF', '#3730A3'),
          cancelled: pair('#A9B3C6', '#273248'),
        },
      },
      borderRadius: { control: '6px', card: '8px', sheet: '12px' },
      spacing: {
        section: 'clamp(4rem, 2.592rem + 6.009vw, 8rem)',
        block: 'clamp(2rem, 1.648rem + 1.502vw, 3rem)',
        gutter: 'clamp(1rem, 0.648rem + 1.502vw, 2rem)',
      },
      transitionDuration: {
        press: '100ms',
        hover: '150ms',
        state: '180ms',
        enter: '240ms',
        exit: '160ms',
        'sheet-in': '280ms',
        'sheet-out': '200ms',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.2, 0, 0, 1)',
        enter: 'cubic-bezier(0, 0, 0.2, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
        move: 'cubic-bezier(0.3, 0, 0.2, 1)',
      },
      fontFamily: {
        sans: ['"Schibsted Grotesk"', '"Schibsted Grotesk Fallback"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
