async page => {
  const modal = page.getByRole('dialog', { name: 'Ajustar inventário físico' });
  await modal.getByRole('combobox', { name: 'Depósito', exact: true }).selectOption('Barreiras');
  await modal.getByRole('spinbutton', { name: 'Quantidade contada (un)' }).fill('23');
  await modal.getByRole('textbox', { name: 'Motivo do ajuste' }).fill('Contagem física de conferência');
  await modal.getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
  await page.waitForTimeout(650);
  const op = await page.evaluate(() => window.__stockRequests.at(-1).body.p_operation);
  if (op.action !== 'adjust' || op.deposit !== 'Barreiras' || op.expectedStock !== 40 || op.quantity !== 23) throw new Error('Ajuste sem snapshot de conferência');
  if (await modal.count()) throw new Error('Ajuste não fechou após confirmação');
  const row = page.getByRole('row').filter({ hasText: 'ID: ice' });
  if (!await row.getByRole('cell', { name: '23 un', exact: true }).count()) throw new Error('Saldo contado não confirmado');
  return { adjustment: 'passed', expectedStock: 40, counted: 23, deposit: 'Barreiras' };
}
