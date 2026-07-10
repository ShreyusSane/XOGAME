import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base: '/XOGAME/' matches this being deployed as a GitHub Pages *project*
// site (https://<user>.github.io/XOGAME/) rather than a user/org root site.
export default defineConfig({
  plugins: [react()],
  base: '/XOGAME/',
})
