'use strict';
// Copia el output de electron-vite (que va a la raíz del monorepo)
// a apps/desktop/out/ para que electron-builder lo encuentre.
const { cpSync, mkdirSync, rmSync } = require('fs');
const { join } = require('path');

const src = join(__dirname, '..', '..', '..', 'out');   // GARUM-new/out
const dst = join(__dirname, '..', 'out');               // apps/desktop/out

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true, force: true });
console.log('  • build output copiado a apps/desktop/out/');
