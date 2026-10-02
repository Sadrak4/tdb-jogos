# TDB v7.1.0

## Entregue nesta atualização
- Perfil 2.0: banner opcional, avatar, status/presença, estatísticas e histórico recente.
- Perfil de amigos: clicar em um amigo abre perfil completo, presença, estatísticas, últimas partidas e convite para a sala atual.
- Presença: Online, Ausente automático após 5 min, No Truco, No Xadrez, No Blackjack, Ouvindo música e Assistindo partida.
- Truco: mantidas e validadas as melhorias já existentes da base v7 (placar, indicação de turno, animações, Truco/6/9/12, histórico/log e resultado).
- Xadrez: mantidas e validadas as funções já existentes (relógio opcional, último movimento, capturas, promoção, empate, desistência, revanche e histórico/PGN).
- TDB Lobby/Música: mantidas fila compartilhada, autor da música, voto para pular, sincronização e bloqueio/permissões do host.
- Admin 2.0: mantido painel com usuários online, salas, partidas, reportes, banimento, sessões, logs, manutenção e métricas.
- Modularização: presença/idle foi retirada do fluxo principal para `core/presence-manager.js`; perfil público ganhou endpoint próprio `profile/public`.

## Banco de dados
Esta versão ADICIONA a coluna `banner` em `tdb_users`.
Execute `SUPABASE-MIGRATION-v7.1.0.sql` uma vez no SQL Editor do Supabase.
