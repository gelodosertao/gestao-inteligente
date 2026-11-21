async (page) => {
  page.setDefaultTimeout(8000);
  await page.goto('http://127.0.0.1:4173/pdv-adega');
  await page.getByRole('button',{name:'GELO TESTE LOCAL R$ 8,00',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar Valor',exact:true}).click();
  await page.getByRole('button',{name:'Pagar Agora',exact:true}).click();
  await page.getByRole('button',{name:'PIX',exact:true}).click();
  await page.route('**/rest/v1/rpc/apply_sale_operation', route => route.fulfill({status:409,json:{code:'TEST_FAILURE',message:'Falha simulada apenas na persistência da gestão'}}));
  page.once('dialog', dialog => dialog.dismiss());
  const response = page.waitForResponse(response => response.url().includes('/rpc/apply_sale_operation') && response.request().method() === 'POST');
  await page.getByRole('button',{name:'Confirmar Pagamento',exact:true}).click();
  await response;
  await page.getByRole('button',{name:'Confirmar Pagamento',exact:true}).waitFor();
  if (await page.getByRole('heading',{name:'Venda Concluída!',exact:true}).count()) throw new Error('False sale success');
  await page.screenshot({path:'output/playwright/fiscal-sale-failure.png',fullPage:true});
  await page.unroute('**/rest/v1/rpc/apply_sale_operation');
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:4173/gestao/emissor');
  await page.getByRole('heading',{name:'Integração fiscal',exact:true}).waitFor();
  if (!await page.getByText('Integração fiscal não configurada',{exact:true}).isVisible()) throw new Error('Mobile state missing');
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile overflow');
  await page.screenshot({path:'output/playwright/fiscal-mobile.png',fullPage:true});
  const state = await page.evaluate(() => window.fiscalTestState());
  if (state.fiscalRequests.length || state.errors.length) throw new Error('Unexpected fiscal request or browser error');
  return {checks:['failed management RPC does not show success','mobile fiscal panel without overflow'],fiscalRequests:state.fiscalRequests,errors:state.errors};
}