import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        primary: "#00FFA3",
        accent: "#FF6F33",
        background: "#0B0C10",
        surface: "#13161C",
        "text-soft": "#E5E5E5",
      },
      fontFamily: {
        orbitron: ["Orbitron", "sans-serif"],
        urbanist: ["Urbanist", "sans-serif"],
      },
      boxShadow: {
        "glow-orange":
          "0 0 10px 2px rgba(255,111,51,0.6), 0 0 25px 6px rgba(255,255,255,0.15)",
      },

    },
  },
  plugins: [],
};
export default config;
