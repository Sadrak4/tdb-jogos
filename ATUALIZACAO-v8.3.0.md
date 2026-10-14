# Registro técnico — TDB 8.3.0 RC1 Gaming Universe

## Base e escopo

Versão 8.2.0 RC1 sem custos extras, que por sua vez herda 8.1.4 para desempenho e integridade. Esta RC1 é principalmente **redesign da experiência**, sem reescrever motores do Xadrez e Truco, backend, Supabase ou WebRTC.

## Alterações por arquivo

- `index.html`: notícias primeiro, painel principal + coluna lateral de comunidade; marca oficial, sidebar e topbar novas; busca rápida; ações de salas; reorganização visual interna da sala; barra compacta e diálogos de pesquisa/conta. IDs e controles de jogos/sala/música mantidos.
- `hub/universe-83.css` (novo): sistema visual Premium Gold + Social refinado, mais editorial; responsive desktop/mobile, melhor hierarquia de botões/cards e adaptação de 3 colunas para telas largas. Não substitui folhas originais dos jogos.
- `hub/universe-83.js` (novo): liga novos botões aos eventos e controles existentes; resultados de busca sobre notícias públicas carregadas, salas abertas e atalhos, seleção pelas setas do teclado; recebe notícias públicas reais do módulo discover; painel de conta sem funcionalidades inexistentes; opção para retomar sala anterior (atualizada quando o usuário volta à home), e ações do guia de Xadrez/Truco quando não há mesas.
- `hub/discover.js`: publica o primeiro item público validado para a manchete em destaque, inclusive quando a resposta chega antes da camada visual, mantendo fallback original.
- `hub/hub.js`: primeira visão após login permanece em Notícias; retomar sala anterior via evento, preservando demais fluxos de jogo, sincronização, mídia, WebRTC e autenticação.
- `assets/universe-news-art.webp` (novo): arte decorativa derivada da prévia aprovada, **não é manchete real**.
- `package.json`, `VERSAO.txt`, `README.md`, `CHANGELOG.md`: versão, scripts e instruções.
- `tests/v830-gaming-universe-browser.py`: novas verificações desktop/mobile, home com feed simulado, busca, sala, permissões, botões e rolagem. As suítes de browser legadas foram ajustadas para carregar a folha e os controles novos durante a execução.

## Sem mudança de backend/banco

Sem novos SQLs, campos, migrações ou dependências de API paga nesta RC1. A migração anterior 8.1.4 continua sendo requisito da base caso não esteja aplicada. Os recursos online continuam sujeitos às verificações reais no ambiente de Preview.

## Limitações

- Perfis avançados, sistema novo de amizades, notificações persistentes, Ranking, novos jogos como Damas/Dominó, chat de voz e SFU **não** foram implementados. As prévias anteriores eram visuais, não descrições de funcionalidades prontas.
- O botão de notificações exibe somente o estado atual de conexão e informa que não há uma central de notificações nesta versão.
- Busca `Ctrl+K` filtra atalhos, notícias **já carregadas** e salas **já carregadas**; não faz pesquisa universal no servidor.
- A home apresenta notícias reais do agregador 8.2 quando disponíveis; a arte é ilustrativa e não tenta corresponder à manchete.
