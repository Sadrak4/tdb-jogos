# Revisão técnica — TDB v7.2.2

## Validações executadas

- Sintaxe de todos os arquivos JavaScript/MJS da distribuição.
- Estrutura básica dos 12 arquivos CSS.
- `tests/online-engine-smoke.mjs`.
- `tests/v5.4-gameplay-smoke.mjs`.
- `tests/v5.8-truco-room-lifecycle-smoke.mjs`.
- `tests/v6.0-multiplayer-flow-smoke.mjs`.
- `tests/v7.2.0-pool-engine-smoke.mjs`.
- `tests/v7.2.1-music-unlimited-smoke.mjs`.
- `tests/v7.2.2-online-stability-smoke.mjs`.

Também foi executado um teste de integração em memória simulando:

1. host cria sala de Sinuca;
2. segundo usuário entra;
3. host inicia a partida;
4. terceiro usuário entra como espectador;
5. sala fantasma `playing` sem game é recuperada;
6. partida encerrada recebe revanche e cria um novo match.

O fluxo completo passou.

## Observação sobre testes históricos

Alguns testes de versões antigas verificam literalmente o número daquela versão (ex.: esperam `7.1.8`). Eles naturalmente falham quando executados dentro da v7.2.2 e não indicam regressão funcional. Testes feitos para navegador, como `core-smoke.js`, também não são executáveis diretamente no Node sem DOM.

## Pontos revisados manualmente

- criação e entrada em sala;
- capacidade 2/2 da Sinuca;
- start transacional;
- recuperação de sala fantasma;
- estado oficial do game no servidor;
- revanche;
- espectador;
- timeouts de API;
- loading/recovery do cliente;
- reconexão;
- polling da partida;
- rate-limit;
- manutenção/cleanup;
- fila ilimitada do TDB Lobby.

## SQL

Nenhuma migration nova.
