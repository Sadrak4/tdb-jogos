# TDB 8.3.1 RC1 — Social & Admin

Base: TDB 8.3.0 Gaming Universe. Esta versão mantém a interface Premium Gold + Social.

## Interface

- Menu lateral: apenas **Jogos**, com o mesmo treinamento individual e BOTs; botão auxiliar técnico `#top-training` permanece montado e oculto para preservar os eventos.
- Cloud Gaming substituído por **Nuuvem**, a loja brasileira em https://www.nuuvem.com/br-pt. A integração inicial usa link oficial, sem afirmar preços não verificados; feed de NVIDIA removido.
- Card "Sua galera / Na sala" removido. Compartilhamento de tela transferido para o painel social da direita, com os mesmos IDs WebRTC, botões e limites anteriores.
- Lista de participantes continua disponível no cabeçalho e no botão **Ver participantes**.
- Chat recolhível sem esconder o compartilhamento. Música e jogos preservados.
- Novo Perfil com banner, avatar HTTPS, atualização de nome, resultados históricos pessoais de Xadrez e Truco.
- Nova Central de Amigos: busca por nome/ID, solicitação, aceite, recusa, remoção, convites e aceitação de convites.
- ADM restaurado como central com autenticação independente, indicadores, contas, relatórios, logs, salas e manutenção.

## Backend

- Convites agora validam a sala social atual em `tdb_hubs` e chamam `Hub.joinRoom` ao serem aceitos; a ligação antiga com `tdb_rooms` foi corrigida.
- Convites mantêm exigência de amizade e validam participação do remetente, sala ativa, banimento e capacidade.
- ADM não utiliza mais credenciais hardcoded. Requer `TDB_ADMIN_USERNAME`, `TDB_ADMIN_PASSWORD_SALT`, `TDB_ADMIN_PASSWORD_HASH` na Vercel. Sem variáveis válidas, LOGIN ADM é bloqueado.
- Consultas do ADM agora monitoram as salas atuais `tdb_hubs`.

## Mantido e não alterado

- Motores de Xadrez e Truco e seus BOTs, incluindo modalidades/turnos/regras atuais.
- Janelas dos jogos, direitos do criador, música e playlists pessoais, limite de três transmissões.
- Sem Sinuca; sem ranking competitivo e sem TURN/SFU/Cloudflare pagos.
- Nenhuma exclusão ou recriação de tabelas; nenhum SQL novo nesta versão.

## Testes

- `npm run test:integrated` — regras, contas, salas, jogos e BOTs usando stub local de Supabase.
- `npm run test:free` — música, feeds públicos simulados e cache.
- `npm run test:visual` — Chromium dos controles existentes em desktop/mobile.
- `npm run test:social` — ADM via variáveis de ambiente, elegibilidade de convites, UI de perfil/amigos/ADM e transmissão.

Os testes usam um stub/test harness e não validam Supabase ou Vercel de produção. É obrigatória a validação em Preview com banco de homologação, especialmente solicitações, convites e credenciais ADM.
