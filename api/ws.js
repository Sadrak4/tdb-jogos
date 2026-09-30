import express from 'express';
import { createServer } from 'http';
import { attachRealtime } from '../server/realtime-hub.js';

const app=express();
app.get('/',(_req,res)=>res.status(200).send('TDB JOGOS realtime'));

const server=createServer(app);
await attachRealtime(server);

export default server;
