async page => {
  await page.unrouteAll({ behavior: 'wait' });
  await page.addInitScript(() => { window.__stockAlerts = []; window.alert = message => window.__stockAlerts.push(message); });
  const tenant = '11111111-1111-4111-8111-111111111111';
  const date = new Date().toISOString().slice(0, 10);
  const products = [
    { id: 'ice', name: 'Gelo Cubo 5kg', category: 'Gelo Cubo', unit: 'un', price_matriz: 8, price_filial: 10, cost: 3, min_stock: 0, stock_matriz_ibotirama: 100, stock_matriz_barreiras: 40, stock_filial: 664, recipe: [{ ingredientId: 'bag', quantity: 1 }], recipe_batch_size: 1, tenant_id: tenant },
    { id: 'bag', name: 'Embalagem 5kg', category: 'Insumo (Matéria-prima)', unit: 'un', price_matriz: 1, price_filial: 1, cost: 0.5, min_stock: 0, stock_matriz_ibotirama: 20, stock_matriz_barreiras: 0, stock_filial: 0, recipe: [], tenant_id: tenant },
  ];
  const sales = [{ id: '33333333-3333-4333-8333-333333333333', date, customer_name: 'Cliente de teste', customer_id: 'client', total: 80, items: [{ productId: 'ice', productName: products[0].name, quantity: 10, priceAtSale: 8 }], branch: 'Matriz (Fábrica)', source: 'ATACADO', matriz_deposit: 'Barreiras', status: 'Pending', amount_paid: 0, payment_history: [], fulfillment_status: null, revision: 0, payment_method: 'Pix', has_invoice: false }];
  const movements = [];
  const field = deposit => deposit === 'Ibotirama' ? 'stock_matriz_ibotirama' : deposit === 'Barreiras' ? 'stock_matriz_barreiras' : 'stock_filial';
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (!url.pathname.startsWith('/rest/v1/')) return route.abort();
    const path = url.pathname.slice('/rest/v1/'.length);
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (route.request().method() === 'OPTIONS') return respond(null);
    if (path.startsWith('rpc/')) {
      const body = route.request().postDataJSON();
      await page.evaluate(({ path, body }) => { window.__stockRequests = [...(window.__stockRequests || []), { path, body }]; }, { path, body });
      const shouldFail = await page.evaluate(() => { const fail = window.__stockFail; window.__stockFail = false; return fail; });
      if (shouldFail) return respond({ message: 'Falha simulada para validar preservação do formulário' }, 500);
      await new Promise(resolve => setTimeout(resolve, 350));
      if (path === 'rpc/mutate_inventory_stock') {
        const op = body.p_operation;
        const product = products.find(product => product.id === op.productId);
        const deposit = op.deposit || op.fromDeposit;
        const before = product[field(deposit)];
        if (op.action === 'adjust' && before !== op.expectedStock) return respond({ message: 'O saldo mudou durante a conferência.' }, 409);
        if (op.action === 'adjust') product[field(deposit)] = op.quantity;
        else product[field(deposit)] -= op.quantity;
        if (op.action === 'transfer') product[field(op.toDeposit)] += op.quantity;
        movements.push({ id: op.operationId, date: new Date().toISOString(), product_id: product.id, product_name: product.name, quantity: op.action === 'adjust' ? op.quantity - before : op.quantity, type: op.action === 'loss' ? 'LOSS' : op.action === 'adjust' ? 'ADJUSTMENT' : 'TRANSFER_OUT', reason: op.reason, branch: deposit === 'Filial' ? 'Filial (Adega)' : 'Matriz (Fábrica)', matriz_deposit: deposit, operation_id: op.operationId, stock_before: before, stock_after: product[field(deposit)], responsible: 'Operador de teste' });
      }
      if (path === 'rpc/receive_inventory_xml') {
        for (const item of body.p_items) {
          const product = products.find(product => product.id === item.productId);
          if (!product) return respond({ message: 'Produto de teste não cadastrado.' }, 400);
          const stockField = field(body.p_deposit);
          const before = product[stockField];
          product[stockField] += item.quantity;
          movements.push({ id: body.p_operation_id + ':' + product.id, date: new Date().toISOString(), product_id: product.id, product_name: product.name, quantity: item.quantity, type: 'ENTRY', event_type: 'receipt', reason: 'Recebimento XML ' + body.p_invoice_key, branch: body.p_deposit === 'Filial' ? 'Filial (Adega)' : 'Matriz (Fábrica)', matriz_deposit: body.p_deposit, stock_before: before, stock_after: product[stockField], operation_id: body.p_operation_id, responsible: 'Operador de teste' });
        }
      }
      if (path === 'rpc/apply_sale_operation') {
        const sale = body.p_payload;
        const stored = sales.find(item => item.id === body.p_sale_id);
        if (stored && stored.revision !== sale.revision) return respond({ message: 'Pedido atualizado por outro operador.' }, 409);
        if (!stored && body.p_action === 'create') {
          for (const item of sale.items) products.find(product => product.id === item.productId)[field(sale.matrizDeposit)] -= item.quantity;
        }
        const row = { ...stored, id: sale.id, date: sale.date, customer_name: sale.customerName, total: sale.total, items: sale.items, branch: sale.branch, source: sale.source, matriz_deposit: sale.matrizDeposit, status: sale.status, amount_paid: sale.amountPaid, payment_history: sale.paymentHistory || [], fulfillment_status: sale.fulfillmentStatus, revision: (stored?.revision || 0) + 1, payment_method: sale.paymentMethod, has_invoice: false, dispatched_at: null };
        if (stored) Object.assign(stored, row); else sales.push(row);
      }
      await page.evaluate(state => { window.__commitmentState = state; }, { products, sales, movements });
      return respond(null);
    }
    if (path === 'products') {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        await page.evaluate(body => { window.__stockRequests = [...(window.__stockRequests || []), { path: 'products', body }]; }, body);
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');
        const product = products.find(product => product.id === id);
        if (product) Object.assign(product, body);
      }
      return respond(products);
    }
    if (path === 'sales') return respond(sales);
    if (path === 'stock_movements') return respond(movements);
    if (path === 'app_users') return respond([]);
    return respond([]);
  });
  await page.goto('http://127.0.0.1:5191/output/playwright/stock-harness.html?view=wholesale');
  await page.evaluate(() => { window.__stockAlerts = []; window.alert = message => window.__stockAlerts.push(message); });
}
