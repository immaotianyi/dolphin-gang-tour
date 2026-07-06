/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        orange: "#FF7B24",
        "orange-bright": "#FF9B44",
        "term-green": "#00FF41",
        "term-green-dim": "#00CC33",
        "term-red": "#FF3333",
        "term-yellow": "#FFCC00",
        "term-blue": "#00CCFF",
        "term-purple": "#CC66FF",
        "term-dark": "#0A0A0A",
        "term-dark2": "#111111",
        "term-dark3": "#1A1A1A",
        "term-gray": "#333333",
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
        term: ['"VT323"', "monospace"],
        mono: ['"Fira Code"', "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
