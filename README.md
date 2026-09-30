# TDB JOGOS v4.3 — Vercel Hobby Fix

Esta versão corrige o erro de implantação do plano Hobby:

`No plano Hobby, é possível adicionar no máximo 12 funções sem servidor a uma implantação.`

## O que mudou

A v4.2 possuía 21 arquivos JavaScript dentro de `/api`, então a Vercel interpretava praticamente cada endpoint como uma função separada.

A v4.3 possui somente **2 funções Vercel**:

1. `api/[...route].js` — recebe toda a API HTTP:
   - health;
   - autenticação;
   - salas;
   - jogos;
   - Music/shared state;
   - presença;
   - amigos.
2. `api/ws.js` — realtime/WebSocket.

Os handlers individuais foram movidos para `server/http-handlers/`, onde não contam como funções independentes.

## Recursos preservados

- contas online;
- salas públicas/privadas;
- amigos por ID;
- presença;
- TDB Music;
- Xadrez online;
- Truco online;
- espectadores;
- HTTP polling de segurança;
- Redis;
- WebSocket.

## Importante

Na Vercel use Framework/Application Preset **Other**.

Redis continua obrigatório em produção para multiplayer confiável.

Depois do deploy, abra:

`/api/health`

O esperado é algo como:

```json
{
  "ok": true,
  "version": "4.3.0",
  "redis": true,
  "readyForMultiplayer": true
}
```
