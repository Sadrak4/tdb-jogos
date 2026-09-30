# TDB JOGOS v4.2 — Online Sync Fix

Esta versão corrige a sincronização entre computadores na Vercel.

## Problemas corrigidos

### Salas
- salas são atualizadas por HTTP/Redis mesmo se o WebSocket cair;
- host passa a ver jogadores que entram sem precisar sair da tela;
- lista pública de salas é atualizada periodicamente;
- entrar por código e botão Entrar usam o backend;
- sair da sala atualiza o servidor;
- sala vazia é removida.

### Truco e Xadrez
O problema principal da v4.1 era que o botão Iniciar ainda podia iniciar a engine apenas no navegador do host.

Na v4.2:
- host envia `start` para o servidor;
- servidor cria a partida autoritativa;
- todos os jogadores consultam o mesmo estado;
- cada cliente entra automaticamente na partida quando ela surgir;
- ações são enviadas para `/api/games/action`;
- existe polling HTTP de segurança a cada ~850 ms;
- WebSocket continua sendo usado como acelerador quando disponível.

### TDB Music
- fila compartilhada persistida no Redis;
- play/pause/próxima/anterior persistidos;
- cada cliente consulta o estado compartilhado;
- WebSocket não é mais requisito para a música sincronizar;
- timestamp continua sendo usado para corrigir diferença entre players.

### Amigos por ID
Na v4.1 a busca ainda era local.

Na v4.2:
- amigos são procurados entre as contas registradas no servidor;
- lista de amigos fica persistida no Redis;
- presença é exibida como Online/Jogando/Assistindo/TDB Music quando disponível.

### Espectadores
- entrada como espectador é registrada no backend;
- contagem fica compartilhada;
- espectador continua sem receber cartas privadas do Truco.

## WebSocket + HTTP fallback

A arquitetura agora é:

```text
Navegador
  ├─ WebSocket (rápido, quando disponível)
  └─ HTTP polling (recuperação e sincronização garantida)
             ↓
           Redis
             ↓
      estado compartilhado
```

O WebSocket não é mais a única forma de receber mudanças.

## Redis é obrigatório na Vercel

Em produção, sem Redis, o site mostra:

`SEM REDIS`

e bloqueia operações multiplayer que poderiam gerar estados divergentes.

No desenvolvimento local, Redis continua opcional.

## Teste

Depois do deploy, abra:

`https://SEU-DOMINIO.vercel.app/api/health`

O esperado para produção é:

```json
{
  "ok": true,
  "version": "4.2.0",
  "redis": true,
  "readyForMultiplayer": true,
  "production": true
}
```

Se `redis` estiver `false`, configure `REDIS_URL`.

## Atualizando pelo GitHub Desktop

1. Extraia este ZIP.
2. Copie o conteúdo da pasta extraída para dentro da pasta local do repositório `tdb-jogos`.
3. Substitua os arquivos existentes.
4. GitHub Desktop:
   - Summary: `TDB JOGOS v4.2 Online Sync Fix`
   - Commit to main
   - Push origin
5. A Vercel fará um novo deploy.
