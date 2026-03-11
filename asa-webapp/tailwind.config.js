/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        status: {
          success: {
            bg: '#dcfce7',      // green-100
            text: '#166534',    // green-800
            dark: {
              bg: '#14532d',    // green-900
              text: '#bbf7d0',  // green-200
            }
          },
          warning: {
            bg: '#fef3c7',      // yellow-100
            text: '#854d0e',    // yellow-800
            dark: {
              bg: '#713f12',    // yellow-900
              text: '#fef08a',  // yellow-200
            }
          },
          error: {
            bg: '#fee2e2',      // red-100
            text: '#991b1b',    // red-800
            dark: {
              bg: '#7f1d1d',    // red-900
              text: '#fecaca',  // red-200
            }
          },
          info: {
            bg: '#dbeafe',      // blue-100
            text: '#1e40af',    // blue-800
            dark: {
              bg: '#1e3a8a',    // blue-900
              text: '#bfdbfe',  // blue-200
            }
          }
        },
        traffic: {
          ok: '#10b981',        // green-500
          risk: '#f59e0b',      // amber-500
          bad: '#f97316',       // orange-500
          loss: '#ef4444',      // red-500
          unknown: '#9ca3af',   // gray-400
        },
        health: {
          good: '#22c55e',      // green-500
          warning: '#eab308',   // yellow-500
          critical: '#ef4444',  // red-500
        }
      },
      borderRadius: {
        'xs': '6px',
        'sm': '8px',
        'DEFAULT': '8px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'DEFAULT': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      }
    },
  },
  plugins: [],
}
