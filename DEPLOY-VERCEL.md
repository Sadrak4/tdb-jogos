# DEPLOY — TDB v7.0.1 GAMEPLAY FIX

## Banco

Não execute SQL novo. Esta versão não altera o schema do Supabase.

## Publicar

1. Abra o repositório `tdb-jogos` no GitHub Desktop.
2. `Fetch origin`.
3. Faça `Pull origin` se aparecer.
4. Extraia `TDB-v7.0.1-GAMEPLAY-FIX.zip`.
5. Copie os arquivos por cima do repositório.
6. Commit sugerido:

```text
TDB v7.0.1 Gameplay Fix
```

7. `Commit to main`.
8. `Push origin`.
9. Aguarde o deploy da Vercel.

## Conferir versão

Abra:

```text
https://tdb-jogos.vercel.app/api/health
```

Esperado:

```json
{
  "app": "TDB",
  "version": "7.0.1"
}
```

## Teste obrigatório após deploy

Faça em zoom 100%:

1. Truco contra bot: mesa, mão e cartas jogadas devem aparecer.
2. Xadrez contra bot: o tabuleiro 8×8 deve aparecer e aceitar clique.
3. TDB Lobby: player/biblioteca devem aparecer sem uma tela escura na frente.
4. Blackjack: distribuir várias cartas; elas não devem se sobrepor.
5. TDB Lobby screen share: testar iniciar/parar e visualizar com outra conta.

## Observação

Os identificadores internos ainda usam `music`/`lounge-*` e o repositório continua `tdb-jogos` por compatibilidade. Isso é intencional e não muda o nome mostrado ao usuário, que agora é apenas **TDB** e **TDB Lobby**.
