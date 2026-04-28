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
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error) throw error;
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }
  return allData;
}

(async () => {
  console.log('--- INICIANDO AUDITORIA DE DADOS ---\n');

  const sales = await fetchAll('sales');
  const financials = await fetchAll('financials');

  console.log(`Total de Vendas no BD: ${sales.length}`);
  console.log(`Total de Registros Financeiros no BD: ${financials.length}\n`);

  // 1. Auditoria de Totais de Vendas
  let salesWithIncorrectTotals = [];
  let totalRevenueCalculated = 0;
  let totalRevenueInDB = 0;

  sales.forEach(sale => {
    const statusOk = sale.status === 'Completed' || sale.status === 'Finalizado pela Fábrica';
    if (statusOk) {
        totalRevenueInDB += sale.total;
    }

    let itemsSum = 0;
    if (sale.items && Array.isArray(sale.items)) {
      sale.items.forEach(item => {
        itemsSum += (item.quantity * item.priceAtSale);
      });
    }

    // Check for small float differences
    if (Math.abs(itemsSum - sale.total) > 0.05) {
      salesWithIncorrectTotals.push({
        id: sale.id,
        dbTotal: sale.total,
        calculatedTotal: itemsSum,
        diff: itemsSum - sale.total,
        customer: sale.customer_name,
        date: sale.date
      });
    }
  });

  console.log(`Receita Total (Status 'Completed'): R$ ${totalRevenueInDB.toFixed(2)}`);
  console.log(`Vendas com divergência entre Itens e Total: ${salesWithIncorrectTotals.length}`);
  if (salesWithIncorrectTotals.length > 0) {
    console.log('Exemplos de divergência (Top 5):');
    salesWithIncorrectTotals.slice(0, 5).forEach(s => console.log(` - ID: ${s.id}, DB: ${s.dbTotal}, Calc: ${s.calculatedTotal}, Diff: ${s.diff.toFixed(2)}`));
  }
  console.log('');

  // 2. Auditoria de Duplicidade
  let duplicates = [];
  const seen = new Map();

  sales.forEach(sale => {
    // Key: Date + Customer + Total (rounded to 2)
    const key = `${sale.date}_${sale.customer_name}_${sale.total.toFixed(2)}`;
    if (seen.has(key)) {
      duplicates.push({
        key,
        original: seen.get(key),
        duplicate: sale
      });
    } else {
      seen.set(key, sale);
    }
  });

  console.log(`Possíveis vendas duplicadas (mesma data, cliente e valor): ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log('Exemplos de duplicidade (Top 5):');
    duplicates.slice(0, 5).forEach(d => console.log(` - ${d.key} | IDs: ${d.original.id} e ${d.duplicate.id}`));
  }
  console.log('');

  // 3. Auditoria Financeiro vs Vendas
  // No sistema atual, as vendas parecem ser registradas na tabela 'sales' e 
  // as despesas/receitas avulsas na 'financials'. 
  // Vamos ver se existem entradas 'Income' que parecem ser duplicatas de vendas.
  const salesIncomes = financials.filter(f => f.type === 'Income' && f.description.toLowerCase().includes('venda'));
  console.log(`Registros de 'Income' no financeiro que mencionam 'venda': ${salesIncomes.length}`);
  const totalFinancialIncome = financials.filter(f => f.type === 'Income').reduce((acc, f) => acc + f.amount, 0);
  console.log(`Total de Receita no Financeiro (Income): R$ ${totalFinancialIncome.toFixed(2)}`);
  console.log(`Diferença (Vendas Completed - Financeiro Income): R$ ${(totalRevenueInDB - totalFinancialIncome).toFixed(2)}`);
  console.log(`NOTA: Se o sistema não lança vendas automaticamente no financeiro, essa diferença é esperada.\n`);

  // 4. Auditoria de Fiado (Pending)
  const pendingSales = sales.filter(s => s.status === 'Pending');
  const totalPendingValue = pendingSales.reduce((acc, s) => acc + s.total, 0);
  const totalPaidInPending = pendingSales.reduce((acc, s) => acc + (s.amount_paid || 0), 0);
  console.log(`Vendas Pendentes (Fiado): ${pendingSales.length}`);
  console.log(`Valor Total em Aberto (Bruto): R$ ${totalPendingValue.toFixed(2)}`);
  console.log(`Valor já pago em vendas pendentes: R$ ${totalPaidInPending.toFixed(2)}`);
  console.log(`Valor Real a Receber: R$ ${(totalPendingValue - totalPaidInPending).toFixed(2)}\n`);

  console.log('--- FIM DA AUDITORIA ---');
})();
