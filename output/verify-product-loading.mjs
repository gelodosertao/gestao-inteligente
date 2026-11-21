import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ quiet: true });
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
for (const [name, query] of [
  ['previous-query', client.from('products').select('*').is('archived_at', null).limit(1)],
  ['compatible-query', client.from('products').select('*').limit(1)]
]) {
  const { error, status } = await query;
  console.log(JSON.stringify({ name, status, errorCode: error?.code ?? null, errorMessage: error?.message ?? null }));
}
