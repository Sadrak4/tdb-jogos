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
  {name:'GeForce NOW',url:'https://blogs.nvidia.com/blog/category/gaming/',kind:'cloud'}
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
async function loadFeeds(){
  const feeds=await Promise.allSettled([
    fetchContent('https://store.steampowered.com/api/featuredcategories/?cc=BR&l=portuguese').then(steamOffers),
    fetchContent('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR').then(epicFree),
    fetchContent('https://news.xbox.com/en-us/feed/','xml').then(xml=>newsRss(xml,'Xbox Wire',['news.xbox.com'])),
    fetchContent('https://blogs.nvidia.com/blog/category/gaming/feed/','xml').then(xml=>newsRss(xml,'NVIDIA Gaming',['blogs.nvidia.com']))
  ]);
  return {steam:feeds[0].status==='fulfilled'?feeds[0].value:[],epic:feeds[1].status==='fulfilled'?feeds[1].value:[],
    news:[...(feeds[2].status==='fulfilled'?feeds[2].value:[]),...(feeds[3].status==='fulfilled'?feeds[3].value:[])].slice(0,8),
    sources:feeds.map((r,i)=>({name:['Steam','Epic','Xbox Wire','NVIDIA'][i],available:r.status==='fulfilled'})),links:fallbackLinks,
    updatedAt:new Date().toISOString()};
}
export async function discoverFeed(){
  const now=Date.now();if(cache&&now-cache.at<TTL_MS)return {...cache.data,cached:true};
  if(!pending)pending=loadFeeds().then(data=>{cache={data,at:Date.now()};return data}).finally(()=>{pending=null});
  try{return await pending}catch(err){console.warn('[TDB discover]',err.message);if(cache&&now-cache.at<STALE_MS)return {...cache.data,cached:true,stale:true};return{steam:[],epic:[],news:[],links:fallbackLinks,updatedAt:null,sources:[],unavailable:true}}
}
