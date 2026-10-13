# TDB v7.2.5 — Central de Atividades

## O que esta versão entrega

- Na sala **TDB Lobby (Música)**, agora existe uma **Central de Atividades** acima do player.
- Cada sala pode criar **uma mesa de organização** para Xadrez, Sinuca ou Truco.
- Participantes da própria sala podem entrar como jogador ou espectador, sair da mesa e acompanhar a lista de pessoas.
- O criador da mesa (ou dono da sala) pode encerrar a mesa.
- O servidor verifica login, participação na sala, limite de jogadores e permissões para cada ação.
- Mesas em salas online usam a tabela **tdb_shared já existente**; cada sala tem seu próprio estado.
- No modo local sem conexão online, a mesa usa armazenamento local e BroadcastChannel do navegador.
- Ações nas mesas **não reconstroem a tela**, e portanto não desmontam o player e a transmissão apenas por criar ou entrar em uma mesa.
- Corrigida a configuração da Vercel para incluir a rota `/api/profile/public` que já existia no servidor.

### Limites desta etapa — importante

**As mesas são de organização, NÃO são partidas jogáveis.** Nesta versão, o usuário ainda não abre o Xadrez/Sinuca/Truco dentro do Lobby. Essa integração virá nas próximas versões do projeto. A música e a tela continuam funcionando dentro do Lobby atual, mas os jogos do sistema antigo continuam separados.

Há **apenas uma mesa de organização por sala** nesta fase. A versão de múltiplas mesas virá depois. Em produção, atualizações simultâneas extremamente próximas podem disputar a mesma gravação no Supabase, já que esta primeira versão reaproveita o registro JSON existente; a futura infraestrutura de partidas deverá tratar concorrência de forma transacional.

## O que atualizar agora

| Plataforma | Atualização | Motivo |
|---|---|---|
| **GitHub Desktop** | **SIM — obrigatória** | Enviar arquivos modificados e novos para o repositório |
| **Supabase SQL Editor** | **NÃO — nenhuma alteração SQL** | A Central usa `tdb_shared`, que já faz parte da estrutura atual |
| **Vercel** | **Deploy automático** | Publica o commit enviado ao repositório GitHub, se a integração estiver ativa |

**Não execute novamente `SUPABASE-SCHEMA.sql` nem migrações antigas somente por causa desta versão.** Se o projeto Supabase ainda não estiver configurado, é uma tarefa de instalação separada.

## Como publicar com GitHub Desktop

1. Feche os arquivos do projeto que estiver editando e mantenha um backup da sua v7.2.4.
2. Extraia o ZIP `TDB-v7.2.5-CENTRAL-ATIVIDADES.zip`.
3. No **GitHub Desktop**, escolha seu repositório TDB e abra **Repository → Show in Explorer**.
4. Copie **o conteúdo de dentro da pasta** `TDB-v7.2.5-CENTRAL-ATIVIDADES` para a pasta raiz do repositório, substituindo arquivos com o mesmo nome. Não coloque a pasta inteira dentro do repositório, nem apague `.git`.
5. Confira em **Changes** que os arquivos novos e modificados apareceram (incluindo `server/activity-service.js`, a rota `server/http-handlers/platform/activities.js`, `games/music/music.js` e `vercel.json`).
6. Preencha **Summary** com `TDB v7.2.5 - Central de Atividades` e clique em **Commit to main** (ou à branch configurada).
7. Clique em **Push origin**.
8. Acesse o painel da **Vercel → Deployments** e confirme que o deploy da branch publicada ficou **Ready**.
9. Verifique `https://SEU-DOMINIO/api/health`; o campo `version` deve indicar `7.2.5`.

### Alternativa por terminal (não necessária se usar GitHub Desktop)

Depois de copiar os arquivos para a pasta do repositório:

```sh
git status
git add .
git commit -m "TDB v7.2.5 - Central de Atividades"
git push
```

## Teste prático recomendado após o deploy

1. Entre em sua conta, crie ou abra uma sala do **TDB Lobby**.
2. Abra a **Central de Atividades** e clique em **Criar mesa** de Xadrez, Sinuca ou Truco.
3. Entre com uma segunda conta em outro navegador na mesma sala. Verifique se a mesa aparece (atualização em até poucos segundos).
4. Entre como jogador ou espectador; veja a atualização da lista também no primeiro navegador.
5. Comece uma música e compartilhe a tela; crie, entre e saia da mesa para confirmar que **essas ações não reiniciam o player nem encerram a transmissão**.
6. Encerre a mesa. A sala de música deve continuar aberta com seus participantes.

## Arquivos principais adicionados/alterados

- `server/activity-service.js` **novo** — regras e estado das mesas.
- `server/http-handlers/platform/activities.js` **novo** — GET/POST autenticados para mesas.
- `server/http-router.js` — registro da nova rota.
- `server/realtime-store.js` — evento realtime direcionado para atividades.
- `core/online-client.js` — cliente de API, avisos em tempo real e versão.
- `games/music/music.js` — interface, ações e atualização parcial das mesas.
- `games/music/music.css` — estilos e responsividade da Central.
- `vercel.json` — redirecionamento para nova API e correção de perfil público.
- `package.json`, `app.js`, `server.js`, `server/http-handlers/health.js`, `server/maintenance-service.js` — versão exibida/registrada.
- `tests/v7.2.5-activities-smoke.mjs` **novo** — teste das regras e integrações.

## Verificações realizadas antes da entrega

- `npm run test:audit`: passou.
- `node tests/v7.2.0-pool-engine-smoke.mjs`: passou.
- Teste de regressão musical da v7.2.4, adaptado apenas para a expectativa de versão: passou.
- 134 arquivos JavaScript/MJS analisados pelo `node --check`: nenhum erro de sintaxe.

**Não foram executados testes reais com duas contas hospedadas na Vercel, YouTube e WebRTC.** Eles precisam ser feitos após o deploy, com conexão ao seu Supabase e em dois navegadores.

## Próximo passo planejado

**v7.2.6 — Salas permanentes:** desvincular a identidade da sala da identidade da partida e começar a integração dos jogos sem sair do Lobby. Essa etapa pode requerer migração SQL; isso será confirmado antes da entrega.

## Revisão organizacional (mesma versão v7.2.5)

- Documentos das versões anteriores foram movidos para `docs/historico/`.
- Scripts SQL históricos foram movidos para `database/` **sem alterar seu conteúdo**.
- Foram atualizados os caminhos em testes que leem esses arquivos, textos de orientação e o `README.md`.
- `VERSAO.txt` e `DEPLOY-VERCEL.md` agora descrevem corretamente a v7.2.5.
- **Para limpar a pasta do GitHub de verdade, é preciso mover os arquivos antigos do repositório antes de copiar o novo ZIP.** Siga o guia `DEPLOY-VERCEL.md`.
- Supabase: **não atualizar**; GitHub Desktop: **atualizar**; Vercel: deploy automático se configurado.
