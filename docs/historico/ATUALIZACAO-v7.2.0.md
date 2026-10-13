# TDB v7.2.0 — SINUCA 8-BALL

Esta versão adiciona a **Sinuca como jogo principal do TDB**. Ela ocupa a antiga posição visual do Blackjack no lobby; o Blackjack foi movido para o último card e continua bloqueado como **Em manutenção**.

## Ordem do lobby

1. Truco
2. Sinuca
3. Xadrez
4. TDB Lobby
5. Blackjack — Em manutenção

## Sinuca 8-Ball

### Motor de física

A Sinuca não usa animações pré-programadas. Foi criado um motor próprio com:

- mesa normalizada em proporção 2:1;
- 16 bolas (branca + 15 bolas numeradas);
- colisão bola × bola;
- transferência de velocidade;
- atrito do pano;
- colisão e perda de energia nas tabelas;
- seis caçapas;
- detecção de encaçapamento;
- desaceleração e estado de repouso;
- limite de simulação para evitar bolas rodando indefinidamente;
- simulação autoritativa no servidor e replay visual no cliente.

O servidor calcula o resultado oficial de cada tacada. Os clientes recebem a tacada e reproduzem a animação localmente, terminando no snapshot oficial do servidor. Isso reduz o risco de dois jogadores terminarem com bolas em posições diferentes.

### Regras implementadas

- 8-Ball 1x1;
- saída com triângulo completo, bola 8 no centro e grupos opostos nos cantos traseiros;
- mesa inicialmente aberta;
- definição de lisas/listradas após a primeira bola válida depois da saída;
- continuidade da vez após encaçapar uma bola válida;
- bola na mão após falta;
- falta ao encaçapar a branca;
- falta ao não atingir nenhuma bola;
- na saída, se nenhuma bola cair, pelo menos quatro bolas de objeto precisam tocar a tabela;
- falta ao atingir primeiro o grupo incorreto;
- falta quando nenhuma bola toca tabela ou é encaçapada após o primeiro contato;
- bola 8 recolocada caso caia na saída;
- bola 8 antecipada gera derrota;
- antes da tacada final é obrigatório declarar a caçapa da bola 8;
- bola 8 na caçapa errada gera derrota;
- desistência;
- tempo opcional por tacada: sem limite, 30s, 45s ou 60s;
- estouro do tempo passa a vez e concede bola na mão.

### Controles

No PC:

1. Mova o mouse para apontar o taco.
2. Pressione o botão esquerdo.
3. Puxe para trás para escolher a força.
4. Solte para executar a tacada.

Também funciona com Pointer Events para adaptação a toque.

Quando houver **bola na mão**, clique em uma posição válida da mesa. Quando estiver jogando na **bola 8**, clique primeiro na caçapa desejada.

### Interface

- mesa desenhada em Canvas 2D;
- madeira escura e pano verde no estilo visual do TDB;
- bolas lisas e listradas numeradas;
- taco animado pela direção e força;
- linha curta de mira opcional;
- barra de força;
- indicador de turno;
- relógio por tacada;
- grupos e bolas restantes de cada jogador;
- histórico da partida;
- avisos de falta;
- tela de resultado;
- revanche;
- retorno à sala para mudar regras.

### Áudio

Foram adicionados efeitos próprios para:

- impacto do taco na branca;
- colisão entre bolas;
- contato com tabela;
- bola entrando na caçapa;
- fim do movimento;
- falta.

Os eventos de impacto relevantes acompanham a tacada do servidor para o replay audiovisual.

## Salas e multiplayer

A Sinuca utiliza a estrutura online já existente do TDB:

- sala para 2 jogadores;
- código de convite;
- convite de amigos;
- pública, amigos, convite ou senha;
- edição de regras sem recriar a sala;
- espectadores opcionais;
- seção **Ao vivo agora**;
- reconexão da partida;
- estado oficial persistido no servidor;
- abandonar uma partida concede vitória ao adversário;
- sala pode voltar ao estado aberto depois da partida;
- revanche pelo host.

### Regras editáveis pelo host

- tempo por tacada;
- ajuda de mira;
- permitir ou bloquear espectadores.

Não é possível alterar regras que afetam a partida enquanto ela está em andamento.

## Espectadores

Quando habilitado pelo host, partidas de Sinuca aparecem no **Ao vivo agora**. O espectador recebe a mesa e a animação das tacadas, mas não pode executar ações.

## Perfil e histórico

Resultados reais da Sinuca são gravados em `tdb_game_results` usando `game = pool` e `mode = 8-ball`, portanto entram no histórico e nas estatísticas do perfil sem criar uma tabela nova.

## Blackjack

O Blackjack continua no projeto para futura reconstrução, mas nesta versão:

- aparece por último no lobby;
- continua marcado como **Em manutenção**;
- não permite criar sala;
- não permite entrar por convite antigo;
- não inicia partida pelo servidor.

## Banco de dados

**Nenhum SQL novo é necessário para a v7.2.0.**

A Sinuca reutiliza as estruturas já existentes:

- `tdb_rooms`;
- `tdb_matches`;
- `tdb_shared`;
- `tdb_events`;
- `tdb_game_results`;
- `tdb_presence`.

As configurações específicas da mesa ficam no JSON já existente da sala.

## Escopo da primeira versão

A v7.2.0 entrega a Sinuca **8-Ball 1x1 para dois jogadores reais**. O BOT de Sinuca e controles avançados de efeito na bola branca (draw/follow/english) ficam para uma fase posterior, depois da validação do multiplayer e da física base em produção.
