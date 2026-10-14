# TDB 8.1.0-rc.3 — Mesas por jogo e BOTs dentro da sala

**Versão candidata para testes. Não publicar em produção sem validar com usuários reais.**

## O que mudou

1. Na sala, abra **Mesas de jogos → + Nova mesa**. Ao mudar entre Xadrez, Sinuca e Truco, aparecem apenas os campos daquele jogo.
2. Selecione **Com BOT dentro desta sala** no próprio formulário ou clique em **🤖 Jogar com BOT**, ao lado de + Nova mesa.
3. Xadrez oferece relógio e cor. Sinuca oferece tempo por tacada e assistência de mira. Truco oferece 1×1/2×2 e tempo por jogada.
4. Escolha a dificuldade. No Truco 2×2 com BOT, escolha **1, 2 ou 3 BOTs** para preencher manualmente as vagas. Se o quadro estiver completo só com BOTs, a partida começa na sala; se faltarem jogadores, a mesa espera amigos ou novos BOTs.
5. O modo **Com amigos** cria uma mesa sem BOTs; a opção **+ BOT** permanece no cartão da mesa para incluir depois.
6. **Treinar contra BOT** no menu lateral continua existindo como modo individual separado.

## Integridade e testes locais realizados

- `node --check hub/hub.js` e `node --check server/hub-service.js`.
- `npm run test:integrated` (testes Node, backend local, incluindo criação e início de BOTs nos três jogos).
- `python tests/v81-rc3-browser.py` em ambiente com Playwright e Chromium para validar troca de campos, BOTs na sala e ausência de erros de JavaScript.
- Testes com Supabase real, Vercel Preview e pessoas em salas online ainda pendentes.

## Publicação segura

**GitHub Desktop:** crie uma branch de teste, copie o conteúdo do pacote e faça commit/push. Não substitua a branch de produção sem validar.

**Supabase:** nenhuma nova migração SQL é exigida pelas alterações da RC3; mantenha o esquema já aplicado na RC2.

**Vercel:** publique primeiro como **Preview Deployment**. Abra a versão em janela anônima ou use Ctrl+Shift+R para carregar os novos JS/CSS. Verifique permissão de criação de mesas, jogadores humanos, BOTs e início de partida antes de decidir sobre produção.

**Principais arquivos modificados:** `index.html`, `hub/hub.js`, `hub/hub.css`, `server/hub-service.js`, `package.json` e novos testes. A biblioteca de música, migrações SQL e as regras gerais das salas não foram modificadas nesta correção.
