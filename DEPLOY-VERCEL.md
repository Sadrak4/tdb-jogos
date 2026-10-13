# Publicação — TDB v7.2.5 (pacote organizado)

## Precisa atualizar o quê?

| Plataforma | Precisa atualizar? |
|---|---|
| GitHub Desktop | **SIM** — para publicar os arquivos organizados |
| Supabase (SQL Editor) | **NÃO** — nenhuma mudança no esquema nesta revisão |
| Vercel | **Deploy automático**, se o repositório/branch estão conectados |

## Antes de começar

1. Faça **backup** da pasta do seu repositório local.
2. Baixe e extraia o ZIP organizado da v7.2.5.
3. No GitHub Desktop, selecione o repositório TDB e clique em **Repository > Show in Explorer**.

## Atenção: copiar por cima NÃO apaga documentos antigos

Se você apenas copiar os arquivos extraídos para seu repositório, os arquivos antigos continuarão na raiz! Para que a pasta fique realmente limpa, siga esta ordem:

1. No repositório que está no Explorer, crie as pastas `docs\historico` e `database` (se não existirem).
2. **Mova**, sem apagar, todos os arquivos `ATUALIZACAO-v*.md` **antigos** (v7.1.x, v7.2.0 até v7.2.4) da raiz para `docs\historico`. **Mantenha `ATUALIZACAO-v7.2.5.md` na raiz.**
3. Mova todos os `REVISAO-*.md` da raiz para `docs\historico`.
4. Mova `SUPABASE-SCHEMA.sql` e os `SUPABASE-MIGRATION-*.sql` da raiz para `database`.
5. Agora copie **o conteúdo interno** da pasta extraída do novo ZIP para a **raiz** do repositório, aceitando substituir os arquivos com o mesmo nome. Não copie a pasta contêiner para dentro do repositório. Não apague `.git`.
6. Confira se os arquivos `README.md`, `CHANGELOG.md`, `VERSAO.txt`, `DEPLOY-VERCEL.md`, `ATUALIZACAO-v7.2.5.md` estão na raiz; históricos em `docs\historico` e SQL em `database`.
7. No GitHub Desktop, confira **Changes**: é normal aparecerem arquivos movidos e atualizações de documentação e testes.
8. Faça Commit com a mensagem `TDB v7.2.5 - Organizar documentacao e SQL` e clique em **Push origin**.
9. Na Vercel, confira em **Deployments** que a publicação ficou **Ready**. Verifique `/api/health`: a versão deve continuar `7.2.5`.

Se você **ainda não publicou** a v7.2.5 anterior, este pacote organizado **também contém o código funcional da Central de Atividades**, além dos documentos.

## Teste rápido depois do deploy

- Entrar na conta e abrir o TDB Lobby;
- Criar uma mesa de organização de Xadrez, Truco ou Sinuca;
- Ver a mesa usando outra conta em outro navegador;
- Reproduzir música e verificar que entrar/sair da mesa não reinicia o player;
- Testar o compartilhamento de tela em duas abas/dispositivos;
- Confirmar que as rotas `/api/health` e `/api/platform/activities` respondem conforme suas permissões.

**Não execute SQL novo na Supabase para esta atualização.**
