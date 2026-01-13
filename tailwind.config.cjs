const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: [
    './pages/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#DDBEA9',
        accent: '#FFE8D6',
        text: '#2D2D2D',
        background: '#FFFFFF'
      },
      fontFamily: {
        display: ['\"Playfair Display\"', ...defaultTheme.fontFamily.serif],
        body: ['Inter', 'Lato', ...defaultTheme.fontFamily.sans]
      }
    }
  },
  plugins: []
};
