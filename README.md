# TDB v7.2.0 — Sinuca 8-Ball

A v7.2.0 adiciona a **Sinuca 8-Ball online** ao TDB com motor próprio de física, mesa Canvas, mira, força, faltas, lisas/listradas, bola 8 com caçapa declarada, espectadores, reconexão, revanche e integração com perfis/histórico.

## Jogos no lobby

1. Truco
2. Sinuca
3. Xadrez
4. TDB Lobby
5. Blackjack — Em manutenção

## Arquitetura da Sinuca

- `games/pool/pool.js` — interface, Canvas, controles e replay das tacadas.
- `games/pool/pool-physics.js` — física usada para animação no navegador.
- `games/pool/pool.css` — layout responsivo e visual da mesa.
- `server/pool-engine.js` — física e regras autoritativas do servidor.
- `assets/v7/pool.svg` — arte do card.

Leia `ATUALIZACAO-v7.2.0.md` para a lista completa.

## Supabase

Se o banco já está atualizado até a v7.1.7, **a v7.2.0 não exige SQL novo**.

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Teste principal desta versão

```bash
npm run test:v720
```
