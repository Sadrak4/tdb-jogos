# TDB v7.1.8 — Chess Room + Bot AI

Esta versão parte da **v7.1.7** e mantém Perfil 3.0, foto de perfil, perfis públicos, Lobby/Ao Vivo, manutenção administrativa, melhorias de Truco/Música e o bloqueio temporário do Blackjack.

## Destaques da v7.1.8
- Botão inteiro da seta lateral agora é clicável.
- Relógio do Xadrez revisado no cliente e no servidor.
- BOT espera aproximadamente 1,8 s antes de mover.
- Dificuldades **Fácil / Médio / Difícil**.
- IA do Xadrez com avaliação posicional e Minimax + Alpha-Beta nos níveis superiores.
- Host pode **Editar regras** da sala sem apagá-la e recriá-la.
- Regras editáveis de Xadrez e Truco, com validação no servidor.

Leia `ATUALIZACAO-v7.1.8.md` para a lista completa.

## Banco de dados
A **v7.1.8 não exige SQL novo**.

A migration `SUPABASE-MIGRATION-v7.1.7.sql` continua no pacote apenas para instalações que ainda não adicionaram `avatar_image`.
