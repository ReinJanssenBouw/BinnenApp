const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require('node:path').join(__dirname, '../BinnenApp.html'), 'utf8');
assert.match(html, /const STOCK = \[\];/);
assert.match(html, /id="shopGrid"><\/div>/);
assert.match(html, /id="shopFilters"><\/div>/);
for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
const source = html.slice(html.indexOf("let _lastStockHash = ''"), html.indexOf('function normalizeSharePointCartItem'));
const stock = [{naam:'oud'}];
let articles = [{naam:'oud'}], renders = 0, fail = false;
const context = vm.createContext({
  hasSharePointUrl:()=>true, stockRefreshBusy:false, document:{hidden:false},
  postSharePoint:async()=>{if(fail) throw Error('offline'); return {items:[]};},
  getSharePointStockItems:data=>data.items, lastStockRefreshAt:0, currentPage:'winkelwagen',
  normalizeSharePointArticle:row=>row, normalizeSharePointStock:row=>row,
  replaceShopItemsFromSharePoint:items=>{articles=items;}, STOCK:stock,
  isQtyInputEditing:()=>false, renderShop:()=>renders++, renderVoorraad:()=>renders++,
  renderDashboard:()=>renders++, console:{warn:()=>{}},
});
vm.runInContext(source, context);
(async()=>{
  await vm.runInContext('refreshStockFromSharePoint(true)', context);
  assert.equal(articles.length,0); assert.equal(stock.length,0); assert.equal(renders,1);
  articles=[{naam:'bestaand'}]; stock.push({naam:'bestaand'}); fail=true;
  await vm.runInContext('refreshStockFromSharePoint(true)',context);
  assert.equal(articles.length,1); assert.equal(stock.length,1);
  assert.equal(context.stockRefreshBusy,false);
  console.log('GESLAAGD: lege serverlijst wist oude artikelen en rendert; netwerkfout bewaart data; geen voorbeeldvoorraad of opgeslagen artikelkaarten.');
})().catch(error=>{console.error(error);process.exitCode=1;});
