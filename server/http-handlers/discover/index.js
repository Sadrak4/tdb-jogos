import {discoverFeed} from '../../discover-service.js';
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Método não permitido'});
  // Shared CDN cache instead of per-user external requests. Never store secrets here.
  res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=1800');
  try{return res.json({ok:true,...await discoverFeed()})}
  catch{return res.json({ok:true,steam:[],epic:[],news:[],nuuvem:[],links:[],unavailable:true})}
}
