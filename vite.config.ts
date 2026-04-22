import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
    build: {
        outDir: 'dist',
        minify: 'esbuild',
        cssMinify: true,
        reportCompressedSize: false,
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            output: {
                manualChunks(id: string) {
                    if (id.includes('node_modules')) {
                        if (id.includes('@google/genai')) return 'genai';
                        if (id.includes('@zxing')) return 'zxing';
                        if (id.includes('lucide-react')) return 'ui';
                        if (id.includes('recharts')) return 'charts';
                        if (id.includes('xlsx')) return 'xlsx';
                        if (id.includes('jspdf')) return 'pdf';
                        if (id.includes('html2canvas')) return 'html2canvas';
                        if (id.includes('@supabase')) return 'supabase';
                        if (id.includes('react')) return 'vendor-react';
                        return 'vendor';
                    }
                },
            },
        },
    },
    server: {
        host: true,
        port: 5173,
    },
});
