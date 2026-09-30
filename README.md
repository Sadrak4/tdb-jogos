# TDB JOGOS v5.6 — BLACKJACK TDB

A v5.6 adiciona um módulo de Blackjack completo e independente da interface/engine do Truco.

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
