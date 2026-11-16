async page => {
  const button = page.getByRole('button', { name: 'Confirmar pedido', exact: true });
  if (await page.getByRole('button', { name: 'Confirmar saída', exact: true }).count()) throw new Error('Etapa separada de saída ainda visível');
  const color = await button.evaluate(element => getComputedStyle(element).backgroundColor);
  const [red, green, blue] = color.match(/\d+/g).map(Number);
  if (!(green > red && green > blue)) throw new Error('Botão de confirmação não está verde: ' + color);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'output/playwright/order-confirmation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/order-confirmation-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await button.click();
  return { label: 'Confirmar pedido', background: color, separateDispatchRemoved: true };
}
