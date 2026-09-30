# DEPLOY — TDB JOGOS v5.7 BLACKJACK PREMIUM

## Supabase

A v5.7 não adiciona tabelas ou colunas novas.

Se o schema da v5.5 já está aplicado e `/api/health` retorna `schemaReady:true`, não precisa executar SQL novamente.

## Atualizar o projeto

1. extraia `TDB-JOGOS-v5.7-BLACKJACK-PREMIUM.zip`;
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


# Atualização v5.7

A v5.7 não exige SQL novo.

1. Substitua os arquivos do projeto pelos da v5.7.
2. Commit sugerido:
   `TDB JOGOS v5.7 Blackjack Premium UI`
3. Push origin.
4. Aguarde a Vercel concluir o deploy.
5. Confirme em `/api/health` que a versão é `5.7.0`.

Teste recomendado:
- abrir Blackjack em resolução 1366x768 ou maior;
- confirmar que mesa + controles aparecem sem rolagem vertical;
- entrar com 2 ou 3 contas;
- confirmar que todos veem as cartas públicas dos colegas;
- confirmar aposta e observar fichas indo para a mesa;
- testar Double e Split;
- terminar a rodada e observar retorno das fichas quando houver pagamento.
