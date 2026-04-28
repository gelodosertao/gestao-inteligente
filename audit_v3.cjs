const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://licetziylggxtnoutjkn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpY2V0eml5bGdneHRub3V0amtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODQ2OTUsImV4cCI6MjA4MDI2MDY5NX0.olJiaq0HKZ3-DQlLjzBxodob9vaAxX2v9SaEmIRtO4w';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchAll(tableName) {
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase.from(tableName).select('*').range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < pageSize) hasMore = false; else page++;
    } else hasMore = false;
  }
  return allData;
}

(async () => {
  const financials = await fetchAll('financials');
  const counts = {};
  const dups = [];
  financials.forEach(d => {
    const match = d.description.match(/#([a-f0-9-]+)/);
    if (match) {
      const id = match[1];
      counts[id] = (counts[id] || 0) + 1;
      if (counts[id] === 2) dups.push({id, desc: d.description, amount: d.amount});
    }
  });
  console.log(`Vendas duplicadas no Financeiro (mesmo ID de venda): ${dups.length}`);
  dups.slice(0, 5).forEach(d => console.log(` - ID: ${d.id} | Desc: ${d.desc} | Amount: ${d.amount}`));
})();
