# TDB v7.1.4 — Revisão final consolidada

Esta versão consolida as alterações da linha v7.1.x em cima da base v7.0.1 e corrige conflitos de CSS/responsividade que ainda podiam sobrescrever ajustes mais novos.

## Perfil / Social
- Perfil 2.0 com avatar, banner opcional, presença, estatísticas e partidas recentes.
- Perfil público de amigos ao clicar no usuário.
- Convite para a sala atual diretamente pelo perfil do amigo.
- Endpoint dedicado `GET /api/profile/public`.
- Banner validado no backend para URLs HTTP/HTTPS.

## Presença
- Estados: Online, Ausente, No Truco, No Xadrez, No Blackjack, Ouvindo música e Assistindo partida.
- Gerenciamento de inatividade separado em `core/presence-manager.js`.
- Heartbeat e versão do cliente alinhados com v7.1.4.

## Truco
- Vira central aumentada para leitura melhor.
- Carta jogada pelo adversário superior movida para a zona superior da mesa, fora da Vira.
- A carta jogada fica em camada superior às cartas fechadas do adversário caso as áreas se encostem.
- Mantidos placar, indicação de turno, animações, pedidos Truco/6/9/12, histórico de rodadas e resultado final.

## Xadrez
- Tabuleiro usa mais da área útil disponível.
- Painel direito de histórico/capturas/ações fica visível e rolável, sem ser cortado em desktop/notebook.
- Em larguras comuns de notebook, o painel informativo esquerdo é removido antes de sacrificar tabuleiro ou histórico.
- Em telas pequenas, a própria tela do Xadrez passa a rolar internamente.
- Relógio opcional, último movimento, peças capturadas, promoção, proposta de empate, desistência, revanche e PGN preservados.
- BOT com anti-loop reforçado para evitar ficar alternando repetidamente entre as mesmas casas quando existem alternativas legais.
- Afogamento e material insuficiente continuam sendo empates automáticos porque fazem parte das regras do xadrez. Repetição automática continua desativada no TDB.
- Mensagem de afogamento agora explica por que a partida terminou empatada.

## TDB Lobby / Música
- Fila compartilhada, autor de cada música, votação para pular, sincronização e permissões do host preservados.
- Painel de ferramentas/compartilhamento não pode ultrapassar a largura da viewport.
- Em desktop largo: 3 colunas com painel direito rolável.
- Em notebook: 2 colunas e painel de ferramentas em uma linha completa abaixo, com rolagem vertical interna da tela.
- Em mobile: layout em coluna única com rolagem interna.
- Inputs, busca, botões e blocos limitados à largura real do painel.

## Blackjack
- Visual de cassino preservado e consolidado.
- Cartas maiores e legíveis, sem margens negativas/sobreposição entre cartas.
- Dealer, apostas, fichas, rodada e turno mais destacados.
- Controles PEDIR / PARAR / DOBRAR / SEPARAR com estado interativo.
- Escolha de fichas/aposta, animação de fichas indo/voltando da mesa e feedback sonoro preservados.
- Resumo visual de fim de rodada e atividade da mesa preservados.

## Admin 2.0
- Métricas de usuários online, salas abertas, partidas em andamento, contas banidas, reportes e erros.
- Busca de contas, banimento/desbanimento, redefinição de senha e encerramento de sessões.
- Reportes, logs, auditoria, manutenção e visão operacional das salas.

## Estrutura / estabilidade
- `ui/gameplay-fixes.css` é a camada final autoritativa para jogos, evitando que CSS legado sobrescreva correções novas.
- Metadados de versão sincronizados em package, health endpoint, heartbeat, logs e scripts de inicialização.
- Mantidas as rotas Vercel e integração Supabase existentes.

## Banco de dados
A única migration da linha v7.1.x é:

`SUPABASE-MIGRATION-v7.1.0.sql`

Ela adiciona `banner text` em `public.tdb_users` com `IF NOT EXISTS`. Se essa migration já foi executada, não há SQL adicional para a v7.1.4.
