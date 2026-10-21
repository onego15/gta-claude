import { defineConfig } from 'vite';
// relative base so the built game runs from any static host or sub-folder
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 2000 } });
