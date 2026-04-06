/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'gai-navy': '#0f172a',
                'gai-tech': '#f59e0b', // Gold/Orange matching Gelo do Sertão
            }
        },
    },
    plugins: [],
}
