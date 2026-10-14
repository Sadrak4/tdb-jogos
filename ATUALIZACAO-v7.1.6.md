# TDB v7.1.6 — Lobby, Ao Vivo e UX

Base: **v7.1.5 Admin Maintenance Access**. Esta versão preserva o sistema de manutenção administrativa e consolida os ajustes pedidos em salas, modo espectador, Truco, Xadrez, TDB Lobby/Música e navegação.

## Salas / lobby
- Host ganhou **Apagar sala agora** na sala de espera. A sala é removida imediatamente; não é preciso aguardar os 5 minutos de expiração.
- O backend confirma que somente o host pode apagar a sala e impede apagar uma partida que ainda esteja em andamento.
- Adicionado **Voltar ao lobby** no canto superior esquerdo da sala de espera.
- A sincronização da sala de espera mantém o botão de apagar caso a propriedade da sala mude para outro jogador.

## Partidas ao vivo / espectadores
- Partidas de Truco e Xadrez agora são consideradas ao vivo tanto pelo `status` da sala quanto pela partida ativa registrada no servidor.
- O navegador de salas ganhou a faixa **Ao vivo agora** para Truco e Xadrez.
- Salas em andamento exibem **Assistir** em vez de ficarem apenas bloqueadas.
- `/api/rooms/watch` também consulta o estado real da partida e corrige `room.status` se estiver atrasado.
- Xadrez em modo espectador foi corrigido: orientação válida, banner **ASSISTINDO AO VIVO**, sem controles de jogador e resultado neutro.
- Truco em modo espectador não oferece mais respostas de Truco/Mão de 11 e mostra estado neutro da partida.

## Truco
- Resposta dos bots a Truco/6/9/12 deixou de ser instantânea: há uma pequena espera de decisão.
- Enquanto o bot decide aparece **ANALISANDO...**.
- A resposta fica visível por mais tempo: **ACEITOU**, **CORREU** ou **PEDIU AUMENTO**.
- Avisos de Truco/6/9/12 foram deslocados para o **canto superior direito**, sem cobrir a Vira.
- Mantida a Vira grande e as correções anteriores de camadas/cartas.

## Xadrez
- Corrigido o fluxo em que a partida podia precisar de F5 para abrir: o bridge de sincronização agora pode iniciar enquanto a conexão termina de subir e também se recupera quando o status online chega.
- Mantido o movimento por **clicar na peça e clicar na casa**.
- Adicionado **arrastar e soltar com o mouse**.
- Só casas legais aceitam o drop; o servidor continua sendo a autoridade final da jogada.
- Casas permitidas recebem destaque durante o arraste.
- Tabuleiro ampliado em desktop/notebook, mantendo o painel direito visível.

## TDB Lobby / Música
- Layout responsivo revisto para resoluções menores e para zoom do navegador: 3 colunas em telas largas, 2 colunas em notebook e 1 coluna em telas menores.
- O painel de ferramentas deixa de ser empurrado para fora da tela.
- Durante compartilhamento de tela aparece **Trocar tela / janela / aba**.
- A troca abre novamente o seletor nativo do navegador e refaz a conexão dos espectadores sem encerrar a transmissão da sala.

## Blackjack
- **Temporariamente desativado.**
- Card inicial mostra **EM MANUTENÇÃO**.
- Não é possível abrir o lobby/criação de sala pelo frontend.
- Backend também bloqueia criação/atualização de sala, entrada e início de nova partida de Blackjack.
- Convites antigos/novos para Blackjack também são recusados no servidor.
- Reconexão/sessão antiga de Blackjack é descartada e retorna o usuário ao lobby, evitando reabrir uma mesa desativada após F5/login.

## Barra lateral / perfil
- Adicionado controle para **esconder e trazer de volta a barra lateral** em desktop.
- O estado recolhido fica salvo localmente.
- Removido o atalho duplicado de **Perfil** da lista principal; o avatar/perfil na parte inferior continua sendo o acesso ao perfil.

## Banco de dados
**Nenhum SQL novo.** A migration de `banner` da v7.1.0 continua sendo a única alteração de banco desta linha de atualização.
