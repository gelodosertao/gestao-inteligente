import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Updating descriptions...');

    const updates = [
        {
            category: 'Batidas',
            description: 'Feito com a fruta, leite condensado, destilado e gelo'
        },
        {
            category: 'Caipirinha',
            description: 'Feito com a fruta, cachaça, açucar e gelo'
        },
        {
            category: 'Caipiroska Premium',
            description: 'Feito com a fruta, Absolut e Licor 43, açucar e gelo'
        }
    ];

    for (const update of updates) {
        console.log(`Updating description for category: ${update.category}`);
        const { error } = await supabase
            .from('products')
            .update({ description: update.description })
            .eq('category', update.category);

        if (error) {
            console.error(`Error updating ${update.category}:`, error);
        } else {
            console.log(`Successfully updated ${update.category}`);
        }
    }

    console.log('Finished updating descriptions.');
}

run();
