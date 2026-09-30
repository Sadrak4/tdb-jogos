# DEPLOY — TDB JOGOS v5.4

## 1. Atualizar os arquivos

No computador onde está o repositório `Sadrak4/tdb-jogos`:

1. extraia `TDB-JOGOS-v5.4-GAMEPLAY-LIFECYCLE-FIX.zip`;
2. abra a pasta clonada `tdb-jogos`;
3. substitua os arquivos antigos pelos da v5.4.

A pasta `api` deve conter somente:

```text
api/
└── router.js
```

## 2. Supabase

A v5.4 **não cria tabelas novas**.

Se você já executou com sucesso o `SUPABASE-SCHEMA.sql` da v5.2, não precisa executar SQL novamente.

Não apague nem recrie `tdb_users`, `tdb_sessions`, `tdb_friends` ou outras tabelas existentes.

## 3. GitHub / Vercel

No GitHub Desktop use:

```text
TDB JOGOS v5.4 Gameplay Lifecycle Fix
```

Depois:

`Commit to main` → `Push origin`

Como a Vercel está ligada ao repositório, o novo deploy deve iniciar automaticamente.

Também é possível usar:

```bash
npx vercel --prod
```

## 4. Verificar o backend

Abra:

```text
https://tdb-jogos.vercel.app/api/health
```

Esperado:

```json
{
  "ok": true,
  "version": "5.4.0",
  "supabase": true,
  "schemaReady": true,
  "readyForMultiplayer": true
}
```

## 5. Teste multiplayer recomendado

### Truco 1x1

- PC 1 cria a sala.
- PC 2 entra.
- cada computador deve mostrar sua própria mão embaixo;
- o outro jogador aparece em cima;
- somente o dono de cada mão enxerga suas cartas;
- os dois precisam conseguir jogar quando chegar sua vez.

### Truco 2x2

Com quatro contas:

- cada jogador se vê embaixo;
- parceiro fica em cima;
- adversários ficam nas laterais;
- mãos adversárias ficam ocultas;
- Mão de 11 e Mão de Ferro devem respeitar suas regras.

### Xadrez

- cada lado deve mover sem a seleção desaparecer por atualização de relógio;
- a peça deve responder imediatamente ao clique;
- o servidor confirma a jogada;
- pretas devem enxergar seu próprio lado embaixo.

### Final da partida

Em Truco e Xadrez:

1. termine uma partida;
2. clique `Voltar à sala`;
3. confirme que o resultado antigo não reabre;
4. host inicia `Nova partida`;
5. confirme que um novo jogo começa para todos.

### TDB Music

- crie uma sala Music;
- outro jogador entra;
- ambos devem ver a mesma fila;
- a sala continua disponível/joinable enquanto o player está aberto.

## 6. Segurança

Nunca envie ao GitHub:

- `SUPABASE_SECRET_KEY`;
- `.env.local`;
- tokens privados.

Esses valores continuam nas Environment Variables da Vercel.
