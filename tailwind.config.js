/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#00467f',
          light: '#005a9e',
          dark: '#003360',
        },
        red: '#e51b24',
        silver: '#9eb0cf',
        cream: '#ebf1f9',
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
