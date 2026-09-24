const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('BinnenApp.html','utf8'),mobile=fs.readFileSync('mobiel/app.js','utf8');
for (const s of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(s[1]);
new vm.Script(mobile.replace(/^import .*;\r?\n/,''));
const desktop=html.slice(html.indexOf('function getVoorraadTekorten()'),html.indexOf('function updateAanvulKnop()'));
const mob=mobile.slice(mobile.indexOf('function voorraadAanvullen()'),mobile.indexOf('// ── Navigatie'));
for(const [stock,min,target,pack,expected] of [[5,6,10,1,1],[6,6,10,1,0],[8,6,10,1,0],[5,6,10,4,4],[0,6,10,1,6],[0,0,10,1,0],[5,6,undefined,1,1]]) {
 const d=vm.createContext({SHOP_ITEMS:[{voorraad:stock,minVoorraad:min,aanvulVoorraad:target}],isShopItemAvailable:()=>true,getCartStep:()=>pack});
 vm.runInContext(desktop,d);
 assert.equal(vm.runInContext('getVoorraadTekorten()[0]?.aantal || 0',d),expected);
 const staat={producten:[{id:1,stock,min_stock:min,target_stock:target}],wagen:{}};
 const m=vm.createContext({staat,stap:()=>pack,wagenOpslaan(){},badges(){},melden(){}});
 vm.runInContext(mob,m);vm.runInContext('voorraadAanvullen()',m);
 assert.equal(staat.wagen[1]||0,expected);
 vm.runInContext('voorraadAanvullen()',m);assert.equal(staat.wagen[1]||0,expected);
 staat.wagen[1]=100;vm.runInContext('voorraadAanvullen()',m);assert.equal(staat.wagen[1],100);
}
console.log('GESLAAGD: aanvullen tot minimum op desktop en mobiel; oude aanvulvoorraad genegeerd, verpakking afronden en geen dubbele wagenaantallen.');
