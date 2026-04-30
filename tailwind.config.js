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
        // Dental Departures brand
        sky: {
          DEFAULT: '#52bdec',
          light: '#7dcef3',
          dark: '#3aa8d8',
        },
        coal: '#58585a',
        fog: '#f5f5f5',
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
