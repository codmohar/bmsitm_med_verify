import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Also always ignore db/ and hardware/hardware.json — these are server-side runtime
      // data files written continuously. Watching them causes an infinite reload loop:
      //   write → Vite HMR reload → useEffect fires → write → reload → ∞
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/db/**', '**/hardware/**', '**/dist/**', '**/.system_generated/**'],
      },
    },
  };
});
