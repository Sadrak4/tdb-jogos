# DEPLOY — TDB JOGOS v6.1.2 SCREEN SHARE ROUTE FIX

## O que estava errado

Na v6.1.1 a rota existia dentro de `server/http-router.js`, mas faltou publicar esta entrada em `vercel.json`:

```text
/api/platform/screen-share
```

Por isso a Vercel respondia HTTP 404 e a transmissão não chegava a ser registrada.

A v6.1.2 corrige isso e adiciona um fallback direto para:

```text
/api/router?route=platform/screen-share
```

## Banco

Não execute SQL novo.

## Publicar

1. `Fetch origin`
2. `Pull origin` se aparecer
3. Extraia `TDB-JOGOS-v6.1.2-SCREENSHARE-ROUTE-FIX.zip`
4. Copie por cima do repositório
5. Commit:

```text
TDB JOGOS v6.1.2 Screen Share Route Fix
```

6. `Commit to main`
7. `Push origin`
8. Aguarde a Vercel concluir o deploy

## Verificar versão

Abra:

```text
https://tdb-jogos.vercel.app/api/health
```

Esperado:

```json
"version": "6.1.2"
```

## Teste da rota antes de compartilhar

Depois do deploy, abra a TDB Lounge em uma conta online.

Agora ao clicar em `Compartilhar tela`, o fluxo deve mostrar primeiro:

```text
Verificando servidor…
```

Somente se a rota responder corretamente o navegador abrirá o seletor de tela.

Isso é proposital: se houver problema no backend, você recebe o erro antes de escolher uma tela.

## Teste em dois usuários

### Transmissor
1. Entre na mesma Lounge com duas contas.
2. No primeiro usuário clique `Compartilhar tela`.
3. Aguarde `Verificando servidor…`.
4. Escolha monitor, janela ou aba.
5. Deve aparecer imediatamente:
   - prévia da tela;
   - `Parar compartilhamento`;
   - barra fixa `Compartilhando tela`.
6. Depois deve aparecer confirmação de transmissão iniciada.

### Espectador
1. No segundo usuário deve aparecer que existe uma transmissão.
2. Clique `Visualizar transmissão`.
3. Acompanhe:
   - Solicitando transmissão
   - Negociando conexão
   - Estabelecendo vídeo
   - AO VIVO

## Se ainda não conectar vídeo

Se a transmissão aparece para o outro usuário, mas o vídeo falha somente entre redes diferentes, a rota já está funcionando e o problema passa a ser WebRTC/NAT.

Nesse caso configure TURN:

```text
SCREEN_SHARE_TURN_URLS
SCREEN_SHARE_TURN_USERNAME
SCREEN_SHARE_TURN_CREDENTIAL
```

STUN já está configurado por padrão.
