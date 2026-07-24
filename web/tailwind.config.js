/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#14213D', 2: '#20305A', soft: '#5B6472' },
        paper: { DEFAULT: '#F3F4EF', 2: '#FFFFFF' },
        line: { DEFAULT: '#DEDCD0', soft: '#EAE8DC' },
        seal: { DEFAULT: '#B8863A', dark: '#8C6427', soft: '#F1E4CC' },
        verified: { DEFAULT: '#1F6E52', soft: '#DEEEE6' },
        review: { DEFAULT: '#A66A1E', soft: '#F3E6D2' },
        block: { DEFAULT: '#A63A3A', soft: '#F3DEDE' },
      },
    },
  },
  plugins: [],
};
