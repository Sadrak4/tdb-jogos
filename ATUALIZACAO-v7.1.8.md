# TDB v7.1.8 — Chess Room + Bot AI

Base: **TDB v7.1.7 — Perfil 3.0 + Xadrez maior**.

## 1. Barra lateral
- A área clicável da seta foi aumentada para um botão real de **44 x 64 px**.
- O clique funciona em toda a superfície do botão, não apenas em cima do desenho da seta.
- O ícone interno não captura mais o clique.
- Foi adicionado um pequeno bloqueio durante a animação para evitar alternâncias duplas acidentais.
- A preferência de barra aberta/fechada continua salva no navegador.

## 2. Relógio do Xadrez
- O relógio local agora faz uma troca de turno exata: antes de concluir uma jogada, o tempo do jogador atual é contabilizado até aquele instante; depois disso começa o relógio do adversário.
- No modo online, o servidor agora grava `serverClockAt` já no início da partida. Isso corrige o primeiro turno, que antes podia começar a descontar apenas depois da primeira sincronização.
- Em qualquer momento, somente o relógio de quem está com a vez é descontado.
- O tempo usado pelo BOT para pensar faz parte do relógio do próprio BOT.

## 3. BOT com pausa visual de aproximadamente 1,8 s
- O BOT não responde mais instantaneamente no Xadrez.
- A interface mostra o turno do BOT e mantém o relógio dele correndo.
- A jogada só é executada depois de aproximadamente **1,8 segundo** desde o início do turno do BOT.
- A análise da IA acontece dentro dessa janela, então a dificuldade maior não adiciona vários segundos extras em condições normais.

## 4. Dificuldade do BOT
A criação da sala de Xadrez agora possui:
- **Fácil** — próximo do comportamento antigo; enxerga capturas simples e ainda comete erros.
- **Médio** — analisa respostas, material, desenvolvimento, ameaças e posição.
- **Difícil** — usa busca mais profunda com poda alpha-beta, prioriza táticas, segurança do rei, material e finais.

A dificuldade fica salva dentro dos dados JSON da própria sala (`chessBotDifficulty`) e também pode ser alterada depois.

A IA ganhou:
- avaliação de material;
- preferência por centro/desenvolvimento;
- segurança básica do rei;
- promoções, roque, xeques e capturas;
- procura de xeque-mate dentro da profundidade analisada;
- busca Minimax com poda Alpha-Beta no Médio/Difícil;
- limite de processamento para não travar o navegador;
- anti-loop mais agressivo no Fácil, sem impedir táticas importantes no Médio/Difícil;
- decisão de aceitar/recusar empate influenciada pela posição e dificuldade.

## 5. Editar regras sem recriar a sala
O host agora possui **Editar regras** na sala de espera.

### Xadrez
Pode alterar para a próxima partida:
- relógio: sem relógio / 1 / 3 / 5 / 10 / 15 minutos;
- cor: aleatória / brancas / pretas;
- dificuldade do BOT: Fácil / Médio / Difícil.

### Truco
Pode alterar:
- 1x1 ou 2x2;
- sem limite / 30 s / 60 s por jogada.

A redução de 2x2 para 1x1 é bloqueada caso já existam jogadores demais na sala.

### TDB Lobby/Música
A infraestrutura do editor também permite alterar:
- quem controla o player;
- regra para pular música;
- limite de músicas por pessoa.

As regras não podem ser alteradas durante uma partida em andamento. O fluxo é:

**terminar/sair da partida → Voltar à sala → Editar regras → iniciar a próxima partida**.

As mudanças são validadas novamente no servidor; um usuário que não é host não consegue alterar regras apenas manipulando o navegador.

## 6. Sincronização da sala
- A descrição da sala de espera agora atualiza quando as regras mudam.
- O Xadrez mostra tempo e dificuldade do BOT na própria sala.
- O botão de teste também indica a dificuldade selecionada.

## Banco de dados
**Não há SQL novo na v7.1.8.**

`chessBotDifficulty` e as demais regras ficam dentro do JSON já armazenado em `tdb_rooms.data`.

Se o banco ainda não recebeu a atualização da v7.1.7, continue executando `SUPABASE-MIGRATION-v7.1.7.sql` para habilitar `avatar_image`. Isso é da versão anterior, não da v7.1.8.
