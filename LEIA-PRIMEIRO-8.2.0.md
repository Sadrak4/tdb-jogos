# TDB 8.2.0 RC1 — Mega atualização sem contratações adicionais

**Base:** TDB 8.1.4 RC1. **Status:** candidata para Preview, não homologada em produção.

## Regra de orçamento

A atualização **não exige cadastro, chave, contratação ou assinatura de Cloudflare, TURN/SFU, LiveKit, serviço de notícias, serviço de IA ou API paga**. Nenhuma credencial dessas plataformas é utilizada. A distribuição de vídeo continua sendo **WebRTC P2P com STUN público**, sem retransmissor. O transmissor envia para cada espectador conectado.

**Limite importante:** isso não garante custo zero em QUALQUER uso. Seu Vercel e Supabase atuais estão sujeitos aos limites dos seus planos. Se houver uso acima das cotas, tráfego alto, conta com cobrança habilitada ou exploração comercial, consulte condições dos fornecedores. Os endpoints públicos da Steam/Epic e RSS também podem falhar ou mudar sem aviso.

## O que mudou

1. **Home Gaming Hub:** dados de ofertas Steam, promoções gratuitas Epic e feeds oficiais Xbox/NVIDIA em `/api/discover`. Sem tokens de IA. Somente promoções verificadas por dados recebidos da fonte, sem inventar preço. Se uma fonte falhar, a home mantém links oficiais para consulta manual. Cache em memória de 45 minutos e cache CDN da Vercel em 30 minutos; sem Cron adicional.
2. **Histórico pessoal de reprodução:** grava até 120 registros por usuário quando o YouTube de fato começa a reproduzir. Música recente pode ser adicionada novamente à fila com um clique. O registro é privado por conta.
3. **Favoritos:** coração na fila, com estado visível.
4. **Playlists pessoais:** renomear, buscar, mover músicas para cima/baixo e remover músicas de uma playlist sem apagar os dados antigos; limitadas como na versão anterior. A playlist continua sendo uma cópia da fila.
5. **Sincronização:** tolerância a pequenos desvios; evita comandos de pausar/tocar repetidos e permite um único alinhamento inicial para quem entrou atrasado, exigindo desvio grande persistente nas correções seguintes, com intervalo mínimo entre correções. Exibe o estado de sincronização.
6. **Sala social:** botões para recolher painel social e painel musical. O player de vídeo não é escondido durante reprodução ativa por compatibilidade com o YouTube. Jogos continuam em janelas independentes.
7. **WebRTC gratuito:** captura com limites moderados de resolução/quadros, tentativa de limitar bitrate e mensagens de falha quando uma conexão P2P não é possível. Até três transmissores por sala continuam previstos, mas redes restritivas podem falhar sem TURN.
8. **Xadrez e Truco originais, BOTs, histórico de jogos, logo e identidade Premium Gold + Social:** preservados. **Sinuca continua removida.**

## GitHub Desktop

1. Faça backup ou crie uma branch chamada `testes/tdb-8.2.0` a partir do projeto atual.
2. Extraia o ZIP completo em uma **cópia** do repositório, não em pastas duplicadas dentro dele.
3. Confira os arquivos alterados e faça o commit na branch de testes.
4. Não faça merge na produção antes de homologar.

## Supabase

- **Nenhum SQL novo exigido exclusivamente pela 8.2.0.** O histórico musical usa chaves pessoais na tabela compartilhada já utilizada por playlists/favoritos.
- Se a migração `database/SUPABASE-PERFORMANCE-v8.1.4.sql` **ainda não foi aplicada** à instalação atual, faça backup e teste essa migração anterior em banco de homologação antes de usar a 8.2.0. O esquema `SUPABASE-HUB-v8.sql` também precisa estar instalado para o TDB 8.
- Nunca execute as migrações repetidamente sem conferir o estado do banco. Não exclua tabelas de contas, favoritos ou partidas.

## Vercel

- Sem variáveis de ambiente adicionais; sem Cron extra; sem conexão com Cloudflare.
- Faça **Preview Deployment** da branch, preferencialmente apontando para um Supabase de testes.
- Teste `/api/discover`: deve retornar `ok:true`, listas vazias quando nenhuma fonte pública responder, e links oficiais. A home não deve travar quando a fonte falhar.
- Observe tráfego, invocações e custos do seu plano Vercel/Supabase, pois cotas não são ilimitadas.

## Teste antes de publicar

- Home: filtros Steam/Epic/Notícias/Nuvem, links oficiais, falha simulada de fonte e carregamento mobile.
- Música: reproduzir YouTube em duas contas, observar status, testar pausa/avanço sem `seek` repetitivo, e verificar histórico por conta.
- Playlist: renomear, mover faixa, remover faixa, buscar, carregar na fila; confirmar que dados antigos ainda estão lá.
- Sala: recolher/reabrir chat e música, mantendo jogos e transmissão funcionando. Enquanto houver reprodução, o vídeo YouTube deve permanecer visível.
- Jogos: criar Xadrez/Truco com humanos/BOTs, jogar partida completa, minimizar e reabrir a janela; Sinuca não deve aparecer.
- Telas: até 3 compartilhamentos com pessoas em redes diferentes. P2P pode não estabelecer conexão com CGNAT, firewall ou NAT restritivo; isso não é um defeito que se resolve sem relay TURN.
- Salas anteriores: entrar, excluir pelo criador original, confirmar que favoritos e histórico pessoal não desaparecem.

## Limites e fatos da implementação

- **Não foram realizados testes reais contra Supabase/Vercel ou preços/dados ao vivo das lojas neste ambiente**. Os testes de fontes usam respostas simuladas e os testes do servidor usam o armazenamento local isolado. A homologação é essencial.
- **TURN/SFU não está nesta entrega** por sua regra de não contratar serviços pagos. A escalabilidade e conectividade em redes difíceis são limitadas.
- **Nenhuma publicação foi feita automaticamente.**
