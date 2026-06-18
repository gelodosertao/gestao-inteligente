import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Fetching Caipirinhas Premium...');

    const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('category', 'Caipirinhas Premium');

    if (error) {
        console.error('Error fetching:', error);
    } else {
        console.log(JSON.stringify(products, null, 2));
    }
}

run();
