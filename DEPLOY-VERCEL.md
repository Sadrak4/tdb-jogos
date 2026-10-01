# DEPLOY — TDB JOGOS v6.1 TDB LOUNGE + SCREEN SHARE

Não há SQL novo.

## Publicar
1. Fetch/Pull no GitHub Desktop.
2. Copie os arquivos da v6.1 sobre o repositório.
3. Commit: `TDB JOGOS v6.1 TDB Lounge Screen Share`
4. Push origin.
5. Aguarde a Vercel.

Confira `/api/health` e confirme `version: 6.1.0`.

## Teste
- crie uma sala TDB Lounge com duas contas;
- no transmissor clique Compartilhar tela;
- escolha tela inteira, janela ou aba;
- no outro usuário deve aparecer Visualizar transmissão;
- sem clicar, ele não recebe o vídeo;
- clicando, a transmissão abre;
- teste Tela cheia e Fechar;
- parar de assistir não pode encerrar o stream do transmissor;
- Parar transmissão deve encerrar para todos.

## TURN opcional
WebRTC funciona normalmente em muitas redes usando STUN. Redes corporativas/NATs restritivos podem exigir TURN. Se necessário configure na Vercel:
- SCREEN_SHARE_TURN_URLS
- SCREEN_SHARE_TURN_USERNAME
- SCREEN_SHARE_TURN_CREDENTIAL

Nenhuma dessas variáveis é obrigatória para o primeiro teste.
