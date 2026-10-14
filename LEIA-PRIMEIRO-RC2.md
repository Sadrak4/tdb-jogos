# TDB 8.1.0-rc.2 — Correção emergencial da interface

**Estado: candidata de correção para testes, não homologada para produção.** Esta entrega **não altera** GitHub, Supabase ou Vercel automaticamente.

## Defeito real identificado na RC1

O arquivo `hub/hub.js` registrava um evento em `#top-training`, mas o elemento não existia em `index.html`. Durante a inicialização, o navegador lançava `Cannot read properties of null (reading 'addEventListener')`, interrompendo a configuração de praticamente todos os controles registrados depois desse ponto. O botão de criar sala funcionava porque seu evento era instalado antes da exceção.

## Correções nesta RC2

1. Incluído o botão funcional **Treinar contra BOT** no menu lateral.
2. Registro de evento defensivo no JavaScript, evitando a mesma falha caso haja HTML em cache ou uma incompatibilidade temporária.
3. Prioridade para `tdb_hubs.owner_id` ao recuperar o criador original de salas antigas, sem confundir criador com o antigo administrador ativo em `data.ownerId`.
4. Salas privadas continuam visíveis ao criador mesmo depois de ele ter saído, para permitir reentrada e exclusão.
5. Versão atualizada para RC2 e parâmetros de cache em CSS/JS para evitar misturar arquivos antigos.
6. Teste de regressão para autorização de exclusão, preservação do criador e visibilidade de salas privadas.

## Validação realizada

- Verificação de sintaxe em JavaScript.
- `npm run test:integrated`: passou com dependência de Supabase simulada para testes locais.
- Navegador Chromium com API simulada: login, iniciar treino, histórico, abrir criação de sala, **entrar em sala antiga**, exibição dos botões do criador, configurações, criar mesa, biblioteca musical, chat, pessoas, mesas e clique para excluir sala. Nenhum erro JavaScript nesses fluxos.
- Teste do backend em memória: um visitante **não** exclui sala de terceiro; o criador original **pode** excluí-la depois de sair e retornar.

**Ainda NÃO testado:** autenticação e permissões em contas reais no Supabase do usuário; versão Vercel publicada; WebRTC com três pessoas; compatibilidade com todos os registros existentes. Não promova à produção antes de homologar.

## Como instalar para teste sem perder a versão anterior

1. Guarde um backup da beta/RC1 publicada. No GitHub Desktop, crie uma branch de teste.
2. Substitua os arquivos do projeto pelos da RC2 nessa branch e confira o diff; não copie o `node_modules` de testes.
3. Não é necessário executar novo SQL para **esta correção**; use o banco de teste existente.
4. Faça commit e push da branch, e abra um **Preview Deployment** na Vercel. Teste login, sala antiga, configuração, exclusão, playlists e jogos antes de promover ao domínio principal.
5. Após deploy, atualize o site com Ctrl+Shift+R para carregar o JavaScript novo.
6. Se a versão RC1 estiver impedindo usuários de utilizar o site em produção, o caminho de menor risco é restaurar o último deploy conhecido como funcional enquanto valida a RC2.

## Arquivos afetados

`index.html`, `hub/hub.js`, `server/hub-service.js`, `package.json`, `tests/v81-rc2-regression.mjs`, `CHANGELOG.md`, `README.md` e este guia.
