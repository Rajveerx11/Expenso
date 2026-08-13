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
        primary: {
          deep: '#4F46E5',
          medium: '#6366F1',
          soft: '#818CF8',
          lightest: '#EEF2FF',
          container: '#C7D2FE',
        },
        semantic: {
          green: '#10B981',
          greenSoft: '#D1FAE5',
          red: '#F43F5E',
          redSoft: '#FFE4E6',
          amber: '#F59E0B',
          amberSoft: '#FEF3C7',
        },
        neutral: {
          white: '#FFFFFF',
          snow: '#FAFAFA',
          light: '#F3F4F6',
          medium: '#9CA3AF',
          dark: '#374151',
          black: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
      },
      backdropBlur: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '20px',
      },
    },
  },
  plugins: [],
};

export default config;
