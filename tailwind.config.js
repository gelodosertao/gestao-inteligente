/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "!./components/**/node_modules/**",
        "./services/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    navy: '#0B2B63',
                    blue: '#2E5EAD',
                    ice: '#57B8F2',
                    orange: '#F28C28',
                    sun: '#F5A340',
                    earth: '#3B2A2A',
                    snow: '#F7F5F0',
                },
                blue: {
                    50: '#EFF8FF', 100: '#DDF1FF', 200: '#B8E4FF',
                    300: '#82CEF7', 400: '#57B8F2', 500: '#3E8ED0',
                    600: '#2E5EAD', 700: '#244C91', 800: '#183B74',
                    900: '#102E60', 950: '#081E42',
                },
                orange: {
                    50: '#FFF7ED', 100: '#FFEDD5', 200: '#FED7AA',
                    300: '#FDBA74', 400: '#F5A340', 500: '#F28C28',
                    600: '#EA6A12', 700: '#C24C0A', 800: '#9A3C0E',
                    900: '#7C3211', 950: '#431707',
                },
                slate: {
                    50: '#FBFAF7', 100: '#F2F2EF', 200: '#D9E3EA',
                    300: '#C5D2DD', 400: '#8295A8', 500: '#62758A',
                    600: '#465B72', 700: '#2F455E', 800: '#1B3653',
                    900: '#0B2B4E', 950: '#061C33',
                },
                'gai-navy': '#0B2B63',
                'gai-tech': '#F28C28', // Brand orange from the visual identity manual
            },
            fontFamily: {
                sans: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                display: ['Roboto Slab', 'Georgia', 'serif'],
            },
            boxShadow: {
                brand: '0 18px 45px -28px rgba(11, 43, 99, 0.45)',
                'brand-lg': '0 28px 80px -40px rgba(11, 43, 99, 0.55)',
            },
        },
    },
    plugins: [],
}
