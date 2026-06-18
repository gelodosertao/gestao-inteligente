require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) { console.error('❌ VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY devem estar definidos no .env'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
    let { data, error } = await supabase.from('sales').select('*').limit(15000);
    if (error) console.error(error);
    console.log('Sales returned length with explicit limit:', data ? data.length : 0);
})();
