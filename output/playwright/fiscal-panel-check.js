async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  assert(await page.getByText('Integração fiscal não configurada', {exact:true}).isVisible(), 'Missing disabled state');
  assert(await page.getByRole('link',{name:'Integração fiscal',exact:true}).getAttribute('href') === '/gestao/emissor', 'Menu must use internal route');
  await page.getByText('CLIENTE TESTE LOCAL · Venda #55555555',{exact:true}).click();
  assert(await page.getByText('TEST-PROTOCOL-123',{exact:true}).isVisible(), 'Stored protocol missing');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button',{name:'Baixar XML já armazenado'}).click();
  const download = await downloaded;
  await download.saveAs('output/playwright/fiscal-stored-xml.xml');
  await page.screenshot({path:'output/playwright/fiscal-panel.png', fullPage:true});
  const state = await page.evaluate(() => window.fiscalTestState());
  assert(state.fiscalRequests.length === 0, 'Unexpected fiscal request');
  assert(state.errors.length === 0, 'Browser error: '+state.errors.join(';'));
  console.log(JSON.stringify({checks:['disabled state','internal route','stored history','stored XML download'], fiscalRequests:state.fiscalRequests.length, errors:state.errors}));
}