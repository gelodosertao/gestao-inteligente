const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://licetziylggxtnoutjkn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpY2V0eml5bGdneHRub3V0amtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODQ2OTUsImV4cCI6MjA4MDI2MDY5NX0.olJiaq0HKZ3-DQlLjzBxodob9vaAxX2v9SaEmIRtO4w';
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
