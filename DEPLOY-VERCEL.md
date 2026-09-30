# DEPLOY — TDB JOGOS v5.2

## 1. Copiar a v5.2 para o repositório

No computador novo:

1. clone `Sadrak4/tdb-jogos` pelo GitHub Desktop;
2. extraia o ZIP da v5.2;
3. copie todo o conteúdo da pasta extraída para a pasta clonada `tdb-jogos`;
4. substitua os arquivos existentes.

A pasta `api` deve continuar contendo somente:

```text
api/
└── router.js
```

## 2. Atualizar o banco Supabase — OBRIGATÓRIO

A v5.2 cria tabelas para:
- pedidos de amizade;
- convites;
- histórico competitivo;
- ranking;
- rate limit;
- logs.

Abra:

**Supabase → SQL Editor → New query**

Depois:
1. abra `SUPABASE-SCHEMA.sql` da v5.2;
2. copie TODO o arquivo;
3. cole no SQL Editor;
4. clique em **Run**.

Pode executar o arquivo inteiro novamente. Ele foi preparado para preservar o schema existente e acrescentar a migração v5.2.

Não apague as tabelas antigas.

## 3. GitHub

No GitHub Desktop:

**Summary**
```text
TDB JOGOS v5.2 Estabilidade Online Competitivo
```

Depois:

`Commit to main` → `Push origin`

Se preferir usar a CLI e a pasta já estiver ligada ao projeto Vercel:

```bash
npx vercel --prod
```

## 4. Health

Depois do deploy:

```text
https://tdb-jogos.vercel.app/api/health
```

Esperado:

```json
{
  "ok": true,
  "version": "5.2.0",
  "supabase": true,
  "schemaReady": true,
  "readyForMultiplayer": true
}
```

Se aparecer `schemaReady:false`, normalmente faltou executar o `SUPABASE-SCHEMA.sql` da v5.2.

## 5. Teste recomendado

Use dois navegadores/PCs com contas diferentes:

1. buscar usuário pelo nome;
2. enviar e aceitar pedido de amizade;
3. criar sala;
4. convidar amigo;
5. aceitar convite;
6. atualizar uma página dentro da sala e confirmar reconexão;
7. testar Xadrez;
8. testar Truco 1x1;
9. testar TDB Music;
10. conferir histórico e ranking depois de uma partida real.

### Reconexão
Feche/recarregue uma aba durante uma partida e volte antes de 90 segundos.

O esperado:
- jogador aparece como Reconectando;
- ao voltar, recebe a mesma sala/partida;
- não ganha/perde por abandono antes de 90s.

### Ranking
Partidas contra bot não devem alterar ranking/histórico competitivo.

## 6. Segurança

Nunca envie para GitHub:
- `SUPABASE_SECRET_KEY`;
- `.env.local`;
- chaves privadas.

As credenciais continuam nas Environment Variables da Vercel.
