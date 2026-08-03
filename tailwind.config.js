/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0B1F3A',
          50: '#EAF0F7', 100: '#C9D8EC', 700: '#132B4D',
          800: '#0E2340', 900: '#081525', 950: '#050E19',
        },
        gold: {
          DEFAULT: '#C9A227', 400: '#D9B84A', 500: '#C9A227',
          600: '#A9861B', 300: '#E3CC7A',
        },
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        // Used only on the public marketing site (see src/components/public/ui.tsx)
        // to break up an all-sans, all-geometric type system — not used in the portal/admin apps.
        display: ['"Newsreader"', 'ui-serif', 'Georgia', 'serif'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(5, 14, 25, 0.35)',
      },
      backgroundImage: {
        'navy-radial': 'radial-gradient(120% 120% at 50% 0%, #132B4D 0%, #081525 55%, #050E19 100%)',
      },
    },
  },
  plugins: [],
}
