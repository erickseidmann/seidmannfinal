import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: '#FFC107',
          orange: '#FF9800',
          'orange-dark': '#F57C00',
          text: '#333333',
        },
        // Mantido para compatibilidade
        seidmann: {
          orange: '#FF9800',
          gold: '#FFC107',
          dark: '#333333',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
        display: ['var(--font-poppins)', 'Poppins', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-seidmann': 'linear-gradient(135deg, #FF9800 0%, #FFC107 100%)',
        'gradient-brand': 'linear-gradient(135deg, #FF9800 0%, #FFC107 100%)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'soft-lg': '0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 10px 20px -5px rgba(0, 0, 0, 0.04)',
      },
      keyframes: {
        'blink-alert': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(14, 165, 233, 0.8), 0 0 20px 2px rgba(14, 165, 233, 0.5)' },
          '50%': { opacity: '0.75', boxShadow: '0 0 0 6px rgba(14, 165, 233, 0.9), 0 0 30px 8px rgba(14, 165, 233, 0.6)' },
        },
      },
      animation: {
        'blink-alert': 'blink-alert 0.9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
