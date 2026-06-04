import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '⚠️ [IceRoute] Variáveis do Supabase não configuradas! Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

/** Tenant ID configurado no .env — identifica a empresa no banco multi-tenant */
export const TENANT_ID = import.meta.env.VITE_TENANT_ID || '';
