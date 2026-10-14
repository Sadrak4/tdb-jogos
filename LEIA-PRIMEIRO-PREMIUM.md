# TDB 8.1.1 RC1 • Premium Gold + Social

## Sobre esta entrega

**Base:** TDB 8.1.0 RC3 (criação de mesas contextual e BOTs dentro da sala).
**Objetivo:** atualização VISUAL completa, mantendo os fluxos e serviços anteriores. Esta RC não substitui homologação em produção.

### O que mudou

1. **Home:** apresentação oficial do TDB, atalhos para jogar com BOT, biblioteca e histórico, contadores reais da lista de salas e cards mais legíveis.
2. **Sala:** cabeçalho e ações do dono organizados, layouts para jogos/música/transmissão; novo painel social com lista de membros e mensagens recentes.
3. **Chat rápido:** mensagens enviadas pelo painel social usam as ações do hub, respeitando as permissões do servidor.
4. **Player fixo:** dock inferior reproduzir/pausar, avançar e abrir player. Todos os controles originais de fila, volume, favoritos, playlists e YouTube continuam na coluna musical.
5. **Jogos:** aperfeiçoamentos de acabamento dos tabuleiros e cartas. A seleção de jogo continua mostrando somente suas próprias configurações; BOTs continuam disponíveis dentro da sala.
6. **Mobile:** navegação compacta, cards em uma coluna, dock reduzido e layout adaptativo.
7. **Logo oficial:** o mesmo `assets/logo-official.png` fornecido na RC3, sem substituição.

### Integridade da RC3

Os arquivos de `server/`, `database/`, `api/`, os mecanismos de Xadrez/Sinuca/Truco, `vercel.json` e `assets/logo-official.png` foram mantidos com os mesmos bytes do ZIP da RC3. O JavaScript foi alterado somente na camada de interface. A folha anterior `hub/hub.css` também foi mantida, carregando a nova camada visual `hub/premium-gold.css` por cima para reduzir regressões.

### Como testar SEM substituir seu site

1. **Faça backup** do projeto que está publicado no GitHub Desktop.
2. Crie uma branch de testes (ex.: `preview/premium-gold-social`).
3. Extraia o ZIP numa pasta separada e leve seus arquivos para a branch, sem sobrescrever `.env` real nem segredos locais.
4. Instale as dependências com `npm install` numa máquina com acesso ao registro npm.
5. Rode `npm run test:integrated`, `npm run test:visual` e `npm start` quando aplicável. O teste visual usa Python + Playwright + Chromium; se não houver, instale-os ou valide manualmente no navegador.
6. Envie a branch para o GitHub e teste em **Vercel Preview** com as mesmas variáveis e infraestrutura da versão atual.
7. Use pelo menos duas contas para validar: entrar em sala antiga, controle de dono/exclusão, criar mesa com BOT, mudar opções por jogo, enviar chat, biblioteca, playlist, player, três transmissões, mobile e sair/retornar.
8. Só faça deploy em produção após aprovar os testes. Não execute alterações SQL para esta atualização visual.

### Serviços externos

| Serviço | Precisa agir? |
|---|---|
| **GitHub Desktop** | Sim, para publicar os novos arquivos em uma branch de teste. Não force merge na branch principal antes da validação. |
| **Supabase** | **Não** precisa de SQL novo. O banco e dados da RC3 devem ser mantidos. |
| **Vercel** | Sim, criar deploy **Preview** para homologar. Produção só após autorização. |

### Limites dos testes feitos nesta sessão

A interface foi testada no Chromium com API e usuários **simulados**. Os fluxos visuais foram validados, mas a suíte integrada Node não pôde executar por falta de `@supabase/supabase-js` e falha de rede (`EAI_AGAIN` no npm). Ainda faltam testes com o banco, permissões reais e várias pessoas online. As imagens de prévia contêm dados de exemplo.

### Como desfazer

Volte à branch anterior ou ao pacote `TDB-v8.1.0-RC3-MESAS-BOT.zip`. Como não há migração SQL nova, não há banco a reverter para esta atualização.
