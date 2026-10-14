// Public gaming feeds are noncritical: the TDB must work even when all sources fail.
const safe=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=(raw)=>{try{const u=new URL(raw);return u.protocol==='https:'?u.href:null}catch{return null}};
const links={steam:'https://store.steampowered.com/specials/',epic:'https://store.epicgames.com/pt-BR/free-games',news:'https://news.xbox.com/pt-br/',cloud:'https://blogs.nvidia.com/blog/category/gaming/'};
let result=null,pending=null,active='all';
const fallback=()=>Object.entries(links).map(([type,url])=>({title:({steam:'Confira as promoções Steam',epic:'Confira os jogos gratuitos da Epic',news:'Leia as notícias do Xbox Wire',cloud:'Novidades do GeForce NOW'})[type],url,source:({steam:'Steam',epic:'Epic Games',news:'Xbox Wire',cloud:'NVIDIA'})[type],type:'link'}));
function render(){
  const root=document.querySelector('#discover-list'),meta=document.querySelector('#discover-meta');if(!root)return;
  const d=result||{};let entries=[...(d.epic||[]).map(i=>({...i,group:'epic'})),...(d.steam||[]).map(i=>({...i,group:'steam'})),...(d.news||[]).map(i=>({...i,group:i.source==='NVIDIA Gaming'?'cloud':'news'}))];
  entries=entries.filter(i=>active==='all'||i.group===active);
  const linksFiltered=fallback().map((item,i)=>({...item,group:['steam','epic','news','cloud'][i]})).filter(item=>active==='all'||item.group===active);
  const present=new Set(entries.map(item=>item.group));
  const fillers=linksFiltered.filter(item=>!present.has(item.group));
  const display=[...entries.slice(0,8),...fillers].slice(0,9);
  root.innerHTML=display.map(item=>{const url=safeUrl(item.url),source=safe(item.source),title=safe(item.title);
    if(!url)return '';
    const discount=Number.isFinite(Number(item.discount))&&Number(item.discount)>0?`<span class="discover-discount">−${Math.round(Number(item.discount))}%</span>`:'';
    const price=typeof item.price==='string'&&item.price?`<span class="discover-price">${safe(item.price)}</span>`:'';
    const free=item.type==='free'?'<span class="discover-free">GRÁTIS POR TEMPO LIMITADO</span>':'';
    const label=item.type==='link'?'Fonte oficial':source;
    return `<a class="discover-card" href="${safe(url)}" target="_blank" rel="noopener noreferrer"><span class="discover-source">${safe(label)}</span><strong>${title}</strong><div class="discover-card-foot">${free}${discount}${price}<span class="discover-arrow">↗</span></div></a>`;
  }).join('');
  const featured=[...(d.news||[]),...(d.epic||[]),...(d.steam||[])].find(x=>x?.url&&x?.title);
  window.__tdbDiscoverFeatured=featured||null;
  document.dispatchEvent(new CustomEvent('tdb:discover',{detail:{featured:featured||null}}));
  if(meta)meta.textContent=entries.length?`Destaques públicos · Verifique valores e prazos na loja oficial${d.stale?' · últimas informações disponíveis':''}`:'Links oficiais disponíveis · As ofertas serão exibidas quando as fontes responderem';
  document.querySelectorAll('[data-discover-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.discoverFilter===active)));
}
export async function loadDiscover(force=false){
  if(result&&!force){render();return}
  if(pending)return pending;
  pending=(async()=>{
    try{
      const response=await fetch('/api/discover',{cache:'default',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Dados temporariamente indisponíveis');
      const data=await response.json();result=data.ok?data:null;
    }catch{result={steam:[],epic:[],news:[]}}
    finally{pending=null;render()}
  })();return pending;
}
export function initDiscover(){
  const section=document.querySelector('#discover-section');if(!section||section.dataset.initialized)return;
  section.dataset.initialized='yes';
  section.addEventListener('click',e=>{const b=e.target.closest('[data-discover-filter]');if(!b)return;active=b.dataset.discoverFilter;render()});
  document.querySelector('#discover-refresh')?.addEventListener('click',()=>loadDiscover(true));
  loadDiscover();
}
