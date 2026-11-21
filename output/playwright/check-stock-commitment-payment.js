async page => {
 await page.goto('http://127.0.0.1:5191/output/playwright/stock-harness.html?view=wholesale');
 await page.getByRole('button',{name:'Vendas',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Confirmar pagamento',exact:true});
 if(await dialog.getByRole('checkbox').count())throw Error('New order offers historical bypass');
 if(!await dialog.getByRole('combobox').isDisabled())throw Error('Committed origin can change');
 await page.setViewportSize({width:390,height:844});
 const button=dialog.getByRole('button',{name:'Confirmar pagamento',exact:true});
 await button.scrollIntoViewIfNeeded();
 await page.screenshot({path:'output/playwright/stock-commitment-payment-mobile.png',fullPage:true});
 await button.click();
 await dialog.waitFor({state:'hidden'});
 const state=await page.evaluate(()=>window.__commitmentState);
 const sale=state.sales[1];
 if(sale.amount_paid!==8||sale.status!=='Completed'||sale.fulfillment_status!=='committed'||state.products[0].stock_matriz_barreiras!==39)throw Error('Payment changed commitment stock');
 return {paid:8,stockBeforePayment:39,stockAfterPayment:39,deliveryStillUnconfirmed:sale.dispatched_at===null,mobileButtonAccessible:true};
}
