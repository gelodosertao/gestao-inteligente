async page => {
  const before = await page.evaluate(() => (window.__stockRequests || []).length);
  await page.getByRole('combobox', { name: 'Origem', exact: true }).selectOption('Barreiras');
  await page.getByRole('combobox', { name: 'Destino', exact: true }).selectOption('Ibotirama');
  await page.getByRole('spinbutton', { name: 'Quantidade a Transferir (un)' }).fill('-5');
  await page.getByRole('button', { name: 'Confirmar Transferência', exact: true }).click();
  if (await page.evaluate(() => (window.__stockRequests || []).length) !== before) throw new Error('Transferência negativa enviada');
  await page.getByRole('spinbutton', { name: 'Quantidade a Transferir (un)' }).fill('10');
  await page.getByRole('button', { name: 'Confirmar Transferência', exact: true }).click();
  await page.waitForTimeout(650);
  const row = page.getByRole('row').filter({ hasText: 'ID: ice' });
  if (!await row.getByRole('cell', { name: '110 un', exact: true }).count() || !await row.getByRole('cell', { name: '25 un', exact: true }).count()) throw new Error('Saldos da transferência incorretos');
  await page.evaluate(() => { window.__stockChecks = [...(window.__stockChecks || []), 'Transferência: negativo bloqueado; Barreiras 35→25; Ibotirama 100→110']; });
  return { transfer: 'passed', negativeRejected: true, ibotirama: 110, barreiras: 25 };
}
