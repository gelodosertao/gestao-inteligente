async page => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (!await page.getByRole('heading', { name: 'Editar Produto', exact: true }).count()) await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const text = await page.locator('body').innerText();
  const values = await page.locator('input').evaluateAll(inputs => inputs.map(input => input.value));
  if (/filial/i.test(text) || values.includes('664')) throw new Error('Filial ainda aparece no cadastro atual');
  if (!text.includes('MAT. IBOTIRAMA') || !text.includes('MAT. BARREIRAS')) throw new Error('Depósitos atuais ausentes');
  await page.getByText('MAT. IBOTIRAMA', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/factory-product-edit-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('MAT. IBOTIRAMA', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/factory-product-edit-mobile.png' });
  await page.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => window.__stockRequests.filter(item => item.path === 'products').at(-1)?.body);
  if (!saved || 'stock_filial' in saved || 'stock_matriz_ibotirama' in saved || saved.price_filial !== 10) throw new Error('Edição alterou saldos ou perdeu preço legado');
  await page.getByRole('tab', { name: 'Estoque de insumos', exact: true }).click();
  if (!await page.getByRole('cell', { name: 'Embalagem 5kg ID: bag' }).count()) throw new Error('Insumo não aparece no grupo');
  if (await page.getByRole('cell', { name: 'Gelo Cubo 5kg ID: ice' }).count()) throw new Error('Gelo misturado com insumos');
  if (!await page.getByRole('columnheader', { name: 'Custo unitário', exact: true }).count()) throw new Error('Insumos sem custo próprio');
  await page.screenshot({ path: 'output/playwright/factory-inputs-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'output/playwright/factory-inputs-desktop.png', fullPage: true });
  return { groupsSeparated: true, activeDeposits: ['Ibotirama', 'Barreiras'], filialFieldRemoved: true, catalogueUpdatePreservesHistoricBalances: true, inputsShowCost: true };
}
