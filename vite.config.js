import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/billing/',
  server: {
    host: '0.0.0.0',
    port: 5173,
     https: {
      key: '/etc/apache2/ssl.key/viciphone.key',
      cert: '/etc/apache2/ssl.crt/viciphone.crt',
    },
  },
})
