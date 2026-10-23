async (page) => {
  page.setDefaultTimeout(8000);
  await page.getByPlaceholder('Buscar cliente por nome...').fill('CLIENTE');
  await page.locator('body').ariaSnapshot();
  await page.getByText('CLIENTE TESTE LOCAL',{exact:true}).first().click();
  await page.getByRole('button',{name:'🏪 Retirada',exact:true}).click();
  if (!await page.getByText('Integração fiscal não configurada',{exact:true}).isVisible()) throw new Error('Missing checkout notice');
  const response = page.waitForResponse(response => response.url().includes('/rpc/apply_sale_operation') && response.request().method() === 'POST');
  await page.getByRole('button',{name:'Confirmar Pedido',exact:true}).click();
  await response;
  await page.getByRole('heading',{name:'Pedido Realizado!',exact:true}).waitFor();
  const state = await page.evaluate(() => window.fiscalTestState());
  const sale = state.writes.filter(write => write.p_action === 'create').at(-1).p_payload;
  if (sale.hasInvoice !== false || sale.total !== 6 || sale.nfeStatus !== 'nao_emitir' || sale.customerId !== '44444444-4444-4444-8444-444444444444') throw new Error('Invalid wholesale payload');
  if (state.fiscalRequests.length || state.errors.length) throw new Error('Unexpected fiscal request or browser error');
  await page.screenshot({path:'output/playwright/fiscal-wholesale-sale.png',fullPage:true});
  return {check:'wholesale checkout with mocked management RPC',total:sale.total,hasInvoice:sale.hasInvoice,nfeStatus:sale.nfeStatus,status:sale.status,fiscalRequests:state.fiscalRequests,errors:state.errors};
}