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
                gai: {
                    navy: '#0F2F52',      // Azul Marinho Profundo (Confiança)
                    tech: '#4EA8DE',      // Azul Tecnologia (Modernidade)
                    cyan: '#A9D6E5',      // Azul Ciano (Inovação)
                    slate: '#1E293B',     // Slate Dark (Menu lateral)
                    accent: '#2AC940',    // Verde Ação (Confirmações)
                    bg: '#F1F5F9',        // Fundo Claro Industrial
                }
            },
            fontFamily: {
                gai: ['Outfit', 'Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
