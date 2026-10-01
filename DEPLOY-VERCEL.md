# DEPLOY — TDB JOGOS v6.0.1 UX FIXES

A v6.0.1 não exige SQL novo.

## Atualização

1. Faça `Fetch origin` / `Pull origin` no GitHub Desktop.
2. Extraia `TDB-JOGOS-v6.0.1-UX-FIXES.zip`.
3. Copie os arquivos por cima do repositório.
4. Commit sugerido:

```text
TDB JOGOS v6.0.1 UX Music Fixes
```

5. `Commit to main`
6. `Push origin`
7. Aguarde o deploy da Vercel.

## Health

Abra:

```text
https://tdb-jogos.vercel.app/api/health
```

Confirme:

```json
"version": "6.0.1"
```

## Testes principais

### Truco
- clique diretamente em uma carta: ela deve ser jogada sem botão extra;
- na segunda/terceira rodada, clique `Esconder carta` e depois escolha a carta.

### Blackjack
- crie sala com 1 jogador;
- host deve conseguir abrir a mesa sem marcar PRONTO;
- não deve ocorrer erro HTTP relacionado a PRONTO.

### Xadrez
- adversário faz uma jogada;
- animação ocorre uma vez;
- clique várias vezes na sua peça;
- animação antiga não deve repetir.

### Music
Teste em zoom 100%:
- player;
- Anterior / Tocar-Pausar / Próxima / Favoritar;
- fila com 3+ músicas;
- histórico recente;
- painel Favoritas.

Favorite uma música, saia da sala, entre em outra sala Music usando a mesma conta e confirme que ela continua em Favoritas.
