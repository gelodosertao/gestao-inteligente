async (page) => {
  page.setDefaultTimeout(8000);
  await page.goto('http://127.0.0.1:4173/pdv-adega');
  await page.getByRole('button',{name:'GELO TESTE LOCAL R$ 8,00',exact:true}).click();
  await page.locator('body').ariaSnapshot();
  await page.getByRole('button',{name:'Confirmar Valor',exact:true}).click();
  await page.locator('body').ariaSnapshot();
  await page.getByRole('button',{name:'Pagar Agora',exact:true}).click();
  await page.locator('body').ariaSnapshot();
  await page.getByRole('button',{name:'PIX',exact:true}).click();
  const response = page.waitForResponse(response => response.url().includes('/rpc/apply_sale_operation') && response.request().method() === 'POST');
  await page.getByRole('button',{name:'Confirmar Pagamento',exact:true}).click();
  await response;
  await page.getByRole('heading',{name:'Venda Concluída!',exact:true}).waitFor();
  if (!await page.getByText('COMPROVANTE NÃO FISCAL',{exact:true}).first().isVisible()) throw new Error('Non fiscal receipt missing');
  if (await page.getByText('Autorizando NFC-e junto à SEFAZ',{exact:true}).count()) throw new Error('Fiscal simulation remains');
  const state = await page.evaluate(() => window.fiscalTestState());
  const sale = state.writes.filter(write => write.p_action === 'create').at(-1).p_payload;
  if (sale.hasInvoice !== false || sale.total !== 8 || sale.items.length !== 1) throw new Error('Invalid retail sale payload');
  if (state.fiscalRequests.length || state.errors.length) throw new Error('Unexpected fiscal request or browser error');
  await page.screenshot({path:'output/playwright/fiscal-retail-sale.png',fullPage:true});
  await page.goto('http://127.0.0.1:4173/pdv-atacado');
  await page.getByText('GELO TESTE LOCAL',{exact:true}).waitFor();
  return {check:'retail checkout with mocked management RPC',total:sale.total,hasInvoice:sale.hasInvoice,nonFiscalReceipt:true,fiscalRequests:state.fiscalRequests,errors:state.errors};
}