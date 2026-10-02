# TDB v7.1.4 — Final Review

Versão consolidada da linha v7.1.x, baseada na v7.0.1 Gameplay Fix.

## Principais entregas
- Perfil 2.0 + perfil público de amigos + convites para sala.
- Presença detalhada e módulo de inatividade separado.
- Truco com Vira maior e carta superior sem cobrir o centro da mesa.
- Xadrez com tabuleiro maior, painel direito completo, histórico rolável e BOT anti-loop reforçado.
- TDB Lobby/Música com fila compartilhada, votação, permissões e layout sem corte lateral.
- Blackjack com interface de cassino, apostas/fichas, ações destacadas e animações.
- Admin 2.0 com métricas, contas, banimentos, reportes, logs, manutenção e salas.
- Correções de responsividade consolidadas na última camada CSS.

Veja `REVISAO-FINAL-v7.1.4.md` para a lista completa.

## Supabase
A única migration necessária na linha v7.1.x é `SUPABASE-MIGRATION-v7.1.0.sql`, que adiciona a coluna `banner` em `public.tdb_users`.

Se você já executou essa migration, não precisa rodar nenhum SQL novo para a v7.1.4.

## Deploy
Substitua os arquivos do repositório por esta versão, faça Commit + Push no GitHub Desktop e aguarde o deploy automático do Vercel.
