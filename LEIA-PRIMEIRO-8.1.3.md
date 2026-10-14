# TDB 8.1.3 RC1 — Sinuca removida, Xadrez e Truco com resposta otimizada

## Objetivo

Atualização incremental da 8.1.2: remover a **Sinuca da experiência ativa do TDB 8** e diminuir a percepção de lag nas jogadas do **Xadrez e Truco**, sem alterar as regras nem reconstruir seus componentes visuais.

## Mudanças

1. **Sinuca desativada**: retirada dos seletores de novas mesas, treinamento e apresentação; o servidor rejeita criação de novas mesas/treinos e não exibe mesas antigas de Sinuca nos snapshots. **Os registros de partidas antigas não são apagados.** O motor antigo `server/pool-engine.js` é mantido como componente de compatibilidade para não apagar dados nem causar efeitos em APIs legadas. Se houver partidas de Sinuca em andamento antes da atualização, elas não poderão ser continuadas pela interface nova.
2. **Xadrez**: o motor de regras, as peças, o relógio e os três níveis de BOTs permanecem. Ao receber uma jogada humana, o servidor calcula o turno do BOT e devolve o estado resultante na própria resposta — não exige aguardar outro ciclo de atualização da sala.
3. **Truco**: BOTs consecutivos avançam dentro da própria solicitação, quando permitido pelas regras; animações/tempo de revelação e turnos humanos são respeitados.
4. **Interface**: exibe imediatamente a visão autorizada devolvida pelo servidor ao jogar e evita `snapshot` redundante após cada ação. Jogadas em curso recebem feedback visual; novas ações são bloqueadas até a confirmação anterior.
5. **Servidor**: o snapshot da sala evita carregar duas ou três vezes o mesmo registro e reaproveita o estado atualizado das partidas. Partidas encerradas não são regravadas indefinidamente a cada consulta. Uma resposta atrasada de polling não sobrescreve uma jogada mais recente.
6. **Intervalos**: atualização de estado a cada 2 s para acompanhar adversários humanos (era 3,2 s); sinalização WebRTC a cada 3 s. A aplicação continua dependendo de rede, região do banco e tempo de processamento no servidor.

## Arquivos alterados

- `index.html`
- `hub/hub.js`
- `hub/premium-gold.css`
- `server/hub-service.js`
- `server/game-service.js`
- `package.json`
- testes automatizados adaptados para apenas Xadrez/Truco, com regressão de tempo de resposta.

Nenhuma migração SQL ou mudança de identidade visual foi necessária.

## Testes executados localmente

- `npm run test:integrated` (usando substituto local isolado para a importação Supabase, **não** conectado ao banco real)
- `python tests/v812-classics-browser.py`: movimentação por clique/arrastar, integração visual, Truco 2×2, BOTs e privacidade, sem erros JavaScript.
- `python tests/v81-rc3-browser.py`: ausência de Sinuca nos seletores, criação de Xadrez e Truco com BOTs.
- `python tests/v811-premium-browser.py`: desktop e celular.
- `node tests/v813-performance.mjs`: Xadrez e Truco contra BOT devolvem o turno no mesmo retorno do servidor.

O motor de Xadrez difícil levou aproximadamente **0,9–1,2 s** para completar a jogada humana e a resposta do BOT em testes locais. Essa medição **não inclui latência da rede ou do Supabase/Vercel de produção** e não é uma promessa de tempo fixo.

## Como homologar sem arriscar o site principal

1. Faça backup do seu código atual e use uma **branch** de teste no GitHub Desktop.
2. Substitua os arquivos do projeto pelo conteúdo do ZIP, sem copiar a pasta raiz dentro de outra pasta.
3. Faça um deploy **Preview** na Vercel.
4. Limpe o cache com Ctrl+Shift+R.
5. Entre em sala antiga e confira Xadrez e Truco em janelas, contra outra pessoa e contra BOT. Verifique que Sinuca não aparece em Nova mesa nem Treinamento.
6. Teste música, chat, espectadores, histórico, transmissão e exclusão de sala antiga.
7. Se houver lag online, abra F12 > Rede, filtre `api/hub` e anote duração do POST `game:action` e do GET `snapshot`; isso separa atraso da rede/servidor de atraso no navegador.

**GitHub Desktop:** atualizar somente para Preview inicialmente.

**Supabase:** nenhuma instrução SQL para esta RC. Não apague tabelas nem registros de Sinuca.

**Vercel:** deploy Preview da branch; não publicar em produção antes dos testes com duas contas reais.

## Limitações

- Não foi possível validar com o Supabase real, a Vercel real ou com seu tráfego de produção.
- A resposta dos BOTs pode demorar por cálculo e rede. O processamento de Xadrez difícil não foi simplificado para não perder a qualidade original.
- A Sinuca foi retirada da interface TDB 8 e bloqueada no serviço de novas mesas; arquivos do motor legado foram mantidos para compatibilidade, não para exposição ao público.
