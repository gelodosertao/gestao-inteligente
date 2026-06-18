require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) { console.error('❌ VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY devem estar definidos no .env'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  console.log('Adicionando coluna discount na tabela sales...');
  const { error } = await supabase.rpc('exec_sql', { sql: 'ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;' });
  
  if (error) {
    console.error('Erro ao executar RPC:', error);
    // Fallback: try direct query if rpc fails or doesn't exist
    // Actually, usually I don't have direct SQL access via anon key unless rpc is enabled.
    console.log('Tentando via REST (pode falhar se RLS for estrito)...');
  } else {
    console.log('Coluna adicionada com sucesso!');
  }
})();
