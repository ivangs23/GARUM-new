/**
 * Aplica las migraciones SQL usando la service role key.
 * Uso: node supabase/apply-migrations.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Faltan variables: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const sql = readFileSync(join(__dir, 'migrations/001_initial_schema.sql'), 'utf8');

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({ sql }),
}).catch(() => null);

// Supabase no expone exec_sql via REST, usar el endpoint de Management API
const pgRes = await fetch(`${SUPABASE_URL.replace('.supabase.co', '')}/pg/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({ query: sql }),
});

if (pgRes.ok) {
  console.log('✅ Migraciones aplicadas correctamente.');
} else {
  console.log('⚠️  Aplica el SQL manualmente en el SQL Editor de Supabase.');
  console.log('   Archivo: supabase/migrations/001_initial_schema.sql');
}
