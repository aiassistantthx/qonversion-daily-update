/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0d1117',
          card: '#161b22',
          border: '#30363d',
          text: '#e6edf3',
          muted: '#8b949e',
          green: '#00ff88',
          red: '#ff4444',
          cyan: '#00d4ff',
          yellow: '#ffcc00',
          purple: '#a371f7',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      }
    },
  },
  plugins: [],
}
