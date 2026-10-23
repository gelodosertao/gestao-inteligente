async (page) => {
  await page.getByRole('button',{name:'Adicionar',exact:true}).click();
  await page.locator('body').ariaSnapshot();
  await page.getByRole('button',{name:'Avançar',exact:true}).click();
  return await page.locator('body').ariaSnapshot();
}