async page => {
 const dialog=page.getByRole('dialog',{name:'Confirmar pagamento',exact:true});
 await dialog.getByRole('checkbox').check();
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(350);
 await page.screenshot({path:'output/playwright/legacy-payment-no-stock-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await dialog.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 const state=await page.evaluate(()=>window.__commitmentState);
 const sale=state.sales[0];
 if(sale.status!=='Completed'||sale.amount_paid!==80||state.products[0].stock_matriz_barreiras!==40||!sale.payment_history.length)throw Error('Historical payment modified stock or failed');
 if(await page.evaluate(()=>window.__stockAlerts.length))throw Error('Unexpected alert');
 await page.screenshot({path:'output/playwright/legacy-payment-confirmed-desktop.png',fullPage:true});
 return {legacyPaid:80,stockBefore:40,stockAfter:state.products[0].stock_matriz_barreiras,historicalDeclaration:true};
}
