export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  safelist: [
    // Colores custom — siempre generados aunque vengan de props dinámicas
    'bg-p-green', 'bg-p-dark', 'bg-p-darker', 'bg-p-light', 'bg-p-paper',
    'bg-p-ink', 'bg-p-ink2', 'bg-p-line', 'bg-p-line2', 'bg-p-gray',
    'text-p-green', 'text-p-dark', 'text-p-darker', 'text-p-light',
    'text-p-ink', 'text-p-ink2', 'text-p-gray',
    'border-p-green', 'border-p-dark', 'border-p-line', 'border-p-line2',
    'hover:bg-p-dark', 'hover:bg-p-light', 'hover:text-p-ink', 'hover:text-white',
    'focus:border-p-green', 'focus:ring-p-green',
    'accent-p-green',
    // Botones del componente Btn
    'disabled:opacity-50',
    'font-saira',
    // Layout crítico - sidebar
    'w-56', 'ml-56', 'lg:ml-56', 'lg:ml-[210px]', 'lg:flex', 'lg:hidden', 'lg:w-60',
    'pt-\\[100px\\]', 'pb-24', 'pb-safe',
    // Opacidad texto
    'opacity-75', 'opacity-70',
  ],
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
}
