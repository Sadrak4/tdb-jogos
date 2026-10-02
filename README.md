# TDB v7.0.1 — Gameplay Fix

Correção de estabilidade visual sobre o Visual Rebuild da v7.0.

A v7.0 mudou bastante a aparência da plataforma, mas alguns overrides estruturais da nova camada de CSS interferiram nas superfícies reais dos jogos. A v7.0.1 mantém o novo visual e devolve a geometria funcional comprovada dos módulos.

## Nome da plataforma

- **TDB JOGOS → TDB**
- **TDB Lounge → TDB Lobby**

Os identificadores internos `music`, classes `lounge-*`, tabelas `tdb_*` e rotas existentes continuam iguais para não quebrar banco, salas antigas ou multiplayer.

## Correções de gameplay

### Truco
- restaura altura real da mesa;
- impede o `table-shell` de colapsar;
- força zona de jogo, mão e ações a permanecerem visíveis;
- mantém o visual de felt/rail da v7.

### Xadrez
- restaura a geometria em grid usada pelo módulo;
- tabuleiro volta a ter área 8×8 mensurável;
- casas e peças não podem ficar ocultas por overrides da skin;
- mantém painéis, relógios e acabamento visual da v7.

### TDB Lobby
- o estágio de compartilhamento fica realmente fora do layout quando inativo;
- sem transmissão, player + biblioteca voltam à composição estável de duas linhas;
- YouTube/player não pode ficar escondido pela camada gráfica;
- screen share v6.1.2 continua preservado.

### Blackjack
- removidas margens negativas das cartas;
- cartas não passam mais por cima umas das outras;
- mãos podem quebrar linha quando houver muitas cartas;
- mesa premium da v7 foi preservada.

## Overlay de sincronização

O antigo overlay podia cobrir toda a partida enquanto a lógica continuava rodando por baixo. Na v7.0.1 ele vira apenas um aviso compacto e é fechado automaticamente assim que Truco, Xadrez, Blackjack ou TDB Lobby montam uma tela jogável.

## Estrutura visual

A camada v7 continua organizada em:

```text
ui/
  tokens.css
  shell.css
  components.css
  pages.css
  games.css
  responsive.css
  gameplay-fixes.css
  icon-system.js
```

`gameplay-fixes.css` é carregado por último e contém somente proteções de geometria/visibilidade dos módulos de jogo.

## Banco

**Nenhum SQL novo.** O schema do Supabase é o mesmo da v6/v7.

## Versão

- pacote: `7.0.1`
- `/api/health`: `7.0.1`
- produto: `TDB`
