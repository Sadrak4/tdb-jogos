# Registro técnico — TDB 8.3.3 RC1

**Base:** 8.3.2 RC1. **Arquivos principais:** `index.html`, `hub/hub.js`, `hub/classic-games.js`, `hub/quality-833.css`, `server/truco-engine.js`, testes e documentação.

Ações: retirar duplicação da barra de atalhos; mover convites ao cabeçalho; remodelar biblioteca usando as operações pessoais existentes; manter favoritos e informações de sincronização durante o ciclo da janela de jogos.

Truco: a ação vencedora retorna `pendingTrick.winnerSeat` e a visualização da rodada usa esse valor para indicar a carta com borda dourada. O servidor mantém resumo curto de rodada por `expiresAt`; o tempo de revelação é `TRICK_REVEAL_MS=1250`. O cliente agenda uma atualização da mesa perto de `trickResolveAt`, com tolerância e proteção de timers. Avisos e placares respeitam os dados públicos retornados pelo servidor; as mãos ocultas não são reveladas. A pontuação e as regras continuam no motor original.

Xadrez: melhor apresentação de propostas de empate e resultados finais, sem modificar `server/chess-engine.js`.

Não existe migração 8.3.3; nem integração comercial adicional. Homologação online ainda necessária.
