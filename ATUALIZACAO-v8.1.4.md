# Registro de alterações — TDB 8.1.4 RC1

**Tipo:** correção de desempenho e integridade. **Base:** v8.1.3 RC1. **Situação:** pré-publicação.

| Camada | Alterações principais |
|---|---|
| `server/realtime-store.js` | verificação de esquema inicial mais leve, função CAS de jogo |
| `server/rate-limit.js` | leituras do polling com rate limit local, ações persistidas em 1 RPC com fallback legado |
| `server/http-router.js` | cache curto de manutenção e medição do custo de middleware |
| `server/auth-service.js` | junção de sessão e usuário por FK, fallback compatível |
| `server/hub-service.js` | reconciliação por mesa, chat incremental, limpeza segura, expulsões administrativas, tempo de saída |
| `server/game-service.js` | CAS contra sobrescrita, menos gravações em partidas |
| `server/stats-service.js` | totais de histórico completo via agregação SQL |
| `hub/hub.js` | polling adaptativo, consultas incrementais, renderização seletiva, refresh ordenado das mesas |
| `server/http-handlers/hub.js` | parâmetro de cursor para mensagens e `Server-Timing` |
| `database/SUPABASE-PERFORMANCE-v8.1.4.sql` | migração aditiva obrigatória para a nova versão |
| `tests/v814-integrity.mjs` | teste novo de CAS, expulsão e chat incremental |

**Sem alterações:** motores de Xadrez/Truco, BOTs, identidade Premium Gold, músicas pessoais, histórico armazenado, API de Sinuca (não oferecida).

**Homologação pendente:** SQL em banco real, várias conexões no Vercel Preview, latência do site publicado, transmissão WebRTC real. Ver `LEIA-PRIMEIRO-8.1.4.md`.
