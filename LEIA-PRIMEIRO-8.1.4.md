# TDB 8.1.4 RC1 — estabilidade e desempenho

## Estado da entrega

**Candidata a homologação, NÃO PUBLICADA.** Gerada a partir do ZIP oficial TDB 8.1.3 RC1. Não foi executado SQL nem realizado deploy na conta do usuário. Xadrez e Truco continuam usando os motores originais; Sinuca permanece fora da interface e criação. Logo oficial e Premium Gold + Social inalterados.

## Ordem segura de instalação (IMPORTANTE)

1. Faça backup do ZIP e da branch que está em produção (GitHub Desktop). No Supabase, faça backup/snapshot das tabelas `tdb_shared`, `tdb_matches`, `tdb_game_results`, `tdb_sessions`, `tdb_hubs` e demais dados críticos.
2. Preferencialmente crie projeto Supabase de homologação com esquema/migrações equivalentes, para não afetar os jogadores atuais.
3. **No Supabase de homologação**, rode uma única vez `database/SUPABASE-PERFORMANCE-v8.1.4.sql` no SQL Editor. É uma migração **aditiva** com três funções RPC: `tdb_cas_game_state` (atualização atômica de jogos), `tdb_rate_consume` (rate limiter atômico) e `tdb_profile_history_stats` (histórico agregado completo). Não contém `DROP` nem `DELETE` de dados.
4. Aguarde a atualização do cache de esquema PostgREST e confirme que as funções respondem à conta `service_role`; as funções estão bloqueadas para `anon` e `authenticated`.
5. Faça commit da versão 8.1.4 em branch de testes no GitHub Desktop; use o Vercel Preview apontado ao Supabase de homologação.
6. Teste login/logout, sala antiga do criador, exclusão manual, lista de salas, entrada e chat, playlists, música, criação de mesas e BOTs, jogo com duas contas, cartas ocultas, transmissão e saída/reconexão.
7. Compare a aba Network do navegador antes/depois: endpoint `/api/hub` envia cabeçalho `Server-Timing` com duração de rate limit, manutenção e processamento Hub. Isso NÃO é medição já realizada na Vercel real.
8. Só após os testes autorize a publicação. Para produção, aplique o mesmo SQL **antes** de publicar o código 8.1.4. O novo código depende da RPC CAS ao salvar jogadas.

## Melhorias do código

- A inicialização fria deixa de consultar sete tabelas do Supabase; mantém verificação essencial da tabela de usuários.
- A checagem de manutenção não é repetida por `hub-service.ready()` e recebe cache curto de 1,5 s no router.
- Sessão: leitura da sessão e do usuário em uma consulta via FK quando o esquema permite, sem cache de credencial e sem atrasar revogação.
- Polling de sala usa limitador local leve; ações sensíveis continuam protegidas por rate limiter persistido, agora com uma RPC atômica em uma chamada. Proteção local em falha do banco, sem prometer limite global perfeito no tráfego de polling de várias instâncias.
- Consulta de sala reconcilia somente a mesa selecionada; o heartbeat processa uma mesa por vez para manter resoluções/abandonos de mesas não abertas.
- Chat consulta somente mensagens novas depois da primeira carga; DOM de participantes só é redesenhado quando muda.
- Polling adaptativo: ~1,8 s com jogo aberto, ~4,5 s sem mesa selecionada, ~12 s em aba oculta. Heartbeat de presença ~22 s permanece ativo.
- Resposta de ações leves de música/chat deixa de aguardar um segundo snapshot bloqueante. Ações críticas de configuração da mesa aguardam a visão consistente.
- Jogadas e ticks usam gravação atômica por versão, protegendo contra múltiplas requisições Vercel concorrentes.
- Registro `tdb_matches` atualizado na criação e finalização, não em cada movimento; histórico `tdb_game_results` continua idempotente.
- Limpeza de sala só libera partidas depois de **confirmar** que a exclusão condicional removeu a linha.
- Expulsão administrativa cancela partidas atingidas sem declarar vencedor. Saída voluntária registra o instante para a tolerância de 3 minutos.
- Vaga de transmissão expira 30 s após a detecção de ausência pela regra de presença; não é reiniciada automaticamente.
- Totais do histórico passam a agregar todos os resultados, não apenas os 100 mais recentes. A lista continua limitada às 20 partidas mais recentes.

## Testes locais

- `npm run test:integrated`: passou com testes de servidor em memória, incluindo CAS em disputa e cancelamento por expulsão.
- `npm run test:visual`: passou no Chromium com API simulada (desktop/mobile, home, janelas clássicas, Xadrez, Truco, BOTs, ações de sala, música e chat).
- `node --check` em JavaScript verificado sem problemas de sintaxe.

**Limites dos testes:** nesta sessão a instalação dos pacotes NPM falhou por indisponibilidade de DNS. Para executar a suíte local de módulos, usamos temporariamente um substituto isolado de `@supabase/supabase-js`, que **não foi incluído no ZIP**. Isso comprova lógica local, NÃO banco Supabase real. Nenhuma carga WebRTC com usuários reais nem latência real Vercel foi medida. O SQL não foi executado contra PostgreSQL neste ambiente.

## Segurança / rollback

- Não usar a nova RC1 diretamente em produção antes de testar no Preview com SQL migrado.
- Rollback de frontend/backend: restaurar branch da 8.1.3; as três funções adicionadas no banco podem permanecer sem interferir com a versão antiga.
- Não apagar tabelas, playlists ou históricos. Caso precise reverter SQL, revisar dependências antes; nunca remover funções em uso por uma versão publicada.
- `Server-Timing` informa duração de fases, sem expor sessões/senhas.

## O que NÃO foi mexido

- Visual Premium Gold + Social e arquivos originais de identidade/branding.
- Motores de Xadrez e Truco, cartas, regras, níveis de dificuldade dos BOTs.
- Sinuca segue desativada, e históricos antigos são preservados.
- Nenhum deploy, SQL ou publicação feitos automaticamente.

## Riscos ainda para homologar

A atualização não instala TURN/SFU. Três transmissões com múltiplos espectadores exigem validação de rede e podem requerer infraestrutura extra. Polling local é limitado por instância Vercel; restrições globais adicionais podem ser implementadas com WAF/infraestrutura. A migração SQL e o CAS devem ser testados no Supabase de homologação antes de declarar a integridade de produção comprovada. Mesas não selecionadas continuam avançando via heartbeat em cadência reduzida, não por um worker permanente.
