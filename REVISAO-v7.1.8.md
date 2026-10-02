# Revisão final — TDB v7.1.8

## Conferido antes do pacote
- 123 arquivos `.js`/`.mjs` passaram em `node --check`.
- Smoke específico `v7.1.8-chess-room-bot-smoke.mjs`: OK.
- Engine online: OK.
- Engine v5.2 (Xadrez/Truco): OK.
- Gameplay v5.4: OK.
- Perfil/presença v7.1: OK.
- Gameplay polish v7.1.1: OK.
- Balanceamento de chaves dos CSS: OK.

## Observação de testes de backend
Alguns testes históricos que importam `@supabase/supabase-js` exigem `npm install`. A tentativa de instalar dependências neste ambiente excedeu o tempo disponível, então esses testes dependentes do pacote não foram usados como critério de aprovação. As rotas e módulos alterados passaram em validação de sintaxe e o fluxo específico da v7.1.8 possui smoke próprio.

## Banco
Nenhuma migration nova na v7.1.8.
