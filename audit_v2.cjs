require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) { console.error('❌ VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY devem estar definidos no .env'); process.exit(1); }
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
  const sales = await fetchAll('sales');
  
  // 1. Exact Timestamp Duplicates
  const tsSeen = new Map();
  const tsDuplicates = [];
  sales.forEach(s => {
    if (s.created_at) {
      if (tsSeen.has(s.created_at)) {
        tsDuplicates.push({ ts: s.created_at, s1: tsSeen.get(s.created_at), s2: s });
      } else {
        tsSeen.set(s.created_at, s);
      }
    }
  });

  console.log(`Vendas com timestamp idêntico: ${tsDuplicates.length}`);
  tsDuplicates.slice(0, 10).forEach(d => console.log(` - TS: ${d.ts} | ID1: ${d.s1.id} | ID2: ${d.s2.id} | Total: ${d.s1.total}`));

  // 2. Cross-reference Sales vs Financials
  const financials = await fetchAll('financials');
  const financialSalesRefs = financials.filter(f => f.description.includes('#')).map(f => {
    const match = f.description.match(/#([a-f0-9-]+)/);
    return match ? { id: match[1], amount: f.amount } : null;
  }).filter(Boolean);

  const missingFinancials = sales.filter(s => (s.status === 'Completed' || s.status === 'Finalizado pela Fábrica') && !financialSalesRefs.some(f => f.id === s.id));
  console.log(`Vendas Concluídas SEM registro no Financeiro: ${missingFinancials.length}`);
  
  // 3. Totals Audit with items
  let itemSumMismatch = 0;
  sales.forEach(s => {
    let sum = 0;
    (s.items || []).forEach(i => sum += (i.quantity * i.priceAtSale));
    // Include delivery fee if exists
    sum += (s.delivery_fee || 0);
    // Note: discount might be applied but not stored per item. 
    // If sum is greater than total, it might be a discount.
    if (Math.abs(sum - s.total) > 0.05) {
        itemSumMismatch++;
    }
  });
  console.log(`Vendas com divergência Itens vs Total (considerando taxa entrega): ${itemSumMismatch}`);

})();
