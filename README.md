# TDB JOGOS v6.0 — SOCIAL + PLATFORM UPDATE

A v6.0 transforma o TDB JOGOS em uma plataforma social mais completa sem reintroduzir ranking global.

## Principais novidades da v6.0

### Salas e multiplayer
- sistema **PRONTO** para Truco, Xadrez e Blackjack;
- host só inicia quando há jogadores suficientes e todos estão prontos;
- reconexão visual com contagem regressiva;
- salas vazias continuam com tolerância de 5 minutos em todos os jogos e no TDB Music;
- botão **COPIAR CONVITE**;
- salas **Pública**, **Somente amigos**, **Somente convite** ou **Com senha**;
- modo espectador mais visível, com contagem e botão **Assistir** no lobby;
- tela de `Entrando na sala`, `Sincronizando partida` e `Reconectando`.

### Lobby, amigos e Party
- resumo do lobby com jogadores online, salas abertas e amigos ativos;
- status detalhado de amigos: Truco, Xadrez, Blackjack, TDB Music, sala, ausente e offline;
- perfil rápido do amigo com convite para sala;
- Party de até 4 amigos;
- líder pode anunciar a sala atual e os membros recebem opção para acompanhar;
- Party pode acompanhar o líder inclusive em sala `Somente convite`, sem abrir acesso a terceiros.

### Chat e reações
- chat de texto por sala;
- reações rápidas `😂 🔥 👏 😮 ❤️ 👍`;
- chat também disponível para espectadores autorizados;
- reações desaparecem automaticamente.

### TDB Music
- histórico das últimas 10 músicas tocadas;
- músicas favoritas por usuário;
- playlists/presets salvos;
- host pode salvar a fila e carregar uma playlist novamente;
- dados usam o armazenamento compartilhado já existente.

### Visual e desempenho
- modo tela cheia nos jogos;
- opção de animações completas;
- opção de efeitos de partículas;
- controle de som permanece;
- animação de entrada de jogadores na sala.

### Painel ADM
- filtros de contas, banidos, online e sessões;
- filtros de reportes por conta/ID e data;
- filtros de logs por versão e data;
- sessões ativas e versão do cliente por conta;
- dashboard com contas, online, salas, partidas, reportes e erros;
- visão operacional de salas;
- erros agrupados por versão;
- modo manutenção com mensagem configurável.

### Qualidade
- testes automáticos simulando 2 a 4 clientes;
- regressões das versões anteriores preservadas;
- logs de cliente agora carregam automaticamente a versão `6.0.0`.

## Banco de dados

A v6.0 **não exige SQL novo**. Party, chat, reações, favoritos, playlists e manutenção usam estruturas/tabelas já existentes, principalmente `tdb_shared`.

---

## Recursos e histórico anteriores

A v5.7 mantém o módulo completo de Blackjack e refaz a experiência visual para uma mesa premium, compacta e independente do Truco.

## Conceito da mesa

- 1 a 3 jogadores humanos contra um único dealer automático;
- a mesa pode começar com apenas 1 jogador;
- um segundo ou terceiro jogador pode entrar com a rodada em andamento;
- quem entra no meio da rodada aparece como **Aguardando próxima rodada** e começa automaticamente quando a rodada seguinte abrir;
- a sala permanece aberta/joinable enquanto houver vaga.

## Regras implementadas

- Ás vale 1 ou 11 automaticamente;
- J, Q e K valem 10;
- Blackjack natural = Ás + carta de valor 10 nas duas cartas originais;
- Blackjack natural paga 3:2;
- vitória normal paga 1:1;
- empate devolve a aposta;
- dealer para em qualquer 17, inclusive soft 17;
- Pedir (Hit);
- Parar (Stand);
- Dobrar (Double Down): dobra a aposta, compra exatamente 1 carta e encerra a mão;
- Separar (Split): cartas de mesmo valor podem ser separadas;
- cartas de valor 10 (10/J/Q/K) são compatíveis para split;
- até 3 mãos por jogador;
- split de ases recebe somente uma carta adicional por mão e para automaticamente;
- 1, 2 ou 4 baralhos no shoe;
- reshuffle automático quando o shoe fica baixo.

## Fichas virtuais

As fichas são apenas da própria mesa e não representam dinheiro real.

Ao criar uma sala, o host escolhe:

- aposta mínima: 10 / 25 / 50;
- fichas iniciais: 500 / 1.000 / 2.000;
- tempo por decisão: 15 / 20 / 30 segundos ou sem limite;
- shoe: 1 / 2 / 4 baralhos.

Se um jogador ficar sem fichas suficientes, pode fazer uma recarga gratuita para o valor inicial da mesa entre rodadas.

## Multiplayer autoritativo

O navegador não embaralha nem decide cartas.

O servidor controla:

- shoe e embaralhamento;
- cartas;
- carta fechada do dealer;
- apostas;
- ordem dos turnos;
- timer;
- Hit / Stand / Double / Split;
- dealer;
- pagamentos;
- passagem para a rodada seguinte.

O cliente apenas solicita a ação e desenha a resposta oficial.

## Privacidade

Antes da vez do dealer, a carta fechada é redigida no `viewFor()` do servidor. O navegador recebe `null` no lugar da carta real, então não é apenas um efeito visual.

As mãos dos jogadores são públicas como em uma mesa física de Blackjack.

## Entrada durante a rodada

Quando um usuário entra enquanto `playerTurns`, `dealerTurn` ou `roundEnd` está em andamento:

1. ele entra na sala normalmente;
2. recebe o estado público da rodada atual;
3. fica marcado como `waitingNextRound`;
4. não recebe cartas nem interfere na rodada atual;
5. quando a próxima fase de apostas abre, passa automaticamente a ser elegível.

## Reconexão

A mesa usa o sistema de presença/reconexão já existente no TDB JOGOS.

- assento fica reservado durante a tolerância;
- se o jogador desconectar na vez dele, o timer pode encerrar a decisão com Stand automático;
- após expirar a tolerância global, o usuário é removido da sala sem encerrar a mesa dos demais.

## Design

O Blackjack possui arquivos próprios:

```text
games/blackjack/
├── blackjack.js
└── blackjack.css

server/
└── blackjack-engine.js
```

Visual:

- feltro verde profundo;
- preto/grafite;
- dourado metálico;
- cartas próprias em CSS;
- dealer centralizado no topo;
- usuário local sempre destacado na parte inferior;
- outros jogadores posicionados nas laterais;
- painel de regras e atividade separado;
- interface de aposta própria;
- destaque dourado na mão ativa.

## Áudio

Foram adicionados presets discretos ao SoundManager:

- distribuição;
- compra de carta;
- Stand;
- Double;
- Split;
- flip do dealer;
- estouro;
- vitória;
- derrota.

Os sons continuam respeitando os controles de volume da v5.5.

## Banco de dados

A v5.6 não cria tabelas novas.

Se o `SUPABASE-SCHEMA.sql` da v5.5 já foi executado, **não execute uma migração nova apenas por causa do Blackjack**.

## Testes adicionados

- `tests/v5.6-blackjack-engine-smoke.mjs`
- `tests/v5.6-blackjack-service-smoke.mjs`
- `tests/v5.6-blackjack-static-smoke.mjs`

Eles cobrem, entre outros casos:

- uma pessoa iniciando a mesa;
- Ás/soft hand;
- reserva da aposta;
- carta fechada do dealer;
- entrada durante rodada;
- Split;
- Double;
- Split de ases;
- dealer em soft 17;
- pagamento 3:2;
- ativação do jogador novo na rodada seguinte;
- integração com `game-service`.


## v5.7 — Blackjack Premium UI

A v5.7 mantém a engine e as regras da v5.6, mas substitui a apresentação do Blackjack por uma mesa própria e mais próxima de uma interface de cassino premium.

### Mudanças visuais

- viewport desktop sem necessidade de rolagem vertical;
- dealer no topo e jogador local na parte inferior;
- até dois colegas nas laterais;
- cartas dos colegas visíveis e com tamanho legível;
- shoe do dealer;
- rails e felt em preto, verde profundo e dourado;
- fichas 3D próximas de cada jogador;
- área central de apostas;
- seletor de aposta usando fichas, em vez de botões simples;
- painel de regras e atividade compactos.

### Animação das fichas

Eventos de aposta agora carregam o valor no estado público da partida.

Quando um jogador:
- confirma a aposta;
- dobra;
- separa;

uma pilha de fichas é animada da área daquele jogador até a sua posição de aposta na mesa.

Quando a rodada paga fichas de volta, existe uma animação inversa da mesa para o jogador.

### Privacidade

No Blackjack as mãos dos jogadores são públicas na mesa. Somente a carta fechada do dealer continua oculta até a fase correta.

### Banco

Nenhuma migração nova é necessária na v5.7.


## v5.8 — Truco Reveal + Room Grace

### Delay visual no Truco
Quando todos jogam a carta de uma rodada, o servidor entra em `resolving` e mantém as cartas na mesa por cerca de 1,8 segundo antes de limpar a mesa. Durante esse intervalo não há novo turno nem contagem de tempo.

### Salas vazias
Quando o último jogador sai de uma sala real, ela permanece no lobby por 5 minutos. Durante esse período outro jogador ainda pode entrar e se torna o novo host. A entrada cancela a expiração. Se ninguém entrar, a sala é removida pelo cleanup.

A v5.8 não exige alteração de banco.


## v5.9 — Game Polish

### Truco
A fase `resolving` continua durando aproximadamente 1,8 segundo. Durante esse período a carta vencedora é destacada em dourado e as cartas fazem uma animação de descarte antes de serem retiradas da mesa.

Ao encerrar uma mão, um resumo curto informa quem venceu, qual foi a carta pública vencedora e quantos pontos a mão valeu. Cartas jogadas escondidas continuam privadas e nunca têm sua identidade exibida nesse resumo.

### Xadrez
Foi adicionado feedback mais claro de turno, xeque, animação curta da última jogada e estados de urgência do relógio. A tela final também ganhou estatísticas da partida.

### Blackjack
O dealer agora tem um ritmo visual mais legível entre revelação e compras. A mesa exibe mensagens de ação do dealer e um resumo coletivo da rodada antes de abrir a próxima aposta.

### TDB Music
O cabeçalho `Agora Tocando` ganhou thumbnail, host, modo de controle, barra de progresso, progresso de votação e indicação de ressincronização quando o player precisa corrigir drift.

### Salas vazias
O TTL de 5 minutos permanece no fluxo genérico das salas e, portanto, cobre Truco, Xadrez, Blackjack e TDB Music.

### Banco
A v5.9 não adiciona tabelas nem colunas. Não é necessário executar SQL novo.
