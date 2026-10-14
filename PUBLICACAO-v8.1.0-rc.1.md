# TDB 8.1.0-rc.1 — Instalação, homologação e publicação controlada

**Estado:** artefato candidato a homologação, não aprovado para produção. A entrega deste pacote **não executa deploy**.

## 1. Backup e GitHub Desktop

- Salve uma cópia do ZIP da beta.3 e exporte/registre as configurações atuais de Vercel e Supabase antes de alterar o projeto.
- No **GitHub Desktop**, crie uma branch nova a partir da versão atualmente publicada, por exemplo `teste-tdb-v8.1`. Não misture arquivos locais antigos com a candidata; copie apenas os arquivos do pacote versionado e confira o diff antes de commit.
- Faça commit local somente após inspecionar os arquivos. Faça push da branch quando quiser uma prévia na Vercel; **não faça merge na branch de produção** antes de homologar.

## 2. Supabase

- **Não é necessário SQL novo se a beta.3 já possuía o esquema completo funcional.** A nova versão usa as tabelas existentes `tdb_hubs`, `tdb_hub_messages`, `tdb_hub_signals`, `tdb_game_results` e o armazenamento anterior de playlists/favoritos.
- Se o banco ainda não possui tabelas sociais, utilize `database/SUPABASE-HUB-v8.sql`, uma vez, após fazer backup. Se faltar `tdb_game_results`, consulte o script de esquema anterior e aplique apenas as partes necessárias após revisão. **Não rode `database/SUPABASE-SCHEMA.sql` inteiro em banco já utilizado sem análise.**
- Verifique as chaves de backend (service role/secret) **somente** nas variáveis seguras da Vercel. Nunca coloque chaves privadas no JS público nem as envie em mensagens.
- Verifique integridade das contas e playlists existentes antes e depois de criar uma nova sala.

## 3. Vercel

- Configure as variáveis de Supabase existentes e acrescente `CRON_SECRET` forte e aleatório (valor confidencial). O endpoint `/api/hub-cleanup` exige `Authorization: Bearer <CRON_SECRET>`; o Vercel Cron fornece a autenticação configurada.
- `vercel.json` fornece um Cron **diário** `0 3 * * *`, compatível com limitações do plano Hobby. Uma sala fica **logicamente expirada** depois de 1 hora vazia e será rejeitada nas APIs, mesmo que ainda conste no banco; é fisicamente apagada na próxima varredura/listagem/execução do Cron.
- Se o projeto estiver no Vercel Pro e você precisar limpeza física perto do tempo de expiração, altere somente `crons[0].schedule` para `*/5 * * * *` e valide limites/custos do seu plano. Não use cron de hora em hora no Hobby: deploy pode ser rejeitado.
- O compartilhamento de tela depende de HTTPS e permissões do browser. Em redes restritas, configure servidor TURN em `SCREEN_SHARE_TURN_URLS`, `SCREEN_SHARE_TURN_USERNAME`, `SCREEN_SHARE_TURN_CREDENTIAL`; avalie SFU para escala real. Isso pode gerar custos externos.
- Faça primeiro um **Preview Deployment** associado à branch de testes; não promova à produção antes de aprovar a homologação.

## 4. Testes locais

Requer Node.js 20+ e npm disponível:

```bash
npm install
npm run test:integrated
npm start
```

Acesse `http://localhost:8080` e teste com duas ou mais sessões privadas. Para dados persistentes/reais é necessário banco de testes Supabase configurado, não apenas armazenamento em memória.

### Homologação obrigatória antes de produção

1. Crie sala pública e privada com duas contas; altere permissões, remova e bloqueie participante; verifique exclusão pelo criador e expiração.
2. Teste playlists antigas e novas, inclusive carregar na fila, com contas diferentes. Confirme que só o titular vê/altera a biblioteca.
3. Termine partidas reais de Xadrez, Sinuca e Truco 1×1 e 2×2 (com humanos e BOTs fácil/médio/difícil). Verifique relógios, jogos completos, trocas de equipe e cartas ocultas para espectadores.
4. Provoque desconexão e reconexão antes e depois de 3 minutos. Confirme abandono, pausa correta e resultado único; teste revanche unânime e cancelamento administrativo.
5. Inicie três capturas simultâneas com três contas em computadores/navegadores reais. Abra cada transmissão em vários espectadores; verifique som, volumes individuais, troca de sala, recarga de página, perda de conexão e limite de vagas.
6. Simule sala vazia e cheque bloqueio após 1 hora; valide execução autenticada do Cron e exclusão física com conferência no Supabase.
7. Teste os principais fluxos no Vercel Preview antes de mexer no domínio de produção.

## 5. Reversão

- Guarde o commit e ZIP da beta.3 para recuperar o código via GitHub Desktop/Vercel.
- Reverter o código não desfaz mudanças já feitas nos dados: mantenha backup do Supabase antes de homologar. Como o pacote não introduz migração destrutiva, não há SQL reverso planejado.

## Limites de validação desta entrega

Os testes de integração locais foram executados e passaram, usando um stub isolado de Supabase; os pacotes de produção não foram instalados por falta de acesso externo no ambiente de geração. Tentativas de teste de interface em navegador automatizado foram bloqueadas pelo ambiente. **Não há ainda certificação de ponta a ponta em Vercel/Supabase nem teste multiusuário WebRTC real.**
