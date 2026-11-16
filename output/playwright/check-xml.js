async page => {
  const dialog = page.getByRole('dialog', { name: 'Receber compra por XML' });
  await dialog.getByRole('combobox', { name: 'Depósito de recebimento' }).selectOption('Ibotirama');
  await dialog.getByRole('combobox', { name: 'Produto do estoque — item 1' }).selectOption('bag');
  await dialog.getByRole('spinbutton', { name: 'Quantas unidades de estoque correspondem a 1 CX da nota?' }).fill('10');
  await dialog.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
  await page.waitForTimeout(650);
  const receipt = await page.evaluate(() => window.__stockRequests.at(-1).body);
  if (receipt.p_deposit !== 'Ibotirama' || receipt.p_items.length !== 1 || receipt.p_items[0].productId !== 'bag' || receipt.p_items[0].quantity !== 20) throw new Error('Recebimento não respeitou vínculo/conversão/depósito');
  if (await dialog.count()) throw new Error('Recebimento não confirmou');
  const row = page.getByRole('row').filter({ hasText: 'ID: bag' });
  if (!await row.getByRole('cell', { name: '40 un', exact: true }).count()) throw new Error('Entrada XML não refletida');
  return { xml: 'passed', parsedInBrowser: true, quantity: 20, supplierScoped: receipt.p_items[0].supplierCode, deposit: receipt.p_deposit, bagStock: 40 };
}
