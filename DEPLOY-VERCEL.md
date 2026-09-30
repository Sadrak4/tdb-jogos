# COMO CONFIGURAR SUPABASE — TDB JOGOS v5.0

## 1. Vercel > Storage

No projeto `tdb-jogos`:

1. Storage
2. Create Database
3. Supabase
4. escolha o plano gratuito
5. conecte ao projeto `tdb-jogos`

A integração oficial Vercel + Supabase sincroniza variáveis de ambiente automaticamente.

Os nomes atuais esperados pelo projeto são:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

O código também aceita os nomes legacy:
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

NUNCA coloque a secret key no GitHub.

---

## 2. Criar as tabelas

Abra o banco Supabase criado.

No Dashboard do Supabase:

1. SQL Editor
2. New query
3. abra o arquivo `SUPABASE-SCHEMA.sql`
4. copie todo o conteúdo
5. cole no SQL Editor
6. clique em Run

Esse SQL cria:
- tdb_users
- tdb_sessions
- tdb_friends
- tdb_rooms
- tdb_matches
- tdb_presence
- tdb_shared
- tdb_events

Também ativa RLS e habilita somente `tdb_events` no Realtime.

---

## 3. Publicar v5.0

A pasta `api` deve possuir somente:

```text
api/
└── router.js
```

Então no GitHub Desktop:

- Commit: `TDB JOGOS v5.0 Supabase Online`
- Push origin

Ou pela CLI, se a pasta já estiver ligada ao projeto:

```bash
npx vercel --prod
```

---

## 4. Testar

### Health

Abra:

```text
https://tdb-jogos.vercel.app/api/health
```

Precisa mostrar:

```json
{
  "version":"5.0.0",
  "supabase":true,
  "schemaReady":true,
  "readyForMultiplayer":true
}
```

### Snapshot

Abra:

```text
https://tdb-jogos.vercel.app/api/state/snapshot
```

Deve retornar JSON.

### Cadastro

Crie duas contas novas em navegadores diferentes.

Depois copie o ID `TDB-XXXXXXXX` de uma e adicione na outra.

### Sala

- PC 1 cria sala.
- PC 2 deve enxergar a sala.
- ao entrar, o host deve enxergar o jogador.
- host inicia.
- ambos devem entrar na mesma partida.

### TDB Music

- os dois entram na mesma sala;
- link colocado por um aparece no outro;
- play/pause/próxima sincronizam.

---

## 5. Status do topo

`ONLINE`
= API + Supabase prontos.

`SEM SUPABASE`
= site está no ar, mas o banco ainda não está pronto.

`LOCAL`
= API indisponível ou execução local sem backend.

---

## 6. Por que Supabase é melhor aqui

Contas e amigos são persistentes. Se uma Function da Vercel reiniciar, os dados continuam no Postgres.

O Realtime é usado como sinal de atualização; o backend continua sendo autoridade para ações privadas, especialmente no Truco.
