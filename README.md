> **Versão candidata 8.1.4 RC1:** veja `LEIA-PRIMEIRO-8.1.4.md` antes de instalar. A migração SQL em `database/SUPABASE-PERFORMANCE-v8.1.4.sql` é obrigatória para partidas com controle transacional.

# TDB 8.1.3 RC1 — Premium Gold + Social (Xadrez e Truco)

Esta versão remove a Sinuca da interface ativa e otimiza o tempo de resposta do Xadrez e do Truco. Os arquivos originais dos jogos e da identidade oficial TDB permanecem.

**Comece por:** [`LEIA-PRIMEIRO-8.1.3.md`](./LEIA-PRIMEIRO-8.1.3.md).

# TDB 8.1.2-rc.1 — Xadrez e Truco clássicos + janela de jogo

**Leia primeiro [`LEIA-PRIMEIRO-CLASSICOS.md`](LEIA-PRIMEIRO-CLASSICOS.md).** Esta versão candidata adapta os jogos clássicos da linha TDB 7.2.5 às salas TDB 8.1.1 Premium Gold + Social. Mantém a Sinuca e os demais módulos como base. A janela de jogo não substitui nem encerra automaticamente a partida ao ser fechada.

Os novos testes de motor rodam com `node tests/v812-engine-regression.mjs`; os testes de interface exigem Chromium/Playwright e usam dados simulados. Ainda faltam testes reais em Supabase/Vercel com usuários diferentes antes de publicar em produção.

---

# TDB 8.1.1 RC1 — Premium Gold + Social

Atualização visual do TDB 8 feita **sobre a RC3**. Não há mudanças no backend nem nas tabelas do banco.

**Comece pelo arquivo [`LEIA-PRIMEIRO-PREMIUM.md`](LEIA-PRIMEIRO-PREMIUM.md)** para ver o que foi alterado, o que já foi testado e como homologar sem substituir a versão online.

Para visualizar localmente: instale as dependências (`npm install`) e execute `npm start`; o servidor precisa das variáveis/configurações adequadas da versão anterior. Não coloque credenciais no repositório.

Os testes de interface Chromium passam em desktop e celular (`npm run test:visual`, se Python/Playwright/Chromium estiverem disponíveis). A suíte Node integrada permanece pendente de execução num ambiente com as dependências npm instaladas.

---

> **Atualização RC3 (mesas e BOTs dentro da sala):** consulte [`LEIA-PRIMEIRO-RC3.md`](LEIA-PRIMEIRO-RC3.md). Corrige as opções de criação de jogo para exibir somente as regras do jogo selecionado e permite jogar com BOT na sala online.

> **Correção urgente RC2:** consulte primeiro [`LEIA-PRIMEIRO-RC2.md`](LEIA-PRIMEIRO-RC2.md). A RC1 tinha um erro de inicialização que desativava vários botões. Não publique sem homologar.

# TDB 8.1.0-rc.3 — Salas sociais, música, jogos e transmissões

**Versão candidata para testes. Não publicar diretamente em produção.** Evolução da beta.3 do TDB 8 mantendo logo e identidade visual oficiais.

O TDB integra salas sociais, chat, música do YouTube, playlists/favoritos pessoais, mesas configuráveis de Xadrez, Sinuca e Truco (1×1 e 2×2), BOTs e treinamento, espectadores, reconexão/revanche, histórico pessoal e múltiplas transmissões de tela (até 3 por sala).

**Comece por:** `ATUALIZACAO-v8.1.0-rc.1.md` (mudanças) e `PUBLICACAO-v8.1.0-rc.1.md` (backup, Supabase, GitHub Desktop, Vercel, testes e limitações).

Para executar localmente: Node 20+, `npm install`, `npm run test:integrated`, `npm start`. Acesso: `http://localhost:8080`. Em produção, configure as variáveis indicadas em `.env.example`, o Supabase e o cron autenticado.

O histórico de resultados é persistente em `tdb_game_results`; a interface inicial exibe uma lista recente. Não há ranking nem dados musicais públicos. A expiração lógica da sala é de 1 hora sem humanos; a exclusão física no banco depende da rotina de limpeza (Cron diário padrão no Vercel Hobby ou execução em listagens).

**Atenção:** streams WebRTC e sincronismo de vídeo/áudio dependem do navegador, da rede e, conforme a escala, de TURN/SFU. Testes locais de API não comprovam funcionamento multiusuário em produção.
