import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in dev: the UI calls /api/v1 and Vite forwards it to the backend.
    proxy: { '/api': 'http://localhost:4000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/ui/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
