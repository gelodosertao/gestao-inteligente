async page => {
  if (!await page.getByRole('heading', { name: 'Registrar Perda de Estoque' }).count()) await page.getByRole('button', { name: 'Registrar Perda', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Depósito da Perda' }).selectOption('Barreiras');
  await page.getByRole('spinbutton').fill('5');
  await page.evaluate(() => { window.__stockFail = true; });
  let dialogMessage;
  page.once('dialog', async dialog => { dialogMessage = dialog.message(); await dialog.accept(); });
  await page.getByRole('button', { name: 'Confirmar Perda', exact: true }).click();
  await page.waitForTimeout(500);
  if (!await page.getByRole('heading', { name: 'Registrar Perda de Estoque' }).isVisible()) throw new Error('Falha fechou formulário');
  const firstId = await page.evaluate(() => window.__stockRequests.at(-1).body.p_operation.operationId);
  page.once('dialog', async dialog => { dialogMessage = dialog.message(); await dialog.accept(); });
  await page.getByRole('button', { name: 'Confirmar Perda', exact: true }).click();
  await page.waitForTimeout(700);
  const last = await page.evaluate(() => window.__stockRequests.at(-1).body.p_operation);
  if (last.operationId !== firstId || last.deposit !== 'Barreiras' || last.quantity !== 5) throw new Error('Retry ou depósito incorreto');
  const row = page.getByRole('row').filter({ hasText: 'ID: ice' });
  if (!await row.getByRole('cell', { name: '35 un', exact: true }).count()) throw new Error('Não atualizou Barreiras');
  if (!await row.getByRole('cell', { name: '100 un', exact: true }).count()) throw new Error('Alterou Ibotirama indevidamente');
  console.log(JSON.stringify({ flow: 'loss', deposit: last.deposit, quantity: last.quantity, retryReusedOperation: true, failurePreservedForm: true, ibotirama: 100, barreiras: 35, dialogMessage }));
}
