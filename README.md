# TDB JOGOS v5.0 — Supabase Online

A v5.0 remove a dependência obrigatória de Redis e usa **Supabase como banco persistente principal**.

## O que fica persistido

- contas TDB;
- sessões;
- amigos;
- nome/avatar do perfil;
- salas;
- presença;
- TDB Music;
- partidas de Xadrez;
- partidas de Truco;
- espectadores.

## Realtime

O Supabase Realtime é usado somente para avisos de alteração através da tabela `tdb_events`.

Dados privados NÃO são publicados diretamente pelo Realtime.

No Truco, as cartas continuam no estado privado do servidor. Quando um cliente pede o estado da partida, o backend filtra o que aquele jogador pode receber.

## Sincronização

```text
Jogador
  │
  ├── Supabase Realtime → avisa que algo mudou
  │
  └── API Vercel → busca/envia o estado autorizado
                     │
                     ▼
                  Supabase
```

Existe polling HTTP como fallback, então uma queda momentânea do Realtime não interrompe a partida.

## Segurança

A `SUPABASE_SECRET_KEY` fica somente na Vercel.

O navegador recebe somente:
- `SUPABASE_URL`;
- `SUPABASE_PUBLISHABLE_KEY`.

A publishable key é usada apenas para escutar `tdb_events`, que não contém cartas, senhas ou estado privado.

## Instalação

1. Conecte/crie Supabase na Vercel.
2. Abra o Dashboard do Supabase.
3. SQL Editor.
4. Execute `SUPABASE-SCHEMA.sql`.
5. Faça novo deploy.
6. Teste `/api/health`.

Resultado esperado:

```json
{
  "ok": true,
  "version": "5.0.0",
  "supabase": true,
  "schemaReady": true,
  "readyForMultiplayer": true,
  "production": true
}
```

## Importante sobre contas antigas

Crie novamente as contas usadas nos testes depois que o Supabase estiver configurado. Contas criadas nas versões anteriores podiam existir apenas localmente ou em armazenamento temporário.
