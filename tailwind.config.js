/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Lucy Cyberpunk Terminal Palette
        "lucy-bg": "#07090F",
        "lucy-bg2": "#0D1117",
        "lucy-bg3": "#161B22",
        "lucy-bg4": "#21262D",
        "lucy-ink": "#E6EDF3",
        "lucy-dim": "#8B949E",
        "lucy-muted": "#6E7681",
        "lucy-rule": "#30363D",
        "lucy-orange": "#F97316",
        "lucy-orange-bright": "#FB923C",
        "lucy-cyan": "#22D3EE",
        "lucy-purple": "#A78BFA",
        "lucy-green": "#4ADE80",
        "lucy-red": "#F87171",
        "lucy-yellow": "#FACC15",
        "lucy-blue": "#60A5FA",
      },
      fontFamily: {
        pixel: ['"PixelifySans"', "monospace"],
        term: ['"Tektur"', "monospace"],
        mono: ['"JetBrainsMono"', "Consolas", "monospace"],
        silk: ['"Silkscreen"', "monospace"],
      },
      animation: {
        "blink": "blink 1s step-end infinite",
        "blink-dot": "blink-dot 1.5s ease-in-out infinite",
        "pulse-border": "pulse-border 2s ease-in-out infinite",
        "scan-line": "scan-line 8s linear infinite",
        "glitch": "glitch 0.3s ease-in-out",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "blink-dot": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 6px currentColor" },
          "50%": { opacity: "0.4", boxShadow: "none" },
        },
        "pulse-border": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(34,211,238,0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(34,211,238,0)" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        glitch: {
          "0%": { transform: "translate(0)" },
          "20%": { transform: "translate(-2px, 2px)" },
          "40%": { transform: "translate(-2px, -2px)" },
          "60%": { transform: "translate(2px, 2px)" },
          "80%": { transform: "translate(2px, -2px)" },
          "100%": { transform: "translate(0)" },
        },
      },
    },
  },
  plugins: [],
};
