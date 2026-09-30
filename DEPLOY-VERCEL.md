# DEPLOY — TDB JOGOS v5.5

## IMPORTANTE: faça o SQL antes do deploy

A v5.5 adiciona tabelas e colunas necessárias para o painel ADM. Para evitar que o site entre em `schemaReady:false`, faça nesta ordem:

1. abra o projeto do TDB JOGOS no Supabase;
2. abra **SQL Editor**;
3. abra o arquivo `SUPABASE-SCHEMA.sql` da v5.5;
4. execute o arquivo completo novamente (ele usa `if not exists` / `add column if not exists`);
5. confirme que a execução terminou sem erro;
6. somente depois envie a v5.5 para GitHub/Vercel.

A migração preserva as contas existentes.

## Tabelas/colunas novas

- `tdb_users.banned`
- `tdb_users.banned_reason`
- `tdb_users.banned_at`
- `tdb_admin_sessions`
- `tdb_reports`
- `tdb_admin_audit_logs`

## Atualizar projeto

1. extraia `TDB-JOGOS-v5.5-ADMIN-AUDIO-UX.zip`;
2. copie todos os arquivos para a pasta clonada `tdb-jogos`;
3. substitua os arquivos antigos;
4. confirme que `api/` contém apenas `router.js`.

No GitHub Desktop:

**Summary**

`TDB JOGOS v5.5 Admin Audio UX`

Depois:

`Commit to main` → `Push origin`

## Verificar

Abra:

`https://tdb-jogos.vercel.app/api/health`

Esperado:

```json
{
  "ok": true,
  "version": "5.5.0",
  "supabase": true,
  "schemaReady": true,
  "readyForMultiplayer": true
}
```

## Painel ADM

Na tela de login existe a opção **Administração**. Também é possível acessar adicionando `#admin` ao endereço do site.

O login administrativo é independente das contas normais. A validação é feita exclusivamente no servidor e a senha em texto puro não fica no código do navegador.

## Teste recomendado

1. entrar como jogador e enviar um reporte em Configurações;
2. entrar no painel ADM e confirmar que o reporte chegou;
3. buscar uma conta pelo nome e pelo ID;
4. testar geração de senha temporária em uma conta de teste;
5. confirmar que a senha antiga deixa de funcionar;
6. banir uma conta de teste e confirmar que as sessões são encerradas;
7. desbanir e testar login novamente;
8. abrir Logs e Auditoria;
9. testar volumes e botões;
10. testar Truco, Xadrez e Music com dois PCs.

## Segurança

Nunca envie ao GitHub:

- `SUPABASE_SECRET_KEY`;
- `.env.local`;
- tokens de sessão.
