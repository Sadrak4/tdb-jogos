# TDB v7.2.2 — Estabilidade Online + Sinuca 8-Ball

A v7.2.2 mantém tudo da v7.2.1/v7.2.0 e faz uma revisão do multiplayer depois da entrada da **Sinuca 8-Ball**.

## Jogos no lobby

1. Truco
2. Sinuca
3. Xadrez
4. TDB Lobby
5. Blackjack — Em manutenção

## Principais pontos desta versão

- Sinuca 8-Ball 1x1 online com motor próprio e física autoritativa no servidor.
- Entrada de amigo/sala revisada.
- Recuperação automática de salas presas como `playing` sem partida real.
- Start e revanche transacionais.
- Timeouts de cliente e servidor para impedir loading infinito.
- Recuperação visual da Sinuca se a sincronização falhar.
- Menos writes de presença durante partidas.
- Espectador só entra quando existe partida oficial ativa.
- TDB Lobby continua com fila de músicas sem limite por pessoa.

Leia `ATUALIZACAO-v7.2.2.md` para a lista completa e `REVISAO-v7.2.2.md` para os testes realizados.

## Supabase

Se seu banco já está atualizado até a v7.1.7, **a v7.2.2 não exige SQL novo**.

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Testes principais

```bash
npm run test:v720
npm run test:v721
npm run test:v722
```
