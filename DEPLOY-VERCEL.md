# DEPLOY — TDB JOGOS v5.6 BLACKJACK

## Supabase

A v5.6 não adiciona tabelas ou colunas novas.

Se o schema da v5.5 já está aplicado e `/api/health` retorna `schemaReady:true`, não precisa executar SQL novamente.

## Atualizar o projeto

1. extraia `TDB-JOGOS-v5.6-BLACKJACK.zip`;
2. copie todo o conteúdo por cima da pasta clonada `tdb-jogos`;
3. confirme que `api/` continua contendo apenas `router.js`;
4. abra o GitHub Desktop;
5. faça o commit:

```text
TDB JOGOS v5.6 Blackjack
```

6. `Commit to main`;
7. `Push origin`;
8. aguarde o deploy automático da Vercel.

## Health

Abra:

```text
https://tdb-jogos.vercel.app/api/health
```

Esperado:

```json
{
  "ok": true,
  "version": "5.6.0",
  "supabase": true,
  "schemaReady": true,
  "readyForMultiplayer": true
}
```

## Teste recomendado

### 1 jogador

1. crie uma sala de Blackjack;
2. abra a mesa;
3. confirme uma aposta;
4. teste Pedir e Parar;
5. complete algumas rodadas.

### entrada durante a rodada

1. PC A começa sozinho;
2. enquanto PC A está com cartas, PC B entra;
3. PC B deve ver `Aguardando próxima rodada`;
4. a rodada de A termina;
5. quando as apostas abrirem, B deve poder apostar e participar.

### 3 jogadores

1. entre com três contas;
2. confirme apostas;
3. valide que os turnos passam em sequência;
4. teste Double e Split;
5. confira que o dealer joga apenas depois de todos terminarem.

### privacidade

Antes da fase do dealer, nenhum navegador deve receber a face da carta fechada do dealer.
