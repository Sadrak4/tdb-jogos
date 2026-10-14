/** Free, opt-in data feed for the TDB home. No keys, paid APIs, cron or AI.
 * Steam/Epic storefront endpoints are public but not contractually guaranteed;
 * failed sources are omitted rather than inventing offers. Never proxy media.
 */
const TTL_MS=45*60*1000;
const STALE_MS=24*60*60*1000;
let cache=null;
let pending=null;
const fallbackLinks=[
  {name:'Ofertas Steam',url:'https://store.steampowered.com/specials/',kind:'steam'},
  {name:'Jogos grátis Epic',url:'https://store.epicgames.com/pt-BR/free-games',kind:'epic'},
  {name:'Xbox Wire',url:'https://news.xbox.com/pt-br/',kind:'news'},
  {name:'Ofertas Nuuvem',url:'https://www.nuuvem.com/br-pt/catalog/price/promo/sort/discount/sort-mode/desc',kind:'nuuvem'}
];
const text=(v,max=180)=>String(v??'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,max);
const safeLink=(value,hosts)=>{try{const u=new URL(value);return u.protocol==='https:'&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.toString():null}catch{return null}};
async function fetchContent(url,format='json'){
  const response=await fetch(url,{signal:AbortSignal.timeout(5000),headers:{'Accept':format==='json'?'application/json':'application/rss+xml, application/xml, text/xml'}});
  if(!response.ok)throw new Error(`Fonte respondeu ${response.status}`);
  const length=Number(response.headers.get('content-length')||0);if(length>1600000)throw new Error('Resposta muito grande');
  if(format==='json')return response.json();
  const xml=await response.text();if(xml.length>800000)throw new Error('RSS muito grande');return xml;
}
const money=(minor,currency)=>Number.isFinite(Number(minor))&&['BRL','R$'].includes(currency)?(Number(minor)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):null;
export function steamOffers(data){
  const all=data?.specials?.items||[];
  return all.filter(x=>Number(x.discount_percent)>0&&Number.isFinite(Number(x.id))).slice(0,8).map(x=>({
    title:text(x.name),discount:Number(x.discount_percent),price:money(x.final_price,x.currency),
    url:`https://store.steampowered.com/app/${Number(x.id)}/`,source:'Steam',type:'offer'
  })).filter(x=>x.title&&x.discount>0);
}
export function epicFree(data,date=Date.now()){
  const items=data?.data?.Catalog?.searchStore?.elements||[];
  return items.filter(item=>{
    const active=(item.promotions?.promotionalOffers||[]).flatMap(p=>p.promotionalOffers||[]);
    const zero=Number(item.price?.totalPrice?.discountPrice)===0;
    return zero&&active.some(p=>Date.parse(p.startDate)<=date&&Date.parse(p.endDate)>date);
  }).slice(0,8).map(x=>{
    const slug=text(x.productSlug||x.offerMappings?.[0]?.pageSlug||x.catalogNs?.mappings?.[0]?.pageSlug,150).replace(/^\/+|\/+$/g,'');
    const url=/^[\w/.-]+$/.test(slug)?`https://store.epicgames.com/pt-BR/p/${slug}`:'https://store.epicgames.com/pt-BR/free-games';
    return {title:text(x.title),url,source:'Epic Games',type:'free',until:(x.promotions.promotionalOffers||[]).flatMap(p=>p.promotionalOffers||[]).map(p=>p.endDate).sort()[0]||null};
  }).filter(x=>x.title);
}
function decodeXml(value){return String(value||'').replace(/^<!\[CDATA\[|\]\]>$/g,'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<1114112?String.fromCodePoint(code):''}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,e)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[e]);}
function xmlTag(item,key){const match=item.match(new RegExp(`<${key}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${key}>`,'i'));return decodeXml(match?.[1]||'')}
export function newsRss(xml,source,hosts){
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0,7).map(match=>{
    const block=match[1];const title=text(xmlTag(block,'title'),185);
    const url=safeLink(xmlTag(block,'link'),hosts);
    const date=xmlTag(block,'pubDate');
    return title&&url?{title,url,source,type:'news',published:Number.isFinite(Date.parse(date))?new Date(date).toISOString():null}:null;
  }).filter(Boolean).slice(0,5);
}

// Fonte pública da Nuuvem: catálogo em promoção, sem chave/API ou proxy das imagens.
// A marcação HTML pode mudar; quando isso ocorre, exibimos somente o link oficial.
// Não extrapolamos preços/percentuais e não associamos preços de produtos distintos.
const NUUVEM_OFFERS='https://www.nuuvem.com/br-pt/catalog/price/promo/sort/discount/sort-mode/desc';
const decodeHtml=value=>String(value??'').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const x=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return x>0&&x<1114112?String.fromCodePoint(x):''}).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[n.toLowerCase()]);
const cleanHtml=(html,max=170)=>text(decodeHtml(String(html||'').replace(/<[^>]+>/g,' ')),max);
const nuuvemUrl=value=>{try{const u=new URL(decodeHtml(value),'https://www.nuuvem.com');return u.protocol==='https:'&&u.hostname==='www.nuuvem.com'&&/^\/(?:br-pt\/)?item\/[a-zA-Z0-9._-]+\/?$/.test(u.pathname)?u.href:null}catch{return null}};
const percent=html=>{const found=cleanHtml(html,2200).match(/(?:^|\s)[-−]\s*(\d{1,2})\s*%/);const n=Number(found?.[1]);return n>0&&n<=95?n:null};
const moneyLabel=html=>{const all=[...cleanHtml(html,5000).matchAll(/R\$\s*([\d.]+,\d{2})/g)].map(m=>m[1]);return all.length?`R$ ${all[all.length-1]}`:null};
const nuuvemOffer=(title,url,discount,price)=>{const name=cleanHtml(title,145);const link=nuuvemUrl(url),off=Number(discount);return link&&name&&name.length>=3&&off>0&&off<=95?{title:name,url:link,discount:off,price:price||null,source:'Nuuvem',type:'offer'}:null};
export function nuuvemDeals(html){
  const input=String(html||'').slice(0,1500000),found=[],seen=new Set();
  const push=x=>{if(x&&!seen.has(x.url)){found.push(x);seen.add(x.url)}};
  // Card comercial da Nuuvem: produtos individuais, preços e descontos no mesmo card.
  for(const m of input.matchAll(/<a\b([^>]*\bhref\s*=\s*(["'])([^"']*\/item\/[^"']+)\2[^>]*)>([\s\S]*?)<\/a>/gi)){
    const attrs=m[1],inside=m[4];const off=percent(inside);if(!off)continue;
    const named=(inside.match(/<[^>]*class\s*=\s*["'][^"']*(?:product-card[^"']*name|product-title|product-name)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)||[])[1]||
      (inside.match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i)||[])[1]||
      (inside.match(/<img[^>]*alt\s*=\s*["']([^"']+)["']/i)||[])[1]||
      (attrs.match(/\b(?:aria-label|title)\s*=\s*["']([^"']+)["']/i)||[])[1];
    push(nuuvemOffer(named,m[3],off,moneyLabel(inside)));if(found.length>=8)break;
  }
  // Alguns layouts de loja incluem produtos estruturados no JSON-LD do catálogo.
  if(!found.length){for(const script of input.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const data=JSON.parse(script[1]);const queue=[data];let count=0;
      while(queue.length&&count++<250){const obj=queue.shift();if(Array.isArray(obj)){queue.push(...obj);continue}if(!obj||typeof obj!=='object')continue;
        if(obj['@type']==='Product'){const deal=obj.offers||{};const list=Array.isArray(deal)?deal:[deal];for(const x of list){const old=Number(x.highPrice||x.priceSpecification?.priceBeforeDiscount||0),cur=Number(x.price);const off=old>cur&&cur>0?Math.round((1-cur/old)*100):0;const price=Number.isFinite(cur)&&cur>0&&x.priceCurrency==='BRL'?cur.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):null;push(nuuvemOffer(obj.name,obj.url||x.url,off,price))}}
        for(const key of ['@graph','itemListElement','item','mainEntity','hasPart'])if(obj[key])queue.push(obj[key]);
      }
    }catch{/* ignore invalid JSON-LD; never fabricate offers */}
  }}
  return found.slice(0,8);
}
async function nuuvemPublicDeals(){const response=await fetch(NUUVEM_OFFERS,{signal:AbortSignal.timeout(5300),headers:{Accept:'text/html,application/xhtml+xml','Accept-Language':'pt-BR,pt;q=0.9'}});
  if(!response.ok)throw Error(`Nuuvem: ${response.status}`);const size=Number(response.headers.get('content-length')||0);if(size>1600000)throw Error('Catálogo Nuuvem muito grande');const page=await response.text();if(page.length>1600000)throw Error('Catálogo Nuuvem muito grande');return nuuvemDeals(page);
}

async function loadFeeds(){
  const feeds=await Promise.allSettled([
    fetchContent('https://store.steampowered.com/api/featuredcategories/?cc=BR&l=portuguese').then(steamOffers),
    fetchContent('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR').then(epicFree),
    fetchContent('https://news.xbox.com/en-us/feed/','xml').then(xml=>newsRss(xml,'Xbox Wire',['news.xbox.com'])),
    nuuvemPublicDeals()
  ]);
  return {steam:feeds[0].status==='fulfilled'?feeds[0].value:[],epic:feeds[1].status==='fulfilled'?feeds[1].value:[],
    news:feeds[2].status==='fulfilled'?feeds[2].value:[],nuuvem:feeds[3].status==='fulfilled'?feeds[3].value:[],
    sources:feeds.map((r,i)=>({name:['Steam','Epic','Xbox Wire','Nuuvem'][i],available:r.status==='fulfilled'})),links:fallbackLinks,
    updatedAt:new Date().toISOString()};
}
export async function discoverFeed(){
  const now=Date.now();if(cache&&now-cache.at<TTL_MS)return {...cache.data,cached:true};
  if(!pending)pending=loadFeeds().then(data=>{cache={data,at:Date.now()};return data}).finally(()=>{pending=null});
  try{return await pending}catch(err){console.warn('[TDB discover]',err.message);if(cache&&now-cache.at<STALE_MS)return {...cache.data,cached:true,stale:true};return{steam:[],epic:[],news:[],nuuvem:[],links:fallbackLinks,updatedAt:null,sources:[],unavailable:true}}
}
