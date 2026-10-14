# TDB 8.3.2 RC1 — Navegação, ADM separado e promoções Nuuvem

Esta é uma versão **candidata para testes**. Nenhuma publicação ou SQL foi executado pelo assistente.

## O que mudou

1. Menu lateral agora mostra exatamente: **Notícias, Salas, Jogos, Música, Amigos, Meu perfil**. Não exibe Administração, Meu histórico, o bloco "MAIS QUE JOGOS" ou o nome/status duplicados. A identificação do usuário permanece no topo; o ícone de saída também foi movido para o cabeçalho.
2. Em **Salas** existem três abas: **Minha sala**, **Criar sala** e **Explorar salas**. Utilizam os controles e endpoints originais. A aba Minha sala permite retomar a última sala salva enquanto a sessão do usuário estiver disponível. Explorar salas filtra a lista real pelo nome/código, sem inventar salas. Os atalhos existentes da home continuam levando à criação ou exploração.
3. **Jogos** continua dando acesso ao Xadrez e Truco com BOT; não há menu "Treinar contra BOT" duplicado. Os motores e BOTs originais não foram modificados, e a Sinuca continua indisponível.
4. O histórico **não possui mais tela, diálogo nem item de menu**. Resultados e histórico pessoal **não foram apagados**; a atividade recente continua na aba Meu perfil.
5. O painel ADM **não aparece no aplicativo principal** e tem uma página própria em `https://SEU-DOMINIO/adm`, ou localmente `http://localhost:8080/adm`. O caminho `/adm/` também usa `adm/index.html`. Requer **usuário e senha administrativa próprios**, previamente configurados no servidor. Não utiliza automaticamente a sessão normal de jogador. Acesso a APIs administrativas permanece protegido no backend.
6. O feed público de Notícias agora tenta ler até oito promoções verificadas do catálogo oficial **Nuuvem** (`/br-pt/catalog/price/promo/sort/discount/sort-mode/desc`) com preço em BRL e desconto. Todas as URLs são limitadas a produtos da loja oficial. Quando o HTML muda, bloqueia a coleta ou demora, aparece apenas um **link para a página de ofertas oficial**. Não há ofertas fictícias. Resultados usam o mesmo cache (aproximadamente 45 minutos no processo e 30 minutos no CDN) que Steam/Epic. O filtro Nuuvem funciona e o feed "Todos" intercala conteúdos para não esconder a terceira loja.

## 1. GitHub Desktop

Faça backup da versão atual e crie uma branch como `preview/tdb-8.3.2-nav-adm`. Substitua os arquivos pelos do ZIP, mantendo a configuração atual de ambiente. Não inclua `.env` real, senhas ou credenciais no repositório.

## 2. Supabase

**Nenhum SQL novo foi criado nesta atualização.** As tabelas sociais de amigos/convites e as migrações anteriores são pré-requisitos herdados da 8.3.1. A migração 8.1.4 ainda é necessária se não tiver sido aplicada. Confira primeiro o banco de homologação; não execute o esquema completo por cima de um banco existente sem verificar.

## 3. Vercel — `/adm`

O `vercel.json` inclui o rewrite `/adm` → `/adm/index.html`. O servidor Node local também serve `/adm` diretamente.

- Para acessar, digite **`/adm` no endereço do site**; o ADM não aparece no menu do usuário comum.
- A página `/adm` pode ser visitada para mostrar o **formulário de login**; dados e operações só carregam se a API validar a credencial de administrador.
- Se as variáveis do ADM da 8.3.1 ainda não estiverem configuradas, execute `node scripts/generate-admin-password.mjs` no seu computador. Configure `TDB_ADMIN_USERNAME`, `TDB_ADMIN_PASSWORD_SALT` e `TDB_ADMIN_PASSWORD_HASH` **somente nas variáveis de ambiente da Vercel**, primeiro em Preview. Guarde a senha fora do GitHub.
- Verifique manualmente que `/adm` requer login, que abrir `/api/admin/overview` sem token retorna erro de autorização e que sair do ADM invalida a sessão.

Publique primeiro numa **Vercel Preview** conectada a banco Supabase de homologação. Não conecte versões Preview com testes administrativos ao banco de produção.

## 4. Testes antes de atualizar a produção

- Notícias é a primeira tela após login. A navegação lateral tem seis opções, na ordem solicitada.
- Salas: testar **Minha sala**, **Criar sala**, **Explorar salas**, busca, entrar por código, sair e retomar, criar/excluir sala e permissões do criador de sala antiga.
- Jogos: Xadrez e Truco originais, relógios, BOTs easy/medium/hard, Truco 1×1/2×2, espectadores e janelas flutuantes.
- Perfil: verificar atividade recente. A tela separada de Meu histórico não deve existir nem aparecer em menus ou busca.
- Amigos: pesquisar, convidar para sala e aceitar/recusar pedidos com duas contas.
- ADM: `/adm` isolado com login, salas, contas, denúncias, logs, manutenção e logout; rotas privadas negam acesso sem autorização.
- Notícias: Steam, Epic e Nuuvem com cards verificáveis; abrir os links oficiais para conferir preços e disponibilidade; testar falha da fonte Nuuvem para confirmar fallback sem travar a home.
- Música e vídeo: biblioteca e playlists pessoais, YouTube sincronizado e até três transmissões P2P entre redes reais. **Não existe TURN/SFU pago**.
- Conferir responsividade no desktop e celular e tempos de resposta no Supabase/Vercel reais.

### Testes locais disponíveis

```bash
npm install
npm run test:integrated
npm run test:free
npm run test:social
npm run test:nuuvem
npm run test:visual
```

Os testes automatizados desta entrega usam **API simulada/armazenamento isolado**, não o Supabase ou a Vercel reais. A coleta ao vivo da Nuuvem também **não foi validada por rede neste ambiente**, portanto não é possível garantir que os cards de promoções estarão preenchidos em produção; o link da loja permanece acessível.

## 5. Custos e reversão

Esta entrega não adiciona APIs pagas, Cloudflare TURN/SFU ou novas assinaturas. Continuam valendo as cotas dos planos atuais de Vercel e Supabase.

Se identificar regressão no Preview, reimplante a versão 8.3.1. A atualização atual não modifica banco nem tabelas. O novo painel ADM continuará exigindo as variáveis administrativas caso permaneça na versão 8.3.2.
