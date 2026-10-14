# TDB Gaming Universe 8.3.0 RC1 — LEIA ANTES DE PUBLICAR

**Esta é uma versão candidata para homologação. Não foi publicada no GitHub, no Supabase ou na Vercel.**

## O que mudou

- **Notícias em primeiro lugar depois do login**: home estilo portal gamer premium, com manchete principal vinculada a uma notícia pública verificada pelo serviço de fontes da 8.2, filtros Steam/Epic/Cloud/Notícias, navegação e ações para criar/entrar em sala.
- **TDB Gaming Universe**: novo layout de navegação, logo TDB **original** e identidade preto/dourado metálico/verde, cards aprimorados, busca rápida com `Ctrl + K` / `Cmd + K` (atalhos, notícias carregadas e salas, com setas do teclado), coluna de salas disponíveis e ações, painel de conta e comportamento responsivo.
- **Sala redesenhada**, com cabeçalho mais elegante, acesso rápido a Mesas, Transmissões, Chat e Participantes, orientação visual para criar Xadrez/Truco quando ainda não há mesas e layout 3 colunas em telas largas. O sistema existente de jogos e música permanece conectado aos mesmos controles e IDs.
- **Retomar última sala**: o TDB agora abre nas Notícias em vez de entrar sozinho na sala anterior. Se o navegador salvou o código, o usuário pode usar o botão «Retomar última sala» na home. Isto é uma mudança de comportamento deliberada para atender ao requisito de Notícias primeiro.
- Ilustração atmosférica da home reutiliza um recorte da **prévia de design aprovada**. Ela é arte decorativa, **não** uma imagem da notícia atual.
- Conteúdo da home é real **quando a fonte pública responder**, sem exibir preços ou notícias inventadas. Quando o feed falhar, são oferecidos links oficiais.
- **Não há Ranking**, novos jogos fictícios, amigos fictícios ou botões de sistemas ainda não construídos.

## O que foi preservado

- Xadrez e Truco originais, motores, BOTs em níveis de dificuldade, partida online, espectadores, revanche e históricos.
- Janelas dos jogos com minimizar/maximizar/fechar/reabrir.
- Música YouTube, sincronização, favoritos e playlists pessoais da 8.2.
- Chat, permissões, criador de salas antigas, exclusão e expiração das salas.
- Compartilhamento de tela existente, até 3 transmissores por sala, com WebRTC direto P2P + STUN; nenhuma infraestrutura TURN/SFU nova.
- A Sinuca continua fora da interface e não pode ser criada via API ativa.
- Nenhum novo SQL, API paga, serviço Cloudflare/LiveKit ou custo adicional obrigatório.

## Instalação em testes

1. **Backup:** preserve o ZIP que já está funcionando, o seu repositório atual e o banco de dados antes de experimentar.
2. **GitHub Desktop:** crie uma branch (`test/tdb-8.3-gaming-universe`) e copie o conteúdo **do diretório do ZIP** para a raiz do projeto. Não copie arquivos `.env` com credenciais para o GitHub. Faça commit da branch e publique-a para Preview.
3. **Supabase:** **nenhum SQL novo** na 8.3. Porém a 8.3 herda os requisitos da **8.1.4**: se a migração `database/SUPABASE-PERFORMANCE-v8.1.4.sql` ainda não foi aplicada, faça backup e valide-a em ambiente de testes antes de ativar o backend correspondente. Não execute SQL sem conferir o estado do banco.
4. **Vercel:** use **Preview** da branch, conectado a um Supabase de homologação apropriado. Mantenha as mesmas variáveis de ambiente da 8.2.0 e consulte `DEPLOY-VERCEL.md` para requisitos gerais.
5. Faça os testes abaixo; publique em produção somente após aprovação.

## Checklist de homologação real

- Login abre **Notícias**, sem entrar automaticamente na sala anterior. Retomar sala deve funcionar inclusive depois de entrar numa sala e voltar às Notícias.
- Links de notícias e ofertas devem abrir **fontes reais** e mostrar preços/descontos somente quando confirmados.
- Criar sala pública/privada, entrar por código e voltar de uma sala.
- Dona(o) de sala antiga consegue configurá-la e excluí-la; terceiros não.
- Criar Xadrez e Truco com humanos e com BOTs (Truco 1×1 e 2×2); peças/cartas, turnos, relógios, espectadores, privacidade das mãos e reconexões.
- Janelas do jogo minimizar/maximizar/fechar sem abandonar; reabrir a partida.
- Música entre duas contas, playlists pessoais, fila, históricos, sincronização e volume.
- Chat e painel social; transmissões WebRTC em redes reais (celular/Wi-Fi/firewall) com consentimento do navegador.
- Testar home e sala em 390 px, desktop 1440 px, e telas largas; observar consumo de API e lentidão.

## Testes locais já realizados

- `npm run test:integrated`: **passou**, com stub isolado de `@supabase/supabase-js` para testes (sem banco de dados externo). **Não representa teste do Supabase real.**
- `node tests/v820-free-features.mjs`: passou (biblioteca, notícias e cache).
- `python tests/v830-gaming-universe-browser.py`: passou no Chromium desktop/mobile usando API simulada, com verificação da home, navegação, busca por notícias, seleção por teclado, retorno à última sala, instruções de mesas, filtros, sala, modais e ausência de rolagem horizontal.
- `python tests/v812-classics-browser.py`: passou, incluindo os dois jogos, BOTs, janelas e privacidade.
- `python tests/v81-rc3-browser.py`, `python tests/v811-premium-browser.py` e `python tests/v820-free-browser.py`: testes de regressão adaptados à folha de estilo e controles novos e executados com API simulada.

**Não foram validados nesta execução**: Preview da Vercel, banco Supabase real, APIs públicas de notícias ao vivo, YouTube real, medições online de latência, conexões WebRTC entre redes reais, nem alta concorrência em produção.

## Dependências e custos

A 8.3 **não requer contratação nova** nem tokens de IA. Continua sujeita às cotas/termos dos serviços que você já utiliza: Vercel, Supabase, YouTube, feeds públicos. STUN gratuito **não garante** conectividade WebRTC em todas as redes; TURN/SFU não foram implantados. Para executar o app normalmente é preciso instalar as dependências declaradas no `package.json` (`npm install`) e configurar as variáveis de ambiente.

## Rollback

Se a Preview falhar, volte a branch à versão 8.2.0 e redeploye. Esta atualização não altera o banco nem requer migração de reversão. Se seu banco ainda não tem a migração 8.1.4, **não trate este rollback visual como rollback da migração antiga**.
