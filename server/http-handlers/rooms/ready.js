export default async function handler(req,res){
  return res.status(410).json({ok:false,error:'O sistema PRONTO foi removido do TDB.'});
}
