/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          0: '#0A0A0A', // primary background
          1: '#111213', // secondary panel
          2: '#17181A', // tertiary panel
          3: '#1D1F22', // elevated surface
        },
        line: {
          DEFAULT: '#232527',
          soft: '#1B1C1E',
        },
        ink: {
          hi: '#EDEEEE',
          mid: '#9CA0A6',
          low: '#5C6067',
        },
        gpu: {
          green: '#76B900',
          'green-dim': '#4C7A05',
          cyan: '#00D9FF',
          magenta: '#FF006E',
          amber: '#FFB020',
          red: '#FF3B3B',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
        mono: ['var(--font-jbmono)', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 12px rgba(118, 185, 0, 0.55)',
        'glow-cyan': '0 0 12px rgba(0, 217, 255, 0.5)',
        panel: '0 8px 24px rgba(0, 0, 0, 0.5)',
      },
      borderRadius: {
        DEFAULT: '3px',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.35 },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
      },
      gridTemplateColumns: {
        dashboard: '320px 1fr 400px',
      },
      gridTemplateRows: {
        dashboard: '60px 1fr 200px',
      },
    },
  },
  plugins: [],
};
