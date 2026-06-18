import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const expirations = [
    { name: "Del VALLE laranja 1,5", date: "2026-10-30", keywords: ["DEL VALLE LARANJA 1,5"] },
    { name: "H2O limão 500ml", date: "2026-03-16", keywords: ["H20H! LIMÃO"] },
    { name: "H2O limoneto 500ml", date: "2026-03-12", keywords: ["H20H! LIMONETO"] },
    { name: "Lemon fresh 500ml", date: "2026-04-10", keywords: ["SPRITE LEMON FRESH"] },
    { name: "GATORADE morango", date: "2026-06-01" },
    { name: "GATORADE limão", date: "2026-05-31" },
    { name: "GATORADE laranja", date: "2026-04-19" },
    { name: "Del VALLE 500ml laranja", date: "2026-03-21", keywords: ["SUCO DEL VALLE LARANJA"] },
    { name: "Del VALLE 500ml uva", date: "2026-04-04", keywords: ["SUCO DEL VALLE UVA"] },
    { name: "Coca 2,5", date: "2026-04-13", keywords: ["COCA COLA 2,5"] },
    { name: "Coca 2L", date: "2026-04-11", keywords: ["COCA COLA 2L"] },
    { name: "Coca zero 2L", date: "2026-03-25", keywords: ["COCA COLA ZERO 2L"] },
    { name: "Guaraná 2L", date: "2026-07-27", keywords: ["GUARANÁ ANTARCTICA 2L"] },
    { name: "Fanta laranja 2L", date: "2026-03-06" },
    { name: "Fanta uva 2L", date: "2026-05-10" },
    { name: "Pespi 1L", date: "2026-03-16", keywords: ["PEPSI 1L"] },
    { name: "Guaraná zero 1L", date: "2026-05-24" },
    { name: "Coca 1L", date: "2026-04-15", keywords: ["COCA COLA 1L"] },
    { name: "Coca zero 1L", date: "2026-03-01", keywords: ["COCA COLA ZERO 1L"] },
    { name: "Ice vermelha", date: "2026-10-28", keywords: ["CABARÉ FRUTAS VERMELHAS"] },
    { name: "Ice limão", date: "2026-08-15", keywords: ["CABARÉ LIMÃO"] },
    { name: "Ice tropical", date: "2026-10-17", keywords: ["CABARÉ FRUTAS AMARELAS"] },
    { name: "Água tônica", date: "2026-03-15", keywords: ["ÁGUA TÔNICA"] },
    { name: "Red bul", date: "2026-03-13", keywords: ["RED BULL"] },
    { name: "Sprite lata", date: "2026-07-09", keywords: ["SPRITE LATA"] },
    { name: "Fanta uva", date: "2026-05-16", keywords: ["FANTA UVA LATA"] },
    { name: "Fanta laranja", date: "2026-04-13", keywords: ["FANTA LARANJA LATA"] },
    { name: "Heineken lata", date: "2026-06-26", keywords: ["HEINEKEN LATA"] },
    { name: "Itaipava lata", date: "2026-07-15", keywords: ["ITAIPAVA LATA"] },
    { name: "Brahma zero", date: "2026-07-06", keywords: ["BRAHMA ZERO"] },
    { name: "Guaraná lata", date: "2026-05-23", keywords: ["GUARANA LATA"] },
    { name: "Coca zero lata", date: "2026-03-05", keywords: ["COCA COLA ZERO LATA"] },
    { name: "Coca lata", date: "2026-05-27", keywords: ["COCA COLA LATA"] }
];

async function run() {
    console.log('Fetching all products to match names...');
    const { data: products, error } = await supabase.from('products').select('id, name');

    if (error) {
        console.error('Error fetching products', error);
        return;
    }

    console.log(`Found ${products.length} products.`);

    for (const exp of expirations) {
        const match = products.find(p => {
            const lp = p.name.toUpperCase();
            const le = exp.name.toUpperCase();
            if (lp.includes(le) || le.includes(lp)) return true;
            if (exp.keywords) {
                return exp.keywords.some(k => lp.includes(k.toUpperCase()));
            }
            return false;
        });

        if (match) {
            console.log(`Matching "${exp.name}" to product ID ${match.id} ("${match.name}")`);
            const { error: updErr } = await supabase
                .from('products')
                .update({ expiration_date: exp.date })
                .eq('id', match.id);

            if (updErr) {
                console.error(`Error updating ${match.name}:`, updErr.message);
            } else {
                console.log(`Updated ${match.name} with expiration ${exp.date}`);
            }
        } else {
            console.log(`WARNING: Could not find any product matching "${exp.name}"`);
        }
    }
}
run();
