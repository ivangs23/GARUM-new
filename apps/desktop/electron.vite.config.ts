import { resolve }               from 'path';
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';
import react                     from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // electron-vite expone VITE_*/MAIN_VITE_* a `import.meta.env`, pero el código
  // del main las lee con `process.env.VITE_*`. Inyectamos vía `define` para que
  // Vite sustituya esas referencias por el valor real de `.env.local` en build.
  const env = loadEnv(mode, process.cwd());
  const mainEnvDefines = {
    'process.env.VITE_SUPABASE_URL':       JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
    'process.env.VITE_SUPABASE_ANON_KEY':  JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
  };

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: { '@shared': resolve('src/shared') },
      },
      define: mainEnvDefines,
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
    },
    renderer: {
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
