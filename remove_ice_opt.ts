import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function removeIceOptions() {
    console.log('Buscando produtos...');
    const { data: products, error: fetchError } = await supabase.from('products').select('*');

    if (fetchError) {
        console.error('Erro ao buscar produtos:', fetchError);
        return;
    }

    const productsToUpdate = products.filter(p => {
        if (!p.options) return false;

        // Verifica se tem 'GELO' nas options com as escolhas que queremos remover
        return p.options.some((opt: any) =>
            opt.name === 'GELO' &&
            opt.choices &&
            opt.choices.some((c: any) => c.name === 'COM MENOS GELO' || c.name === 'COM MAIS GELO')
        );
    });

    console.log(`Encontrados ${productsToUpdate.length} produtos para atualizar...`);

    for (const product of productsToUpdate) {
        const newOptions = product.options.map((opt: any) => {
            if (opt.name === 'GELO' && opt.choices) {
                return {
                    ...opt,
                    choices: opt.choices.filter((c: any) => c.name !== 'COM MENOS GELO' && c.name !== 'COM MAIS GELO')
                };
            }
            return opt;
        });

        console.log(`Atualizando: ${product.name}`);
        const { error } = await supabase.from('products').update({ options: newOptions }).eq('id', product.id);

        if (error) {
            console.error(`Erro ao atualizar ${product.name}:`, error);
        } else {
            console.log(`OK: ${product.name}`);
        }
    }
    console.log('Finalizado.');
}

removeIceOptions();
