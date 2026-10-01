# DEPLOY — TDB JOGOS v6.1.1 SCREEN SHARE FIX

Esta versão corrige a negociação do compartilhamento de tela da v6.1.

## Banco de dados

**Não execute SQL novo.**

A sinalização continua usando `tdb_shared`, porém agora em chaves independentes para evitar que heartbeat / offer / answer se sobrescrevam.

## Publicar

1. No GitHub Desktop, faça `Fetch origin` e `Pull origin` se aparecer.
2. Extraia `TDB-JOGOS-v6.1.1-SCREENSHARE-FIX.zip`.
3. Copie os arquivos por cima do repositório atual.
4. Commit sugerido:

```text
TDB JOGOS v6.1.1 Screen Share Fix
```

5. `Commit to main`
6. `Push origin`
7. Aguarde a Vercel concluir o deploy.

## Confirmar versão

Abra:

```text
https://tdb-jogos.vercel.app/api/health
```

Confirme:

```json
"version": "6.1.1"
```

## Teste recomendado

Use duas contas diferentes na mesma sala TDB Lounge.

### Transmissor
1. Clique `Compartilhar tela`.
2. Escolha tela inteira, janela ou aba.
3. A prévia deve aparecer imediatamente no centro da sala.
4. Deve aparecer um controle fixo `Compartilhando tela / Parar`.

### Espectador
1. Deve aparecer que o outro usuário está compartilhando.
2. Clique `Visualizar transmissão`.
3. Estado esperado: `Solicitando` -> `Negociando` -> `Estabelecendo vídeo` -> `AO VIVO`.
4. Teste `Tela cheia`.
5. Teste `Fechar`: somente o espectador para de assistir.

### Encerramento
- Clique `Parar compartilhamento` no TDB, ou
- clique `Parar compartilhamento` no controle nativo do Chrome/Edge.

Nos dois casos a transmissão deve desaparecer para os espectadores.

## Redes diferentes

A v6.1.1 usa STUN por padrão e funciona em redes que permitem WebRTC P2P.

Para máxima compatibilidade entre redes corporativas, CGNATs ou firewalls restritivos, configure um servidor TURN na Vercel:

```text
SCREEN_SHARE_TURN_URLS
SCREEN_SHARE_TURN_USERNAME
SCREEN_SHARE_TURN_CREDENTIAL
```

Exemplo do campo URL:

```text
turn:seu-servidor-turn:3478
```

O código detecta quando não existe TURN e mostra uma mensagem específica se a negociação P2P falhar repetidamente.
