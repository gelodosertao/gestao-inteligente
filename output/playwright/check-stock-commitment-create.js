async page => {
 await page.getByRole('button',{name:/^Cliente de teste/}).click();
 await page.getByRole('button',{name:/Retirada/}).click();
 await page.getByRole('button',{name:'Registrar pedido',exact:true}).click();
 await page.waitForFunction(()=>window.__commitmentState?.sales.length===2);
 const state=await page.evaluate(()=>window.__commitmentState);
 const sale=state.sales[1];
 if(sale.fulfillment_status!=='committed'||sale.status!=='Pending'||sale.amount_paid!==0||state.products[0].stock_matriz_barreiras!==39||sale.dispatched_at!==null)throw Error('Creation did not commit stock independently');
 return {createdWithoutPayment:true,state:sale.fulfillment_status,paid:sale.amount_paid,stockBefore:40,stockAfter:39,deliveryDate:sale.dispatched_at};
}
