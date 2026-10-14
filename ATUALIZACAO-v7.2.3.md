# TDB v7.2.3 — BOT de Sinuca

Esta versão adiciona um adversário controlado pelo servidor para a Sinuca 8-Ball, permitindo ao host iniciar e testar uma partida sozinho.

## O que mudou

- Novo botão **Jogar contra BOT** na sala de espera da Sinuca.
- O servidor adiciona **Bot TDB** como segundo jogador somente quando o host está sozinho.
- O BOT joga usando o mesmo motor oficial de física da Sinuca; as tacadas não são simuladas apenas no navegador.
- Pequeno tempo de pensamento antes das jogadas para evitar respostas instantâneas.
- O BOT sabe:
  - posicionar a branca após falta;
  - procurar bolas legais do próprio grupo;
  - tentar linhas diretas para caçapas;
  - evitar tacadas óbvias com scratch/falta;
  - chamar uma caçapa quando chega à bola 8;
  - continuar jogando quando encaçapa uma bola válida.
- Se um jogador real entrar numa sala aberta que ainda contém o BOT, o BOT sai automaticamente e libera a vaga.
- Ao sair e deixar somente o BOT na sala, o BOT é removido para não virar host de uma sala vazia.
- Revanche contra o BOT continua funcionando porque ele permanece como segundo jogador ao voltar para a sala.

## Banco de dados

Nenhuma migration nova é necessária para a v7.2.3.
