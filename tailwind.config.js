/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'sans-serif'],
        display: ['"Tajawal"', 'sans-serif'],
      },
      colors: {
        amber: {
          DEFAULT: '#E8B44E',
          dim: '#3A311F',
        },
        green: {
          DEFAULT: '#6FCF97',
          dim: '#1E2E26',
        },
        coral: {
          DEFAULT: '#E2665B',
          dim: '#332221',
        },
      },
    },
  },
  plugins: [],
};
