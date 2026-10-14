# Leia primeiro — TDB 8.3.1 RC1

## Entrega e publicação

Esta entrega é um **ZIP candidato de testes**, sem publicar no GitHub, no Supabase ou na Vercel.

### 1. GitHub Desktop

Faça cópia da versão atual, crie branch `preview/tdb-8.3.1-social-admin` e substitua pelos arquivos do ZIP preservando variáveis de ambiente do seu projeto. Não envie `.env` com senhas.

### 2. Supabase

Não há SQL novo da 8.3.1. Contudo, você precisa ter executado as migrações já necessárias à 8.3:

- `database/SUPABASE-SCHEMA.sql` para `tdb_users`, `tdb_friends`, `tdb_friend_requests`, `tdb_room_invites`, `tdb_admin_sessions`, denúncias etc. **Não execute o esquema inteiro novamente sem antes conferir o banco já existente.**
- `database/SUPABASE-HUB-v8.sql` para as salas sociais `tdb_hubs`.
- `database/SUPABASE-PERFORMANCE-v8.1.4.sql` para concorrência e histórico completo.

Confira as tabelas acima no **banco de homologação** antes de aplicar qualquer alteração. Não há operação destrutiva prevista nesta versão.

### 3. Ativação segura do ADM (obrigatória para usar o painel)

A senha administrativa antiga embutida no código foi desabilitada. **Não há senha padrão e a conta ADM não funciona sem configuração explícita.**

No computador com Node >=20, rode:

`node scripts/generate-admin-password.mjs`

O script gera automaticamente uma senha aleatória forte, exibida **uma única vez**, e devolve três variáveis: `TDB_ADMIN_USERNAME`, `TDB_ADMIN_PASSWORD_SALT`, `TDB_ADMIN_PASSWORD_HASH`. Guarde a senha num gerenciador de senhas e configure as variáveis apenas no ambiente de execução, nunca no GitHub. Em **Vercel > Project > Settings > Environment Variables**, crie as três variáveis para o ambiente Preview primeiro, usando os valores gerados, e faça novo deploy. **Não inclua a senha original em variáveis nem a compartilhe por chat.**

A nova configuração invalida o acesso administrativo por senha antiga, mas não deve alterar senhas de contas comuns. Para Produção, repita apenas após homologação. Se as variáveis faltarem, o painel mostra erro de configuração e mantém login bloqueado.

### 4. Vercel

Faça um deploy **Preview**, apontado para Supabase de homologação. Evite que Preview com alterações sociais escreva no banco de produção.

### 5. Checklist manual em dois navegadores e duas contas

- Notícias como home; Nuuvem presente, sem Cloud Gaming; menu Jogos funcionando com Xadrez e Truco/BOTs.
- Participantes acessíveis; painel de compartilhamento no lado direito; chat oculto não desliga transmissões.
- Perfil: abrir, editar nome, avatar e banner HTTPS; histórico pessoal correto.
- Amigos: buscar por nome e ID, enviar solicitação, aceitar, recusar, remover e consultar perfil.
- Convites: entrar numa sala, convidar amigo, aceitar do segundo navegador, observar limites de sala e bloqueios. Teste também sala privada e convite expirado.
- ADM: usuário e senha a partir das variáveis; visão geral, contas, denúncia, logs, salas atuais e manutenção; tentativas sem token devem falhar.
- Música: reprodução e sincronização com dois navegadores, favoritos, playlists, player visível; transmissões entre redes reais.
- Xadrez/Truco: partidas com humanos e BOTs, minimizar/reabrir janela, reconexão e histórico.
- Verificar que não há regressões em exclusão de sala pelo criador.

### 6. Rollback

Reimplante a versão 8.3.0 anterior pela Vercel se identificar regressões. Esta atualização não cria tabelas nem migra dados. A configuração nova do ADM pertence ao servidor; se voltar à versão antiga, **revise as credenciais e mantenha o acesso administrativo restrito**.

## Custos

Não há Nuuvem API paga, TURN, SFU ou novo serviço pago. Mantêm-se as cotas e os possíveis limites dos planos de Vercel/Supabase já usados.

## Limitações de homologação

Os testes automáticos usam simulação do Supabase e APIs mockadas. Não foi possível comprovar o funcionamento dos fluxos sociais, moderação ou WebRTC com banco e rede reais; validar antes de produção.
