import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serves the app under /<repo-name>/; local dev and other static
// hosts use the root path.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES ? `/${process.env.GITHUB_PAGES}/` : '/',
});
