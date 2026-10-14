/** Nuuvem public catalog parser: conservative validation and zero dependence on paid services. */
import assert from 'node:assert/strict';
import {nuuvemDeals,steamOffers,epicFree} from '../server/discover-service.js';
const fixture=`<div class="products"><a class="product-card--grid" href="https://www.nuuvem.com/br-pt/item/game-one"><span class="product-card--grid-name">Aventura &amp; Missões</span><div class="discount">-80%</div><s>R$ 199,99</s><strong>R$ 39,99</strong></a><a class="product-card--grid" href="/br-pt/item/game-two"><span class="product-card--grid-name">Truco &amp; Jogos</span><div>-65%</div><s>R$ 100,00</s><strong>R$ 35,00</strong></a></div>`;
const out=nuuvemDeals(fixture);
assert.equal(out.length,2);assert.equal(out[0].title,'Aventura & Missões');assert.equal(out[0].discount,80);assert.equal(out[0].price,'R$ 39,99');assert.equal(out[1].price,'R$ 35,00');
assert.equal(nuuvemDeals(fixture.replaceAll('www.nuuvem.com','evil.com')).length,1,'Must not link to unrelated hosts');
assert.equal(nuuvemDeals('<a href="https://www.nuuvem.com/br-pt/item/test"><h3>Sem desconto</h3><p>R$ 10,00</p></a>').length,0,'Must not manufacture discounts');
assert.equal(nuuvemDeals('<a href="https://evil.com/redirect?next=/item/a"><h3>URL maliciosa</h3><p>-50% R$ 10,00</p></a>').length,0);
const data='<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'Jogo Produto',url:'https://www.nuuvem.com/br-pt/item/json-example',offers:{priceCurrency:'BRL',highPrice:'100',price:'25'}})+'</script>';
assert.equal(nuuvemDeals(data)[0].discount,75);
assert.equal(steamOffers({specials:{items:[{id:2,name:'Teste',discount_percent:60,final_price:1000,currency:'BRL'}]}})[0].source,'Steam');
assert.deepEqual(epicFree({data:{Catalog:{searchStore:{elements:[]}}}}),[]);
console.log('✔ Nuuvem: produtos, preços e URLs estritos; não inventa ofertas; Steam/Epic preservados');
