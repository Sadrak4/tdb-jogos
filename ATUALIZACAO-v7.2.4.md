# Atualização TDB v7.2.4 — Lobby Música Rebuild

## Interface

O fluxo principal agora começa por um bloco grande **Adicionar música**, acima do player. O link do YouTube pode ser colado e confirmado com Enter ou pelo botão `+ Adicionar à fila`.

O painel da direita foi simplificado em três abas:

- **Música** — pesquisa opcional e configuração da API do YouTube;
- **Tela** — compartilhamento de monitor/janela/aba;
- **Playlists** — presets salvos da conta.

A fila continua no centro e mostra quem adicionou cada faixa.

## Sincronização

A sincronização foi refeita para reduzir reinícios e saltos inesperados:

1. o cliente estima o relógio do servidor através do `serverTime` das respostas;
2. `expectedPosition()` usa esse relógio sincronizado;
3. o player guarda qual vídeo já foi solicitado ao YouTube;
4. enquanto o iframe está carregando/bufferizando, o TDB não repete `loadVideoById`;
5. correções de posição só acontecem quando o drift passa do limite;
6. existe cooldown entre seeks remotos;
7. um seek suspeito para o começo é ignorado quando não existe comando novo do servidor;
8. cada mudança de playback recebe `playbackRevision`;
9. o avanço automático no final do vídeo é decidido pelo host, evitando múltiplos clientes enviando NEXT simultaneamente.

Também foi adicionado o botão **Sincronizar** para ajuste manual caso algum navegador bloqueie autoplay ou fique muito atrasado.

## Banco

Nenhuma alteração de schema/Supabase é necessária.
