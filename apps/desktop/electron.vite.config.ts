import { resolve }               from 'path';
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';
import react                     from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // electron-vite expone VITE_*/MAIN_VITE_* a `import.meta.env`, pero el cÃ³digo
  // del main las lee con `process.env.VITE_*`. Inyectamos vÃ­a `define` para que
  // Vite sustituya esas referencias por el valor real de `.env.local` en build.
  const env = loadEnv(mode, process.cwd());
  const mainEnvDefines = {
    'process.env.VITE_SUPABASE_URL':       JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
    'process.env.VITE_SUPABASE_ANON_KEY':  JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
    // ws usa bufferutil (addon nativo) para rendimiento. Los .node no pueden
    // cargarse desde dentro de un asar â†’ forzar fallback puro en JavaScript.
    'process.env.VITE_DESKTOP_EMAIL':    JSON.stringify(env.VITE_DESKTOP_EMAIL ?? ''),
    'process.env.VITE_DESKTOP_PASSWORD': JSON.stringify(env.VITE_DESKTOP_PASSWORD ?? ''),
    'process.env.WS_NO_BUFFER_UTIL':    JSON.stringify('1'),
    'process.env.WS_NO_UTF_8_VALIDATE': JSON.stringify('1'),
  };

  const root = resolve(__dirname);

  return {
    main: {
      build: { outDir: resolve(root, 'out/main'), sourcemap: false },
      plugins: [externalizeDepsPlugin({
        exclude: [
          '@garum/shared',
          '@supabase/supabase-js',
          '@supabase/realtime-js',
          'electron-updater',
          'ws',
          'node-thermal-printer',
        ],
      })],
      resolve: {
        alias: { '@shared': resolve('src/shared') },
      },
      define: mainEnvDefines,
    },
    preload: {
      build: { outDir: resolve(root, 'out/preload'), sourcemap: false },
      plugins: [externalizeDepsPlugin({ exclude: ['@garum/shared'] })],
    },
    renderer: {
      build: { outDir: resolve(root, 'out/renderer'), sourcemap: false },
      plugins: [react()],
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared':   resolve('src/shared'),
        },
      },
    },
  };
});
