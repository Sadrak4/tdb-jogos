# LEIA PRIMEIRO — TDB 8.3.3 RC1

Esta atualização foi feita em uma cópia completa da versão **8.3.2 RC1**. Não publique automaticamente; teste num ambiente Preview antes de trocar a versão principal.

## O que mudou

1. A barra horizontal “Organizar a sala / Mesas / Transmissões / Chat / Participantes / Convidar amigos / Ocultar...” foi removida, sem retirar os controles dos próprios painéis. O botão **Convidar amigos** agora fica no cabeçalho da sala.
2. Em **Minha biblioteca musical**, escolha **Playlists, Favoritos ou Histórico**. Use a pesquisa e expanda cada playlist para reorganizar ou excluir faixas. O banco e os dados antigos não são apagados ou migrados.
3. Truco: destaque dourado da carta que vence a rodada, aviso do time vencedor, banners de pedido de **Truco/Seis/Nove/Doze**, Mão de 11 e manilhas. A revelação de rodada passou de **1,8 s para 1,25 s**, com atualização dedicada ao final. Regras, pontuação, mãos privadas e BOTs continuam validados no servidor.
4. Xadrez: apresentação de xeque-mate, empate, tempo esgotado e desistência ao terminar, avisos de empate e histórico/PGN; sem trocar o motor.
5. Abrir e fechar janelas de jogos não deve limpar favoritos nem reinicializar a biblioteca pessoal.

## Como instalar com segurança

**GitHub Desktop:** faça backup ou branch `teste-tdb-8.3.3`, copie os arquivos do ZIP para o repositório, revise as alterações e crie um commit.

**Supabase:** não há SQL novo para 8.3.3. Se ainda faltar a migração de desempenho da 8.1.4, confira `database/SUPABASE-PERFORMANCE-v8.1.4.sql` no ambiente de teste antes de subir uma versão que já depende dela. Não aplique nada no banco de produção apenas porque este ZIP chegou.

**Vercel:** publique a branch em **Preview**, confira as variáveis de ambiente existentes, a rota independente `/adm` e só então teste com usuários de verdade. Esta atualização não adiciona TURN/SFU ou qualquer serviço pago.

## Checklist de homologação

- Entrar, abrir Notícias, entrar na Sala e verificar que a barra horizontal redundante não aparece. Abrir participantes, chat, transmissão e convite pelos controles preservados.
- Abrir biblioteca no desktop e celular; expandir playlist; renomear; ordenar faixas; pesquisar; consultar Favoritos e Histórico. Testar o que já estava salvo com sua conta real.
- Abrir Xadrez contra os três níveis de BOT e com outra conta; testar movimentos por clique/arrastar, promoção, relógios, empate, xeque, captura, PGN, minimização e encerramento.
- Truco contra BOT em 1x1 e 2x2, contra humanos, pedido Truco/Seis/Nove/Doze, rejeitar/aceitar, Mão de 11, esconder carta, manilhas, espectadores, vitória de rodada, placar e revanche.
- Conferir duração da revelação e se a carta vencedora recebe borda dourada sem expor cartas escondidas.
- Abrir e fechar jogo enquanto toca música e validar que favoritos e sincronização continuam presentes.
- Validar `/adm` exclusivamente pela página separada, exigindo autenticação administrativa.

## Testes executados

- `node tests/v812-engine-regression.mjs` — motores e BOTs.
- `node tests/v833-classic-details.mjs` — Truco até Doze, Mão de 11, vencedor e privacidade das cartas, além de movimentos de Xadrez.
- `python tests/v833-quality-browser.py` — biblioteca em abas, Truco visual, desktop e celular.
- `python tests/v812-classics-browser.py`, `tests/v820-free-browser.py`, `tests/v831-social-admin-browser.py`, `tests/v832-navigation-browser.py` — regressão nos cenários disponíveis.

**Limites:** os testes de Chromium usam uma API simulada. A suíte integrada com Supabase não iniciou por falta de `@supabase/supabase-js` no ambiente de construção. Não há prova de funcionamento “100% em produção”, de duas contas reais ou rede/YouTube reais. Teste no Preview antes da produção.

## Rollback

Se houver algum problema, reverta apenas o deploy Preview ou restaure o commit da 8.3.2. Como não há novas tabelas, não é necessária reversão de SQL desta versão. Os dados pessoais são mantidos no Supabase existente.
