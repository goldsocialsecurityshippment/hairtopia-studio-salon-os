import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#FAF7F2",
        surface: "#FFFFFF",
        ink: "#211C17",
        "ink-soft": "#5C5349",
        line: "#E7E0D4",
        bronze: {
          50: "#FBF4E9",
          100: "#F1DFB9",
          200: "#DDBD87",
          300: "#C89B5C",
          400: "#A9773E",
          500: "#8C6031",
          600: "#7C5427",
          700: "#5E3F1E",
        },
        moss: "#3F7A5A",
        amber: "#B8863B",
        rust: "#B4432F",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        body: ["var(--font-body)", "-apple-system", "Segoe UI", "sans-serif"],
      },
      letterSpacing: {
        wide2: "0.14em",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(33,28,23,0.04), 0 8px 24px -12px rgba(33,28,23,0.12)",
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
