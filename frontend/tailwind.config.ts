import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./store/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "var(--color-cream)",
        "warm-sand": "var(--color-warm-sand)",
        ink: "var(--color-ink)",
        navy: "var(--color-navy)",
        coral: "var(--color-coral)",
        midnight: "var(--color-midnight)",
        aqua: "var(--color-aqua)",
        sunrise: "var(--color-sunrise)",
      },
    },
  },
  plugins: [],
};

export default config;
