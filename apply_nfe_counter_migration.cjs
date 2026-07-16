require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY devem estar definidos no .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  console.log('Tentando executar migration via RPC exec_sql...');

  const sql = fs.readFileSync(
    path.resolve(__dirname, 'nfe_service/src/schemas/migration_nfe_counters.sql'),
    'utf-8'
  ).replace(/^--.*$/gm, '').trim(); // strip comments

  const { error } = await supabase.rpc('exec_sql', { sql });

  if (error) {
    console.log('\n⚠️  RPC exec_sql não disponível neste projeto.');
    console.log('\n📋 Para aplicar a manualmente:');
    console.log('   1. Acesse: https://supabase.com/dashboard/project/licetziylggxtnoutjkn/sql/new');
    console.log('   2. Execute o conteúdo do arquivo:');
    console.log(`      ${path.resolve(__dirname, 'nfe_service/src/schemas/migration_nfe_counters.sql')}`);
    console.log('\n   Ou execute inline:');
    console.log('   ---');
    console.log(sql);
    console.log('   ---\n');
    process.exit(0);
  }

  console.log('✅ Migration executada com sucesso!');
})();
