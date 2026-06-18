import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOptions() {
    const { data: p } = await supabase.from('products').select('*').eq('name', 'CAIPIRINHA DE MORANGO 700ml').single();
    console.log(JSON.stringify(p.options, null, 2));
}

checkOptions();
