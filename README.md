# TDB JOGOS v5.3 — Renderização e Navegação Fix

A v5.2 consolida a base online do TDB JOGOS antes da adição de novos jogos.

## Principais novidades

### Conexão e reconexão
- estados visuais: `CONECTANDO…`, `ONLINE`, `ONLINE • FALLBACK`, `RECONECTANDO…` e `OFFLINE`;
- heartbeat periódico;
- retorno automático à sala/partida após atualizar a página ou uma queda curta;
- tolerância de reconexão de **90 segundos**;
- jogador aparece como `Reconectando (Xs)` durante a tolerância;
- se o prazo acabar em Truco/Xadrez competitivo, a partida é encerrada por abandono.

### Host migratório
- saída explícita do host transfere a sala;
- host desconectado por mais de 90 segundos é removido e a sala escolhe novo host;
- preferência por jogador que esteja online.

### Amigos e social
- busca por **nome** ou `TDB-XXXXXXXX`;
- pedido de amizade;
- aceitar/recusar pedido;
- pedidos enviados;
- convite de sala para amigos;
- aceitar convite entra diretamente na sala;
- presença: Online, Jogando, TDB Music, Reconectando e Offline.

### Segurança / estabilidade
- proteção contra clique duplo no cliente;
- `actionId` para idempotência;
- `expectedVersion` nas ações de partida;
- estado de Truco/Xadrez validado pelo servidor;
- rate limit por rota;
- logs de erro de servidor e cliente no Supabase;
- limpeza automática de presença/salas/sessões/eventos/logs antigos.

### Histórico competitivo
Somente partidas com **jogadores reais** contam.

Partidas contra bots:
- continuam disponíveis para teste;
- não somam vitória;
- não somam derrota;
- não entram no ranking.

O perfil mostra:
- partidas jogadas;
- vitórias;
- derrotas;
- empates;
- partidas recentes;
- PGN das partidas de Xadrez.

### Ranking global
Na tela de cada jogo aparece o TOP 3.

- Truco: ranking separado em **1x1** e **2x2**;
- Xadrez: ranking **1x1**;
- classificação principal: quantidade de vitórias;
- desempate: taxa de vitória e derrotas.

### TDB Music
- fila compartilhada validada pelo servidor;
- quem adicionou cada música;
- limite de músicas por pessoa;
- usuário pode remover/reordenar suas próprias músicas;
- host pode reorganizar tudo;
- votação para pular;
- host pode bloquear/liberar controles;
- mostra quem tocou, pausou, pulou ou alterou a fila;
- sincronização com tolerância maior para evitar ficar corrigindo o player toda hora.

### Truco Online
- servidor é autoridade;
- Mão de 11 com decisão da dupla;
- parceiro vê as cartas da própria equipe na Mão de 11;
- Mão de Ferro mantém todas as mãos ocultas;
- timer por jogada controlado pelo servidor;
- timeout joga uma carta aberta automaticamente;
- reconexão e abandono de 90s;
- espectador nunca recebe mãos privadas.

### Xadrez Online
- relógio calculado pelo servidor;
- promoção permite escolher Dama, Torre, Bispo ou Cavalo;
- PGN;
- reconexão e abandono;
- **sem empate automático por repetição**;
- continuam válidos xeque-mate, afogamento, acordo, desistência, timeout etc.

## Arquitetura de dados

```text
Supabase persistente
├── usuários / perfil
├── sessões
├── amigos / pedidos
├── convites
├── histórico / resultados
├── ranking
└── logs

Estado online
├── salas
├── presença
├── partidas
├── TDB Music
└── eventos Realtime
```

## Importante ao atualizar da v5.0/v5.1

A v5.2 adiciona novas tabelas.

Depois de publicar os arquivos, execute **novamente o arquivo completo**:

`SUPABASE-SCHEMA.sql`

no Supabase SQL Editor.

O SQL usa `create table if not exists`, então ele mantém as tabelas e contas existentes e adiciona as estruturas da v5.2.

## Testes incluídos

- `tests/online-engine-smoke.mjs`
- `tests/v5.2-engine-smoke.mjs`

Os testes v5.2 verificam:
- Xadrez sem empate automático por repetição;
- promoção para Cavalo;
- Mão de 11;
- visibilidade das cartas da dupla;
- Mão de Ferro;
- timer server-side do Truco;
- privacidade do espectador.


## v5.3 — correções de produção

A v5.3 corrige os problemas de interface encontrados depois da v5.2:

- nenhuma sincronização de fundo chama mais `renderLobby()`, `drawGamePage()` ou `renderWaitingRoom()`;
- lobby, amigos e lista de salas recebem somente patches nos blocos que mudaram;
- Xadrez online reaproveita o tabuleiro montado e atualiza as peças sem recriar a tela inteira;
- Truco/Xadrez passam a ter estados `playing-truco` e `playing-chess`, separados de `waiting`;
- testes com bots desligam o sincronizador online e usam `bot-truco` / `bot-chess`;
- ao voltar do teste com bot, a sala online original é restaurada;
- convidar amigos abre um modal por cima da sala, sem navegar para Amigos;
- convite recebido aparece em um aviso flutuante por 10 segundos e continua salvo em Amigos.

### Banco

A v5.3 não adiciona tabelas novas. Se o `SUPABASE-SCHEMA.sql` da v5.2 já foi executado, não é necessário rodá-lo novamente apenas por causa desta correção.
