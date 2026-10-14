# Revisão técnica — TDB 8.3.2 RC1

**Base:** 8.3.1 RC1 Social & Admin. **Objetivo:** reorganizar navegação, isolar administração e apresentar ofertas públicas Nuuvem em cards, sem novas dependências pagas.

## Alterações por componente

- `index.html`: sidebar de 6 itens, hooks invisíveis apenas para compatibilidade, usuário/status apenas no cabeçalho, abas de Salas, remoção dos atalhos e diálogo do histórico completo, remoção do ADM embutido.
- `hub/hub.js`: view `rooms`, entrada nas salas existentes sem reescrever `enter`, atualização do feed de salas, histórico completo sem diálogo próprio. Mantém atividades recentes em `profile/public`.
- `hub/universe-83.js`: atalhos de exploração vão para `Salas > Explorar`, usuário com saída no cabeçalho, busca com resultados pessoais acessíveis via Perfil.
- `hub/social-admin-831.js`: Perfil e Amigos apenas; remove cliente ADM da SPA, preserva convites.
- `hub/navigation-832.js` / `.css`: três abas de Salas, pesquisa sobre lista já buscada, UI responsiva.
- `adm/index.html`, `hub/adm-standalone.js`, `hub/adm-standalone.css`: novo aplicativo administrativo isolado na rota `/adm`, utilizando os **mesmos endpoints e a mesma autenticação administrativa restrita** já existentes, sem senha padrão.
- `server.js` e `vercel.json`: suporte a `/adm` tanto em execução Node como na Vercel.
- `server/discover-service.js`: leitor conservador do catálogo Nuuvem, timeout, validação de domínio e produto, preço e desconto presentes no mesmo card, cache e fallback. A extração depende de HTML público não versionado; quando mudar, não mostra preços inventados.
- `hub/discover.js`: mostra Nuuvem em cards e intercala grupos Steam/Epic/Nuuvem/Notícias.
- Testes: novas verificações de navegação, ADM isolado e parser Nuuvem; testes antigos de navegador atualizados para mirar a lista de salas visível, sem mudar o comportamento testado.

## Preservação e segurança

- **Nenhuma modificação** nos motores `server/chess-engine.js`, `server/truco-engine.js`, `games/chess/chess-engine.js`, `hub/classic-games.js` e banco SQL.
- Números, rankings, salas, ofertas e usuários nunca são inventados no feed de produção.
- As credenciais ADM só são processadas no servidor; o painel principal não contém login ou JavaScript administrativo.
- O histórico é mantido no banco por integridade e para mostrar resultados recentes no Perfil.
- Nenhuma alteração foi executada nos serviços externos; sem teste de produção.

## Testes

- Sintaxe de todos os JavaScript: sem falha.
- Integração de salas, músicas, Xadrez, Truco, BOTs, permissões, concorrência, exclusão, expulsão: passou com armazenamento local isolado.
- Chromium desktop (1440px) e celular (390px): navegação, Salas, Perfil, Amigos, BOT, Nuuvem, ADM isolado: passou com APIs simuladas.
- Chromium de regressão: jogo clássico com clique/arraste, modal, BOTs, privacidade de cartas, controles de proprietário, música e chats: passou.
- Nuuvem parser em dados de teste: links, preços, descontos e rejeição de URLs inválidas passaram; **rede real indisponível** para conferir HTML ao vivo.

**Limitações:** ausência de testes reais de performance, Nuuvem ao vivo, homologação do SQL anterior, vídeo WebRTC entre redes ou Vercel/Supabase de produção.
