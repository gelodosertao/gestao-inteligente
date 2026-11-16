async page => {
  await page.getByRole('combobox', { name: 'Produto Fabricado' }).selectOption('ice');
  await page.getByRole('spinbutton', { name: 'Quantidade Produzida' }).fill('41');
  if (!await page.getByRole('button', { name: 'Confirmar Produção', exact: true }).isDisabled()) throw new Error('Produção insuficiente não bloqueada');
  const content = await page.locator('body').innerText();
  if (!content.includes('Disponível em Ibotirama: 40') || !content.includes('Falta: 1 un')) throw new Error('Falta do insumo não foi explicada');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/production-shortage-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { productionShortage: 'passed', required: 41, available: 40, shortage: 1, confirmDisabled: true };
}
