export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  safelist: [
    'bg-p-green', 'bg-p-dark', 'bg-p-darker', 'bg-p-light', 'bg-p-paper',
    'bg-p-ink', 'bg-p-ink2', 'bg-p-line', 'bg-p-line2', 'bg-p-gray',
    'text-p-green', 'text-p-dark', 'text-p-darker', 'text-p-light',
    'text-p-ink', 'text-p-ink2', 'text-p-gray',
    'border-p-green', 'border-p-dark', 'border-p-line', 'border-p-line2',
    'hover:bg-p-dark', 'hover:bg-p-light', 'hover:text-p-ink', 'hover:text-white',
    'focus:border-p-green', 'focus:ring-p-green',
    'accent-p-green',
    'disabled:opacity-50',
    'font-saira',
    'w-56', 'ml-56', 'lg:ml-56', 'lg:ml-[210px]', 'lg:flex', 'lg:hidden', 'lg:w-60',
    'pt-\\[100px\\]', 'pb-24', 'pb-safe',
    'opacity-75', 'opacity-70',
  ],
  theme: {
    extend: {
      colors: {
        p: {
          green:   "#00A550",   // Verde marca — solo botones y acentos
          dark:    "#15803D",   // Verde más suave (era #007A3D muy oscuro)
          darker:  "#166534",
          light:   "#F0FDF4",   // Fondo verde muy claro
          paper:   "#F9FAFB",   // Fondo contenido — casi blanco (era crema)
          ink:     "#111827",   // Texto principal — gris oscuro estándar
          ink2:    "#6B7280",   // Texto secundario — gris medio
          line:    "#E5E7EB",   // Borde — gris neutro (era verde-gris)
          line2:   "#F3F4F6",   // Borde muy sutil
          gray:    "#9CA3AF",   // Texto placeholder
          graybg:  "#F9FAFB",
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
