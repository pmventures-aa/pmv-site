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
        // Coastal + fresh accents, used sparingly alongside the navy/gold core
        // so the site gains warmth and variety without losing its brand.
        // `sea` reads clean/fresh (the cleaning line); `coral` warms the navy.
        sea: {
          DEFAULT: '#2FA39B', 300: '#7FD3CB', 400: '#46BDB2',
          500: '#2FA39B', 600: '#1F857E', 700: '#166B65',
        },
        coral: {
          DEFAULT: '#E8765A', 300: '#F4A892', 400: '#F0906F',
          500: '#E8765A', 600: '#C85A42', 700: '#A24631',
        },
        sand: {
          DEFAULT: '#EFE7D6', 100: '#F6F1E6', 300: '#E3D6BC', 500: '#CDB98F',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        display: ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        serif: ['Georgia', '"Times New Roman"', 'Times', 'serif'],
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
