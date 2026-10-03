# TDB v7.2.2 — Estabilidade Online / Hotfix da Sinuca

Esta versão revisa o fluxo online introduzido/pressionado pela Sinuca e corrige situações que podiam impedir um amigo de entrar na sala ou deixar o aplicativo preso esperando uma API.

## Causas concretas encontradas

1. **Sala podia virar `playing` antes de existir uma partida oficial.**
   Se a gravação do estado do jogo falhasse depois disso, a sala permanecia marcada como “em andamento”, bloqueando a entrada do segundo jogador e prendendo a reconexão.
2. **Entrada na sala podia ser salva e ainda assim responder como erro.**
   O heartbeat era aguardado depois de adicionar o jogador. Se a presença falhasse, o cliente recebia erro apesar de o usuário já estar na sala no servidor.
3. **Requests não tinham limite de espera suficiente.**
   Uma chamada lenta do Vercel/Supabase podia manter loading, login ou sincronização aguardando por tempo indefinido.
4. **A limpeza global de salas bloqueava snapshot/reconexão/heartbeat.**
   O trabalho de manutenção podia atrasar a inicialização inteira do app.
5. **O endpoint de espectador aceitava `room.status=playing` como prova de partida ao vivo.**
   Uma sala fantasma podia continuar sendo tratada como partida real.
6. **A revanche ainda marcava a sala como `playing` antes do novo estado oficial.**
7. **O polling da partida gravava presença a cada ~900 ms por jogador.**
   Isso gerava writes desnecessários no Supabase, principalmente com a Sinuca e seus estados maiores.
8. **O rate-limit podia bloquear uma API principal se a tabela auxiliar estivesse lenta.**

## Correções

### Salas e entrada com amigos
- Start de Truco/Xadrez/Sinuca agora é transacional.
- O estado oficial do jogo é gravado primeiro; a sala só depois muda para `playing`.
- Se o start falhar, jogo e sala são restaurados para o estado anterior.
- Entrada detecta sala `playing` sem partida ativa e reabre automaticamente a sala.
- Heartbeat de presença deixou de fazer parte da transação de entrada.
- Convites também validam se existe partida real antes de adicionar o convidado.
- Convite preso em sala fantasma recupera a sala para `open`.
- Revanche usa o mesmo start transacional.

### Sinuca
- Mantido o motor autoritativo no servidor.
- Adicionada tela de recuperação caso o cliente perca a sincronização da mesa.
- Botões para tentar reconectar ou sair da sala sem ficar preso.
- Loop de renderização da Sinuca é encerrado ao voltar ao lobby, trocar de jogo ou retornar à sala.
- Erro de interface ao aplicar estado da Sinuca é capturado e redirecionado para recuperação.

### Rede / Vercel / Supabase
- Requests do cliente agora possuem timeout com `AbortController`.
- Login/sessão também têm timeout.
- Uma lentidão temporária não apaga mais uma sessão válida do navegador.
- Inicialização do Supabase possui fail-fast.
- Reads/writes críticos de salas, partidas e estado compartilhado possuem timeout no servidor.
- Rate-limit usa timeout curto e falha aberto se o armazenamento auxiliar estiver lento.
- Snapshot e reconexão não aguardam mais a varredura global de manutenção terminar.

### Menos carga durante partidas
- `/api/games/state` deixou de gravar presença em todo poll.
- A presença continua sendo atualizada pelo heartbeat normal do TDB (~12 s).
- Resultado: muito menos writes enquanto Truco, Xadrez ou Sinuca estão abertos.

### Estado “Ao vivo”
- Uma sala só é considerada realmente assistível quando existe um estado de jogo ativo e não terminal.
- Se `room.status` estiver `playing` mas o jogo não existir, a sala é recuperada para `open`.

## Música
A correção da v7.2.1 continua incluída: a fila não possui limite de músicas por pessoa.

## Blackjack
Continua em manutenção e permanece no último card do lobby.

## Banco de dados
**Nenhum SQL novo é necessário para a v7.2.2.**
