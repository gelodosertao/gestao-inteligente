import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://licetziylggxtnoutjkn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpY2V0eml5bGdneHRub3V0amtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODQ2OTUsImV4cCI6MjA4MDI2MDY5NX0.olJiaq0HKZ3-DQlLjzBxodob9vaAxX2v9SaEmIRtO4w';
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
