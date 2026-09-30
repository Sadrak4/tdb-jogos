export default function handler(_req,res){
  res.status(200).json({
    ok:true,
    app:'TDB JOGOS',
    version:'3.0.0',
    realtime:'websocket'
  });
}
