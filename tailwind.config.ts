import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        aurora: {
          primary: "var(--aurora-primary)",
          secondary: "var(--aurora-secondary)",
          surface: "var(--aurora-surface)",
          border: "var(--aurora-border)",
          text: "var(--aurora-text)",
          muted: "var(--aurora-text-secondary)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
