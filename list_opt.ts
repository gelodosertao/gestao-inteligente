import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://licetziylggxtnoutjkn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpY2V0eml5bGdneHRub3V0amtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODQ2OTUsImV4cCI6MjA4MDI2MDY5NX0.olJiaq0HKZ3-DQlLjzBxodob9vaAxX2v9SaEmIRtO4w';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOptions() {
    const { data: p } = await supabase.from('products').select('*').eq('name', 'CAIPIRINHA DE MORANGO 700ml').single();
    console.log(JSON.stringify(p.options, null, 2));
}

checkOptions();
