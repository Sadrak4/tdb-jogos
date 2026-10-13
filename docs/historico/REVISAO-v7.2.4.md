# Revisão técnica — TDB v7.2.4

A auditoria do TDB Lobby encontrou duas causas prováveis para músicas voltarem ao início ou ficarem fora de sincronia.

## 1. Relógio local de cada computador

O estado musical usa `changedAt` gerado no servidor, mas a versão anterior comparava esse valor diretamente com `Date.now()` do navegador. Dois computadores com relógios alguns segundos diferentes podiam calcular posições esperadas diferentes.

A v7.2.4 mede o `serverTime` recebido pelas APIs e mantém um offset suavizado. A timeline da música usa `TDBOnline.serverNow()`.

## 2. Carregamento repetido do iframe do YouTube

Durante `BUFFERING`, `getVideoData().video_id` pode ficar temporariamente vazio. A implementação anterior interpretava isso como vídeo errado e podia chamar `loadVideoById` novamente. Essa chamada reinicia/recarrega a faixa.

A v7.2.4 guarda `requestedVideoId` e um período de proteção de carregamento. Um vídeo já solicitado não é solicitado novamente só porque o iframe ainda não informou o ID.

## Outras proteções

- drift correction com threshold e cooldown;
- `playbackRevision` separado das mudanças normais de fila;
- posição `0` é preservada corretamente no backend;
- ação `ENDED` host-authoritative;
- polling menos agressivo;
- indicador visual do estado de sincronização;
- botão de resync manual;
- interface reconstruída para reduzir confusão.
