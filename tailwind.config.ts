import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        p: {
          green:   "#00A550",
          dark:    "#007A3D",
          darker:  "#005C2E",
          light:   "#E6F7EF",
          paper:   "#F4FAF7",
          ink:     "#0C1810",
          ink2:    "#4A6655",
          line:    "#C2DDD0",
          line2:   "#E0EFE8",
          gray:    "#7A9085",
          graybg:  "#EAF2EE",
        },
      },
      fontFamily: {
        saira: ["var(--font-saira)", "sans-serif"],
        mono:  ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
