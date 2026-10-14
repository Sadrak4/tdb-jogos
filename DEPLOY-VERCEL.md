# TDB 8.0 Beta — Instalação segura

## ANTES: resolva o conflito do GitHub Desktop

Se o GitHub Desktop ainda exibir “15 conflicted files”, **NÃO tente publicar sobre o merge**. Faça uma cópia da pasta atual e, no GitHub Desktop, use **Branch > Abort Merge** se essa opção estiver disponível. Se não estiver, preserve o backup e não altere a pasta que está em conflito.

**Caminho mais seguro para testar a reconstrução sem prejudicar o site em funcionamento:** crie um **novo repositório** no GitHub Desktop (File > New repository) chamado `tdb-v8-beta`; copie o conteúdo deste ZIP para esse repositório e faça `Commit to main` e `Push origin` (ou `Publish repository`). Na Vercel, importe esse repositório como **um novo projeto de teste**. Não mova o domínio principal nem desligue a versão anterior até validar tudo.

Se você optar por atualizar o repositório antigo, primeiro encerre o conflito, confira que o Git está limpo, crie uma branch de teste e substitua o projeto por este pacote. Não copie por cima de uma mesclagem inacabada e **não use Force Push**.

## Supabase: atualização OBRIGATÓRIA

1. Faça um backup/exportação dos seus dados ou garanta um restore disponível.
2. Acesse Supabase > SQL Editor e abra o arquivo `database/SUPABASE-HUB-v8.sql`.
3. Execute o SQL **uma vez**; ele cria 3 novas tabelas: `tdb_hubs`, `tdb_hub_messages` e `tdb_hub_signals`. Não apaga usuários nem as tabelas 7.x.
4. Confirme que as tabelas apareceram no Table Editor.
5. **Não execute** novamente `SUPABASE-SCHEMA.sql` num banco existente.

## Vercel: configurar projeto beta

1. Importe o repositório e defina Framework Preset: **Other**.
2. Configure em **Settings > Environment Variables** as variáveis `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`). Se usar a chave pública, mantenha `SUPABASE_PUBLISHABLE_KEY` conforme o projeto antigo.
3. **Nunca coloque a service role key no código ou no GitHub.**
4. Faça Deploy. O arquivo `vercel.json` já inclui `/api/hub` via `api/router.js`.
5. Abra a URL de testes da Vercel. Crie uma sala, entre com duas contas e teste chat, YouTube, Xadrez, Sinuca, Truco e transmissão.

## Teste mínimo obrigatório antes de substituir o site

- [ ] Duas contas entram na mesma sala e visualizam chat e participantes.
- [ ] Iniciam uma partida e ouvem a mesma música, sem reiniciar o player ao abrir o jogo.
- [ ] Alteram de mesa sem sair da sala social.
- [ ] Iniciam uma transmissão e outro navegador consegue assistir.
- [ ] Recarregam e retornam à mesma sala.
- [ ] Tudo funciona em PC e celular, no HTTPS da Vercel.

Se a transmissão não funcionar em algumas redes, configurar TURN será uma próxima atividade técnica; a beta não inclui um serviço TURN gerenciado.

### Nesta entrega

GitHub Desktop: **SIM — atualização do código (recomendado em repo beta novo)**.
Supabase: **SIM — executar `SUPABASE-HUB-v8.sql`**.
Vercel: **SIM — publicar e configurar variáveis do projeto beta**.
