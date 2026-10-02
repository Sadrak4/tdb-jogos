# DEPLOY — TDB v7.1.6 LOBBY / LIVE / UX

## Banco de dados
Nenhum SQL novo nesta versão. Não rode uma migration adicional se `public.tdb_users.banner` já foi criado anteriormente.

## Publicação
1. Extraia `TDB-v7.1.6-LOBBY-LIVE-UX.zip`.
2. Substitua os arquivos do repositório atual pelos arquivos extraídos.
3. Abra o GitHub Desktop e confira as alterações.
4. Commit sugerido: `TDB v7.1.6 - Lobby Live UX`.
5. Faça **Push origin**.
6. Aguarde o Vercel ficar **Ready**.
7. Abra `/api/health` e confirme `"version": "7.1.6"`.

## Checklist rápido após deploy
- Criar uma sala e confirmar **Voltar ao lobby** e **Apagar sala agora** para o host.
- Iniciar Truco/Xadrez em outra conta e confirmar que a partida aparece em **Ao vivo agora** e abre com **Assistir**.
- No Truco com bot, pedir Truco e conferir a espera + resposta no canto superior direito.
- No Xadrez, testar clique-clique e arrastar/soltar apenas em casas permitidas.
- Abrir TDB Lobby/Música em 100%, 125% e resolução de notebook e conferir que nenhum painel direito fica cortado.
- Durante compartilhamento, usar **Trocar tela / janela / aba**.
- Confirmar que Blackjack mostra manutenção e não abre o navegador/criação de salas.
- Recolher a barra lateral e restaurá-la pelo controle lateral.
