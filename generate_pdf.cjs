const { createClient } = require('@supabase/supabase-js');
const { jsPDF } = require('jspdf');
const fs = require('fs');

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
  console.log('Gerando PDF de Auditoria...');
  const sales = await fetchAll('sales');
  
  const discrepancies = [];
  sales.forEach(s => {
    let sum = 0;
    (s.items || []).forEach(i => sum += (i.quantity * i.priceAtSale));
    sum += (s.delivery_fee || 0);
    
    if (Math.abs(sum - s.total) > 0.05) {
      discrepancies.push({
        id: s.id.substring(0,8),
        date: s.date,
        customer: s.customer_name,
        total: s.total,
        calculated: sum,
        diff: sum - s.total
      });
    }
  });

  // Sort by diff magnitude
  discrepancies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(18);
  doc.text('Gelo do Sertao - Relatorio de Auditoria', 14, 20);
  doc.setFontSize(11);
  doc.text(`Vendas com divergencia de valor (Total: ${discrepancies.length})`, 14, 30);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 35);

  // Table Header
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ID', 14, 45);
  doc.text('Data', 35, 45);
  doc.text('Cliente', 60, 45);
  doc.text('Total DB', 110, 45);
  doc.text('Calc.', 135, 45);
  doc.text('Dif.', 160, 45);
  
  doc.line(14, 47, 200, 47);
  doc.setFont('helvetica', 'normal');

  let y = 55;
  discrepancies.forEach((s, i) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(s.id, 14, y);
    doc.text(s.date, 35, y);
    doc.text(s.customer.substring(0, 20), 60, y);
    doc.text(`R$ ${s.total.toFixed(2)}`, 110, y);
    doc.text(`R$ ${s.calculated.toFixed(2)}`, 135, y);
    doc.text(`R$ ${s.diff.toFixed(2)}`, 160, y);
    y += 8;
  });

  const pdfData = doc.output();
  fs.writeFileSync('relatorio_auditoria.pdf', pdfData, 'binary');
  
  console.log('PDF gerado com sucesso: relatorio_auditoria.pdf');
})();
