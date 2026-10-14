# Alterações técnicas — TDB v8.2.0 RC1 (sem serviços adicionais pagos)

## Código

- Novo `server/discover-service.js`: leitura de fontes públicas Steam/Epic/Xbox/NVIDIA, validação básica das ofertas, URLs oficiais permitidas, feeds normalizados, timeout, cache em memória. Não guarda API keys.
- Nova rota pública `/api/discover` com cache de CDN e limitador local de requisições sem leitura no Supabase por GET.
- Nova UI `hub/discover.js` e estilos `hub/upgrade-free.css` para home gamer e sala organizada. Não substituem o CSS dos jogos.
- `server/platform-service.js`: histórico de reprodução pessoal (`music-history:<userId>`), `RENAME_PRESET`, `MOVE_PRESET_TRACK` e `REMOVE_PRESET_TRACK`.
- `server/hub-service.js`: consulta autenticada da faixa efetivamente tocada para registrar histórico confiável.
- `hub/hub.js`: busca e ações na biblioteca, coração de favoritos, estado de sincronização com tolerância/cooldown, painel social e musical recolhível e estados de conexão P2P.
- `index.html`: notícias e promoções + botões de layout + estado de sincronização.
- `vercel.json`: nova rota, sem Cron extra nem serviço de mídia.
- Mantidos Xadrez, Truco, BOTs e Sinuca removida.

## Sem SQL novo

Utiliza o mesmo armazenamento de perfis musicais da 8.1.4. O SQL anterior 8.1.4 permanece obrigatório se ainda não tiver sido aplicado em uma instalação antiga.

## Testes

`npm run test:integrated`

`npm run test:visual`

`npm run test:free`

As suítes de API/Playwright rodam com respostas e armazenamento simulados; validar novamente em Preview antes de produção.
