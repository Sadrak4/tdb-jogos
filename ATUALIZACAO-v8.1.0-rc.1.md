# TDB 8.1.0-rc.1 — Atualização integrada (CANDIDATA A TESTES)

**Não publicar diretamente em produção.** Esta é uma versão candidata preparada sobre a beta.3 oficial, com manutenção da identidade preta, dourada, verde e do logo original.

## Módulos integrados

- **Salas:** identificação persistente do criador original, exclusão manual, permissão para criar mesas, expulsão/bloqueio, presença baseada em atividade, expiração lógica após 60 minutos sem humanos, limpeza de dados por rotina.
- **Música:** ações com permissões definidas pelo criador, votação majoritária para pular, favoritos e playlists **pessoais** reutilizando os dados antigos de `music-favorites:*` e `music-presets:*`; adicionar playlist à fila da sala social.
- **Mesas:** configuração inicial de Xadrez, Sinuca e Truco 1×1/2×2, até quatro participantes no Truco, espectadores livres/bloqueados/aprovados, remoção de espectadores autorizados.
- **BOTs:** inclusão manual, escolha individual de dificuldade e posição/equipe, e treinamento individual. As três modalidades exigem testes de partidas completas contra níveis diferentes.
- **Partidas:** pausa de conexão, retorno até 3 minutos depois da detecção, abandono, cancelamento administrativo sem vitória indevida, revanche por unanimidade humana, mantendo histórico anterior.
- **Histórico:** gravação de resultados na tabela existente `tdb_game_results`, sem ranking; interface com os resultados mais recentes.
- **Tela:** até 3 sessões por sala e 1 por usuário, espectadores da sala com acesso livre, áudio individual por transmissão, sessão de origem mantida quando se troca de sala dentro da página, reserva de vaga de 30 segundos após perda de presença, necessidade de iniciar a captura manualmente.

## Pontos de atenção

1. **Expiração:** uma sala torna-se inválida 60 minutos depois de ficar vazia, inclusive para quem tenta voltar por código. A remoção física do Supabase é oportunista (listagens) e programada. O Vercel Hobby permite apenas agendamento diário; a versão fornecida usa `0 3 * * *`. Para uma limpeza física frequente, exigir plano/serviço que suporte cron mais frequente; em Vercel Pro, considere `*/5 * * * *`.
2. **Transmissões:** WebRTC entre navegadores ainda demanda homologação com usuários simultâneos e redes distintas; TURN pode ser indispensável e uso pesado pode exigir SFU. Não foi demonstrado que 3 streams suportam 30 espectadores em produção.
3. **Persistência:** nenhum schema novo foi criado. Se a beta.3 já está instalada corretamente, NÃO repita migrações antigas. `tdb_hubs`, `tdb_hub_messages`, `tdb_hub_signals`, `tdb_game_results` e as estruturas antigas de contas devem estar disponíveis.
4. **Testes:** suíte de lógica de servidor executada localmente; para os testes sem conexão externa foi usado um substituto **local** da dependência Supabase, que NÃO acompanha o ZIP. Não foi validada implantação real com Supabase/Vercel. Ver `PUBLICACAO-v8.1.0-rc.1.md`.
5. **Compatibilidade:** não remover registros antigos de músicas, conta ou partidas. Não há ranking.

## Arquivos principais alterados

`server/hub-service.js`, `server/game-service.js`, `server/truco-engine.js`, `server/pool-engine.js`, `server/platform-service.js`, `server/stats-service.js`, `server/http-router.js`, `server/http-handlers/hub.js`, `server/http-handlers/hub-cleanup.js` (novo), `hub/hub.js`, `hub/hub.css`, `index.html`, `vercel.json`, `package.json`, `tests/v81-integrated.mjs` (novo), `.env.example`, `VERSAO.txt`.
