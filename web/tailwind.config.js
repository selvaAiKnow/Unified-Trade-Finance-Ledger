/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1C2B39', 2: '#152029', soft: '#5B6670' },
        paper: { DEFAULT: '#F1EFE7', 2: '#FFFFFF' },
        line: { DEFAULT: '#DAD6C9', soft: '#EAE8DC', strong: '#C7C2B2' },
        seal: { DEFAULT: '#2F6E63', dark: '#234F47', soft: '#E6F0EE' },
        verified: { DEFAULT: '#2F6E63', soft: '#E6F0EE' },
        review: { DEFAULT: '#8A6320', soft: '#F8EEDC' },
        block: { DEFAULT: '#9C3B30', soft: '#F5E7E4' },
      },
      fontFamily: {
        serif: ['"Roboto Slab"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
