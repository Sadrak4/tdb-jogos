# DEPLOY — TDB v7.2.0

1. Não é necessário executar SQL novo para esta versão.
2. Extraia `TDB-v7.2.0-SINUCA.zip`.
3. Substitua os arquivos do repositório pela versão nova.
4. Abra o GitHub Desktop e confira as alterações.
5. Commit sugerido: `TDB v7.2.0 - Sinuca 8-Ball`.
6. Clique em **Push origin**.
7. Aguarde o Vercel concluir o deploy.
8. Abra `/api/health` e confirme `"version": "7.2.0"`.
9. Teste com duas contas: criar sala de Sinuca, entrar, iniciar, executar tacadas, provocar uma falta, voltar à sala, alterar regras e iniciar novamente.
10. Em uma terceira conta, teste **Ao vivo agora → Assistir** quando espectadores estiverem permitidos.

## Observação

Blackjack continua bloqueado como **Em manutenção** e aparece por último no lobby.
