# DEPLOY — TDB JOGOS v7.0 VISUAL REBUILD

## Banco

A v7.0 é uma atualização de interface e **não exige SQL novo**.

Não altere o schema do Supabase se a versão anterior já está funcionando.

## Atualizar pelo GitHub Desktop

1. Abra o repositório `tdb-jogos`.
2. Clique `Fetch origin`.
3. Se houver `Pull origin`, faça o Pull antes de substituir os arquivos.
4. Extraia `TDB-JOGOS-v7.0-VISUAL-REBUILD.zip`.
5. Copie o conteúdo por cima do repositório local.
6. Confirme que a nova pasta `ui/` e `assets/v7/` estão no repositório.
7. Commit sugerido:

```text
TDB JOGOS v7.0 Visual Rebuild
```

8. `Commit to main`.
9. `Push origin`.
10. Aguarde a Vercel concluir o deploy.

## Verificar versão

Abra:

```text
https://tdb-jogos.vercel.app/api/health
```

Deve aparecer:

```json
"version": "7.0.0"
```

## Checklist visual

Teste em zoom 100%:

- 1366×768
- 1920×1080
- celular/tablet se possível

Revise:

1. Login e cadastro.
2. Home/Lobby.
3. Todos os quatro cards de jogo.
4. Navegador de salas.
5. Sala de espera.
6. Truco 1x1 e 2x2.
7. Xadrez.
8. Blackjack.
9. TDB Lounge e screen share.
10. Amigos.
11. Perfil.
12. Configurações.
13. Painel ADM.
14. Operação / manutenção.
15. Tela cheia / modo foco.

## Compartilhamento de tela

O fluxo corrigido na v6.1.2 foi mantido. A nova camada visual não altera as rotas WebRTC/sinalização.

## Rollback

Se precisar voltar, a v6.1.2 continua compatível com o mesmo banco; basta redeployar o commit anterior.
