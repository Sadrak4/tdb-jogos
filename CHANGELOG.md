## 8.3.3 RC1 — Biblioteca e detalhes clássicos dos jogos

- Retirada a barra `room-quickbar` da sala; ação de convidar amigos preservada no cabeçalho.
- Biblioteca musical pessoal em três abas, com pesquisa e playlists expansíveis; renomear, mover e remover músicas mantidos.
- Corrigida perda de favoritos/estado de sincronização quando a janela de jogo era restaurada/fechada.
- Truco: efeito dourado na carta vencedora, resumo de vitória da rodada e mão, novos avisos de Truco/Seis/Nove/Doze e Mão de 11, destaque de manilhas.
- Truco: tempo de revelação reduzido de 1,8 s para 1,25 s, com atualização direcionada na resolução e sem aumentar o polling geral.
- Xadrez: resumo de final de jogo (xeque-mate, desistência, empate, tempo), aviso de empate e recurso de PGN mantidos.
- Motores originais, BOTs, WebRTC, banco de dados, ADM `/adm`, identidade visual e Sinuca removida permanecem intactos, salvo o tempo de revelação explicitamente ajustado no Truco.
- Testes locais de regras, Chromium desktop/mobile, janelas, menus, biblioteca e jogos. Integração total Supabase indisponível neste ambiente pela ausência de dependências npm.

## 8.3.2 RC1 — Navegação, `/adm` e ofertas Nuuvem

- Sidebar reduzida a Notícias, Salas, Jogos, Música, Amigos e Meu perfil, sem nome/status duplicado.
- Salas ganhou Minha sala / Criar sala / Explorar salas em abas.
- ADM passou para `/adm` independente, com login separado; tokens verificados no servidor.
- Remoção da tela independente de histórico sem eliminar dados; histórico recente continua no Perfil.
- Promoções verificáveis do catálogo público Nuuvem com fallback oficial e cache.
- Xadrez, Truco, BOTs, playlists e WebRTC preservados; sem SQL novo ou serviço pago.

# TDB 8.3.0 RC1 — Gaming Universe (redesign aprovado)

- Notícias passam a ser a primeira tela após autenticação, com destaque vinculado ao feed público real e fallback para links oficiais.
- Home estilo portal gamer, sidebar e navegação renovadas em preto/dourado/verde, arte decorativa derivada da prévia oficial aprovada.
- Pesquisa Ctrl+K, botões de ação rápida e lista de salas com dados reais, conta conectada, opção para retomar última sala.
- Salas com cabeçalho, atalhos e layout refinados; continuam os mesmos controles, motores clássicos, BOTs, biblioteca, chat e transmissão.
- Sem Sinuca, ranking, serviços pagos novos ou SQL novo. Requer a migração já prevista da base 8.1.4 caso ainda ausente.
- Regressão Node local e Chromium desktop/mobile; pendente validação online antes de produção.

---

# TDB v8.2.0 RC1 — sem serviços adicionais pagos

Ver `ATUALIZACAO-v8.2.0.md` e `LEIA-PRIMEIRO-8.2.0.md`.

## v8.1.4 RC1 — Desempenho e integridade

- Consulte `ATUALIZACAO-v8.1.4.md` e `LEIA-PRIMEIRO-8.1.4.md`.
- Requer `database/SUPABASE-PERFORMANCE-v8.1.4.sql` antes de publicar esta versão.
- Não modifica o visual Premium Gold nem os motores originais de Xadrez e Truco.

## 8.1.3-rc.1 — Xadrez/Truco responsivos, Sinuca desativada
- Interface e API de salas não oferecem mais Sinuca; partidas históricas preservadas.
- Xadrez e Truco retornam a jogada do BOT na mesma resposta da ação humana.
- Eliminadas consultas duplicadas após jogadas e leituras repetidas de estado durante snapshots.
- Evita gravações recorrentes de partidas encerradas; mantém versão sincronizada da partida.
- Testes de regressão de cliques, janelas e performance local.

# TDB 8.1.2-rc.1 — Recuperação de Xadrez e Truco originais

- Base mantida: TDB 8.1.1-rc.1 Premium Gold + Social (RC3 como origem lógica), marca/logo oficiais.
- Xadrez: motor cliente e CSS originais da versão 7.2.5 restaurados, mantendo o motor oficial do servidor. Adaptados tabuleiro, dicas de jogadas legais, clique e arrastar peças, histórico, relógios, promoção, empate, desistência, captura e PGN.
- Xadrez BOT: recuperada a análise posicional/busca da versão antiga no motor do servidor para dificuldades fácil, média e difícil.
- Truco: reintroduzida **adaptação visual e funcional** da mesa clássica, com cartas, vira, manilha, equipes 1×1/2×2, placar, carta escondida, pedido/resposta Truco, mão de 11, espectadores e identidade oficial. Não se transplantou integralmente o `app.js` antigo, incompatível com as novas salas.
- Truco BOT: tomada de decisão contextual por dificuldade (cartas próprias e jogadas visíveis, sem enxergar mãos ocultas). Testes de partidas completas em 1×1 e 2×2.
- Janela independente: abrir mesa dentro da sala, arrastar e redimensionar (desktop), maximizar, minimizar, fechar sem desistir e reabrir pela lista de mesas; mobile usa janela adaptada ao viewport.
- Sinuca: **mantida como estava**, sem reescrita ou alteração visual específica nesta etapa.
- Sem alteração das tabelas SQL do Supabase, Vercel ou sistema de autenticação.
- Testes locais: Node motor e partidas completas, Chromium desktop/mobile, e regressão da RC3 e Premium Gold.
- Limites: testes integrados Node com `@supabase/supabase-js` indisponíveis aqui; não testado contra Supabase/Vercel reais ou usuários simultâneos.

---

# TDB v8.1.1-rc.1 — Premium Gold + Social

Atualização visual baseada na **RC3-MESAS-BOT**, sem alterações em backend, esquema do Supabase ou lógica dos jogos.

## Melhorias
- Home redesenhada: hero de identidade oficial, painel ilustrativo, indicadores calculados das salas públicas/listadas, cards, ações rápidas funcionais.
- Sidebar e topbar modernizadas; painel de conta, contraste, cores oficiais, estados de foco e navegação responsiva.
- Sala com áreas organizadas de jogos, mídia e novo painel social; lista resumida de participantes e chat rápido conectado à API já existente.
- Dock musical fixo e funcional: informação da faixa, reproduzir/pausar, próxima e acesso ao player; volumes existentes mantidos.
- Mesas e jogos refinados visualmente (Xadrez, Sinuca, Truco), sem alterar motores nem lógica de criação contextual/BOTs da RC3.
- Configurações, modais e transmissão seguem no mesmo fluxo, com ajustes de espaçamento, tipografia e responsividade.
- Ao alternar Home/Sala, rolagem redefinida para evitar começar no meio do conteúdo.
- Folha `hub/premium-gold.css` isolada: a base RC3 não foi sobrescrita. Cache versionado para CSS e JS.

## Testes
- PASSOU: `python tests/v811-premium-browser.py` em Chromium desktop 1680×1020 e mobile 390×844; sem erros JavaScript, sem rolagem horizontal, com fluxo de chat, música, histórico de ações rápidas e mesa com BOT.
- PASSOU: `python tests/v81-rc3-browser.py` para campos por jogo e Xadrez/Sinuca/Truco com BOT nas mesas.
- PASSOU: `node --check` para JavaScript.
- **Não executado com sucesso aqui:** `npm run test:integrated` porque `@supabase/supabase-js` não está instalado neste ambiente e a instalação falhou por indisponibilidade do registro npm (`EAI_AGAIN`). Esses testes exigem um ambiente com dependências instaladas.
- **Não realizado:** homologação com banco Supabase real, Vercel Preview, YouTube e múltiplos usuários reais.

## Instalação
Ver `LEIA-PRIMEIRO-PREMIUM.md`.

---

## 8.1.0-rc.3 — Criação contextual de mesas e BOTs online

- Formulário de criação exibe somente as configurações do jogo selecionado: relógio/cor no Xadrez, tempo/mira na Sinuca e modalidade/tempo no Truco.
- Criar mesa oferece modo **Com amigos** ou **Com BOT dentro desta sala**.
- Atalho **🤖 Jogar com BOT** diretamente no painel de mesas da sala online.
- Truco 2×2 permite selecionar manualmente 1, 2 ou 3 BOTs e dificuldade inicial; o organizador pode reorganizar equipes antes do início.
- BOTs escolhidos são adicionados atomicamente na criação da mesa e, quando todas as vagas estão completas, a partida começa dentro da mesma sala.
- Backend valida quantidade/dificuldade dos BOTs; sem mexer no fluxo de treinamento separado.
- Novos testes de regras, integração Node e navegador Chromium para a interface contextual.
- Nenhuma migração SQL nova necessária.

## 8.1.0-rc.2 — Correção crítica de inicialização

- Recupera eventos da interface após corrigir referência inexistente ao botão de treinamento.
- Preserva propriedade de salas antigas por `tdb_hubs.owner_id`.
- Salas privadas permanecem acessíveis ao criador original quando ele sai.
- Adiciona teste de regressão para exclusão e permissões do criador.
- Ver detalhes em `LEIA-PRIMEIRO-RC2.md`.

# Histórico da nova plataforma

## 8.0.0-beta.1
- Redesign completo de interface, login e navegação.
- Salas sociais independentes das partidas, públicas ou privadas por código.
- Música e compartilhamento sempre no mesmo DOM ao alternar jogos.
- Até 12 mesas por sala: Xadrez, Sinuca e Truco (1x1); jogadores e espectadores.
- Chat, sinais WebRTC persistidos, suporte a Vercel e migração aditiva Supabase.
- Testes de integração local; validação na Vercel e redes reais pendente.

## 8.3.1 RC1 — Social & Admin

- Nuuvem no lugar de Cloud Gaming, menu sem treino duplicado.
- Compartilhamento na coluna social, Perfil e Amigos completos, ADM reativado com credenciais por ambiente.
- Convites agora integrados às salas de `tdb_hubs`; motores de jogo preservados.
