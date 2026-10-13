# Revisão técnica — TDB v7.2.0

## Escopo revisado

- Sinuca adicionada como segundo jogo do lobby;
- Blackjack movido para o último card e mantido em manutenção;
- integração da Sinuca com criação/edição de sala, convites, presença, espectadores, Ao vivo, reconexão, abandono, revanche e histórico;
- motor autoritativo de física e regras no servidor;
- replay da mesma tacada no Canvas do navegador;
- responsividade da nova mesa e painel lateral;
- gravação de resultados e estatísticas em `tdb_game_results`;
- versão sincronizada em cliente, servidor e `/api/health`.

## Proteções importantes

- somente membros da partida podem entrar como jogadores;
- espectadores precisam entrar pela função de assistir e podem ser bloqueados pelo host;
- somente o jogador da vez pode executar uma tacada;
- ações usam `expectedVersion` + `actionId` para reduzir duplicação e estado antigo;
- o cliente bloqueia novos comandos enquanto uma ação está sendo validada;
- o servidor bloqueia nova ação até a física da tacada anterior terminar;
- regras da sala não podem ser modificadas durante uma partida;
- abandonar/sair de uma Sinuca em andamento encerra a partida em favor do adversário;
- a física oficial é calculada no servidor; o navegador apenas reproduz a animação e converge para o snapshot oficial.

## Física e regras verificadas

- mesa 2:1;
- rack de 15 bolas + branca;
- bola 8 no centro do rack;
- cantos traseiros com grupos opostos;
- simulação determinística para o mesmo estado/ângulo/força;
- colisões sem gerar valores `NaN`;
- limite de duração da simulação;
- gate entre tacadas enquanto as bolas ainda estão em movimento;
- relógio por tacada e timeout com bola na mão;
- chamada obrigatória de caçapa para a bola 8;
- vitória legal na bola 8;
- regras de falta e bola na mão;
- exigência de quatro bolas na tabela na saída quando nenhuma bola é encaçapada.

## Validação executada antes do pacote

- `node --check`: **127 arquivos JavaScript/MJS** sem erro de sintaxe;
- verificação estrutural: **12 arquivos CSS** com chaves balanceadas;
- `tests/v7.2.0-pool-engine-smoke.mjs`: aprovado;
- `tests/online-engine-smoke.mjs`: aprovado;
- `tests/v5.2-engine-smoke.mjs`: aprovado;
- `tests/v5.4-gameplay-smoke.mjs`: aprovado;
- `tests/v7.1.5-maintenance-admin-smoke.mjs`: aprovado, confirmando que a manutenção administrativa anterior continua presente.

Testes históricos que exigem exatamente o número de uma versão antiga não são usados como critério para a v7.2.0, pois falham propositalmente quando encontram `7.2.0` no lugar da versão que eles foram escritos para validar.

## Escopo desta primeira Sinuca

A v7.2.0 é focada em **8-Ball 1x1 entre jogadores reais**. Não foi incluído BOT de Sinuca nesta primeira entrega. Efeitos avançados na bola branca (draw/follow/english) também ficam para uma evolução posterior; o objetivo desta versão é estabilizar primeiro a física base, regras, sincronização e multiplayer.

## Banco

Nenhuma migração adicional é necessária. `tdb_rooms.game`, `tdb_matches.game` e `tdb_game_results.game` já são campos de texto, e as configurações/estado são armazenadas nas estruturas JSON existentes.
