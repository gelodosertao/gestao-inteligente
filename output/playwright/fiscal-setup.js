async (page) => {
  const origin = 'http://127.0.0.1:4173';
  const user = {"id": "11111111-1111-4111-8111-111111111111", "aud": "authenticated", "role": "authenticated", "email": "fiscal-test@example.invalid", "app_metadata": {}, "user_metadata": {}};
  const tenant = '22222222-2222-4222-8222-222222222222';
  const profile = { ...user, name: 'ADMIN TESTE LOCAL', tenant_id: tenant, is_active: true, must_change_password: false, role: 'ADMIN', allowed_modules: [], tenants: { name: 'DEMONSTRAÇÃO ISOLADA' } };
  const today = new Date().toISOString().slice(0, 10);
  const product = { id: '33333333-3333-4333-8333-333333333333', name: 'GELO TESTE LOCAL', category: 'Gelo Cubo', price_matriz: 6, price_filial: 8, cost: 3, stock_matriz_ibotirama: 100, stock_matriz_barreiras: 100, stock_filial: 100, min_stock: 2, unit: 'un', is_stock_controlled: true };
  const customer = { id: '44444444-4444-4444-8444-444444444444', name: 'CLIENTE TESTE LOCAL', phone: '00000000000', address: 'Rua Teste, 1', city: 'Ibotirama', state: 'BA', branch: 'Matriz (Fábrica)', tenant_id: tenant };
  const historical = { id: '55555555-5555-4555-8555-555555555555', date: today, created_at: new Date().toISOString(), customer_id: customer.id, customer_name: customer.name, total: 12, amount_paid: 12, branch: 'Matriz (Fábrica)', status: 'Completed', payment_method: 'Pix', has_invoice: true, nfe_status: 'autorizada', nfe_number: '123', nfe_series: '2', nfe_environment: 2, nfe_protocol: 'TEST-PROTOCOL-123', invoice_key: 'TEST-ACCESS-KEY', nfe_xml: '<nfe>XML TESTE LOCAL ARMAZENADO</nfe>', items: [{productId: product.id, productName: product.name, quantity: 2, priceAtSale: 6}] };
  const rows = { products: [product], customers: [customer], sales: [historical], financials: [], cash_closings: [], orders: [], categories: [], stock_movements: [], production: [] };
  const state = { requests: [], fiscalRequests: [], writes: [], errors: [] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.exposeFunction('fiscalTestState', () => state);
  await page.addInitScript(({key, session}) => { localStorage.setItem('security_session_version','security-p0-v1'); localStorage.setItem(key,JSON.stringify(session)); }, { key: "sb-licetziylggxtnoutjkn-auth-token", session: {"access_token": "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIiwgImV4cCI6IDE3OTI3Njg4NTcsICJyb2xlIjogImF1dGhlbnRpY2F0ZWQifQ.unsigned-test-only", "refresh_token": "test-only-refresh", "token_type": "bearer", "expires_in": 7200, "expires_at": 1792768857, "user": {"id": "11111111-1111-4111-8111-111111111111", "aud": "authenticated", "role": "authenticated", "email": "fiscal-test@example.invalid", "app_metadata": {}, "user_metadata": {}}} });
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    const path = url.pathname;
    state.requests.push({method: request.method(), path});
    if (url.port === '3001' || path.includes('/api/nfe') || path.includes('nfe_drafts')) {
      state.fiscalRequests.push(path);
      return route.fulfill({status: 503, json: {error: 'FISCAL API MUST NOT BE CALLED'}});
    }
    if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers: {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
    if (path.startsWith('/rest/v1/')) {
      const table = path.slice('/rest/v1/'.length);
      if (table === 'app_users') return route.fulfill({json: request.headers()['accept']?.includes('object') ? profile : [profile]});
      if (table === 'rpc/apply_sale_operation') {
        const body = request.postDataJSON(); state.writes.push(body);
        const sale = body.p_payload;
        rows.sales.push({id: sale.id, date: sale.date, created_at: new Date().toISOString(), customer_name: sale.customerName, customer_id: sale.customerId, total: sale.total, items: sale.items, branch: sale.branch, status: sale.status, payment_method: sale.paymentMethod, has_invoice: sale.hasInvoice, nfe_status: sale.nfeStatus, amount_paid: sale.amountPaid});
        return route.fulfill({json: {operationId: body.p_operation_id, saleId: body.p_sale_id, action: body.p_action, status: sale.status}});
      }
      if (request.method() !== 'GET') { state.writes.push({table,body:request.postDataJSON()}); return route.fulfill({json: []}); }
      return route.fulfill({json: rows[table] || []});
    }
    if (path.startsWith('/auth/v1/')) return route.fulfill({json: user});
    return route.fulfill({status:204});
  });
  await page.goto(origin + '/gestao/emissor');
  await page.getByRole('heading', {name: 'Integração fiscal', exact: true}).waitFor();
  console.log('Built app loaded with isolated mocked session and network; no remote writes.');
}