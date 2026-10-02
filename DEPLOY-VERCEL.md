# DEPLOY — TDB v7.1.4 FINAL REVIEW

## Banco

A linha v7.1.x usa apenas uma migration nova:

`SUPABASE-MIGRATION-v7.1.0.sql`

Ela adiciona `banner text` em `public.tdb_users` com `IF NOT EXISTS`.

Se essa migration já foi executada no Supabase correto do TDB, **não rode SQL adicional** para a v7.1.4.

## Publicar

1. Abra o repositório do TDB no GitHub Desktop.
2. Faça `Fetch origin` e `Pull origin` se houver atualização remota.
3. Extraia `TDB-v7.1.4-FINAL-REVIEW.zip`.
4. Copie os arquivos por cima do repositório atual.
5. Commit sugerido:

```text
TDB v7.1.4 Final Review
```

6. Faça `Commit to main`.
7. Clique em `Push origin`.
8. Aguarde o deploy da Vercel ficar `Ready`.

## Conferir versão

Abra o endpoint `/api/health` do seu domínio TDB.

Esperado:

```json
{
  "app": "TDB",
  "version": "7.1.4"
}
```

## Teste obrigatório após deploy

Faça em zoom 100% e, se possível, também em uma resolução de notebook:

1. **Truco:** Vira grande e central; a carta jogada pelo adversário superior não pode cobrir a Vira.
2. **Xadrez:** tabuleiro grande; painel direito inteiro; histórico com rolagem; jogar algumas sequências contra o BOT.
3. **TDB Lobby/Música:** painel de compartilhamento/adicionar música inteiro; fila e player visíveis; testar adicionar música e votação para pular.
4. **Blackjack:** apostar, pedir, parar e testar dobrar/separar quando disponíveis; cartas não podem se sobrepor.
5. **Perfil:** abrir o próprio perfil, banner, perfil de amigo e convite para sala.
6. **Admin:** conferir métricas, usuários, salas, reportes e logs.

## Compatibilidade

Os identificadores internos de música continuam usando `music` / `lounge-*` para manter compatibilidade com salas, backend e banco existentes. O nome exibido ao usuário continua **TDB Lobby**.
