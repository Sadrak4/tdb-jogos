# TDB 8.1.2-rc.1 — Xadrez e Truco clássicos

**Versão candidata (RC). Antes de publicar, teste no ambiente Preview.**

## O que mudou

O Xadrez usa os arquivos de motor cliente e estilos clássicos da versão 7.2.5, adaptados às mesas sociais novas. O motor de servidor segue responsável por validar jogadas, relógios e resultados. O BOT do Xadrez recupera busca e avaliação posicional antigas nos níveis fácil/médio/difícil.

O Truco apresenta mesa oval, baralho, manilha, vira, posições de jogadores, placar, cartas escondidas, pedido de Truco, respostas, mão de 11, equipes 1×1 ou 2×2 e BOTs com tomada de decisão contextual. A interface antiga no `app.js` era dependente da plataforma velha: os componentes foram **adaptados**, não copiados integralmente.

A janela de jogo agora é flutuante e arrastável/redimensionável em desktop. Há minimizar, maximizar, restaurar, fechar e reabrir. Fechar a janela **não é desistir da partida**. Em celular, a janela ocupa o viewport e o conteúdo interno tem rolagem. A Sinuca foi mantida sem remodelagem neste pacote.

## Arquivos alterados nesta versão

- `index.html`: inclusão do contêiner flutuante e dos recursos clássicos.
- `games/chess/chess-engine.js`, `games/chess/chess.css`: arquivos recuperados da linha 7.2.5.
- `hub/classic-games.js`: componentes dos dois jogos ligados ao estado das mesas atuais.
- `hub/classic-window.css`: janela, componentes, ajustes desktop/mobile.
- `hub/hub.js`: comunicação da janela com sala, movimentos, controles e comandos.
- `server/chess-engine.js`, `server/game-service.js`: estratégia de BOT original integrada à validação no servidor.
- `server/truco-engine.js`: BOT revisado com decisões por dificuldade.
- `tests/v812-*`: regressão específica do motor e do navegador.

## Como testar antes de publicar

1. Guarde backup da versão em produção e abra uma branch separada no GitHub Desktop.
2. Execute `npm install` em máquina com internet e Node 20+; **não divulgue credenciais**.
3. Rode `npm run test:classics`, `npm run test:visual` e `npm run test:integrated` (este último requer as dependências npm instaladas).
4. Faça um deploy **Preview** na Vercel, usando o esquema Supabase já instalado da linha TDB 8.1; não execute SQL novo somente por esta atualização.
5. Entre com duas contas em navegadores separados, inclusive em sala antiga, e confirme Xadrez humano×humano, humano×BOT (fácil/médio/difícil), promoção, empate, relógio, desistência, movimentação por arrasto/clique, espectador sem jogadas; Truco 1×1/2×2, pedido/aceite/fuga/aumento, cartas ocultas, mão de 11, BOTs e resultados.
6. Confirme minimizar, arrastar, redimensionar e fechar/reabrir sem abandono; verifique música/chat e transmissão enquanto a janela fica aberta.
7. Confira Sinuca, playlists, favoritos, exclusão de sala e permissões como regressão. Publique em produção **só depois** de aprovar o Preview.

## Testes realmente executados aqui

- **Passou:** `node tests/v812-engine-regression.mjs` — Xadrez e escolha de movimento legal de BOT nos três níveis; Truco completo 1×1/2×2 com BOTs e privacidade.
- **Passou:** `python tests/v812-classics-browser.py` — Chrome/Chromium desktop e mobile, abrir partida com BOT, clique/arrasto, histórico, minimizar/maximizar/fechar/reabrir, Truco 2×2, cartas ocultas, botões, ausência de erros JS.
- **Passou:** `python tests/v811-premium-browser.py` e `python tests/v81-rc3-browser.py` — navegação, chat, player, home, criação de mesas contextual, BOT na sala.
- **Bloqueado neste ambiente:** `npm run test:integrated`, por ausência do pacote `@supabase/supabase-js` (Node modules não instalados).
- **Não realizado:** deploy Vercel Preview, Supabase real, vários usuários reais, teste completo de produção.

## GitHub Desktop, Supabase e Vercel

- **GitHub Desktop:** sim, para testar, importe os arquivos numa **branch separada**, revise mudanças e faça commit/push quando estiver pronto.
- **Supabase:** **não é necessário SQL novo** para esta entrega sobre a base TDB 8.1 já migrada.
- **Vercel:** faça deploy **Preview** da branch; não substitua produção antes da homologação.

O ZIP é código pronto para homologação, **não publicação automática**.
