# TDB JOGOS v4.1 — Correção de entrada em salas


## Correções desta versão

- quem cria qualquer sala entra nela automaticamente;
- o realtime não manda mais o criador de volta para a lista de salas;
- TDB Music abre diretamente o player ao criar;
- botão Entrar do TDB Music agora usa o fluxo online correto;
- entrada por código também usa o servidor online;
- estado `joining` evita redraw da listagem durante a confirmação do servidor;
- sala privada preserva a senha no backend mesmo depois de atualizações públicas do estado.

Versão preparada para GitHub + Vercel com multiplayer/realtime.

## Incluído

### Contas online
- usuário + senha;
- senha processada no servidor com `scrypt`;
- token de sessão;
- nenhuma senha em texto simples é enviada em snapshots públicos;
- fallback local para desenvolvimento sem conexão.

### Salas online
- públicas;
- privadas;
- código de sala;
- entrada em sala privada validada no servidor;
- host;
- jogadores sincronizados;
- presença;
- encerramento de sala sem jogador humano continua preservado no modo local.

### TDB Music online
- fila compartilhada;
- link do YouTube;
- pesquisa opcional com YouTube Data API;
- play;
- pause;
- anterior;
- próxima;
- música atual;
- timestamp compartilhado;
- correção de drift;
- sincronização entre computadores via WebSocket + Redis.

O vídeo/áudio vem diretamente do YouTube. O servidor TDB transmite apenas o estado.

### Xadrez online
Servidor é autoridade das ações:
- turno;
- movimento legal;
- captura;
- xeque;
- xeque-mate;
- roque;
- en passant;
- promoção (engine suporta; UI atual usa Dama como padrão);
- proposta de empate;
- aceitar/recusar;
- desistência;
- relógio sincronizado pelo servidor;
- espectador online somente leitura.

Um cliente não pode simplesmente mover qualquer peça: o servidor recalcula/valida a jogada.

### Truco online
Servidor mantém o baralho e as mãos.

Incluído:
- 1x1;
- 2x2;
- baralho de 40 cartas;
- vira;
- manilha;
- ordem de naipes da manilha;
- turnos;
- jogar carta;
- esconder a partir da segunda rodada;
- Truco;
- 6;
- 9;
- 12;
- resposta por equipe;
- Mão de 11;
- Mão de Ferro;
- placar até 12;
- distribuição de nova mão;
- espectador.

#### Privacidade no Truco

O estado completo fica no servidor.

Cada cliente recebe uma visão diferente:

Jogador:
- recebe apenas a própria mão.

Adversário:
- recebe somente a quantidade de cartas.

Espectador:
- não recebe nenhuma mão privada.

Cartas já jogadas são públicas.

### Espectadores online
- Xadrez: tabuleiro completo, somente leitura.
- Truco: placar, vira e cartas jogadas.
- mãos permanecem ocultas.
- espectador não envia ação de jogo.

## Infraestrutura

- frontend estático;
- Vercel Functions;
- WebSocket `/api/ws`;
- Redis compartilhado;
- Pub/Sub para sincronizar múltiplas instâncias;
- cache local para reconexão;
- fallback local.

## Arquivos importantes

- `api/ws.js`
- `api/auth/*`
- `server/realtime-hub.js`
- `server/realtime-store.js`
- `server/game-service.js`
- `server/chess-engine.js`
- `server/truco-engine.js`
- `server/auth-service.js`
- `core/online-client.js`
- `core/online-auth.js`

## Redis

Para produção online real, configure `REDIS_URL`.

Sem Redis:
- desenvolvimento local funciona;
- WebSocket funciona na instância local;
- não é confiável para múltiplas instâncias da Vercel.

Com Redis:
- salas;
- partidas;
- contas;
- TDB Music;
- presença;
- eventos entre instâncias;

usam estado compartilhado.

## Desenvolvimento local

Primeira vez:

```bash
npm install
```

Depois:

```bash
npm run dev
```

Ou use:

`INICIAR-TDB-JOGOS.bat`

## Testes incluídos

`tests/online-engine-smoke.mjs`

Verifica:
- tabuleiro inicial do Xadrez;
- movimento e2-e4;
- troca de turno;
- Truco com quatro jogadores;
- três cartas por mão;
- avanço de turno;
- espectador sem acesso às cartas privadas.

Executar:

```bash
node tests/online-engine-smoke.mjs
```

## Observação

WebSockets na Vercel dependem do suporte atual de Vercel Functions/Fluid Compute.
Conexões podem cair/reconectar; o cliente possui reconexão automática e o estado durável deve ficar no Redis.
