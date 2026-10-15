/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        coal: { 900: "#0A0A0A", 800: "#131313", 700: "#1C1C1C", 600: "#2A2A2A" },
      },
      fontFamily: { display: ["Oswald", "system-ui", "sans-serif"], body: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
}
