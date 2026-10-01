# DEPLOY — TDB JOGOS v6.0 SOCIAL + PLATFORM

## Supabase

A v6.0 não adiciona tabelas ou colunas.

Se o schema da v5.5 já está aplicado e o projeto Supabase está ativo, **não execute SQL novo**.

Os novos recursos usam estruturas existentes, incluindo `tdb_shared`, `tdb_presence`, `tdb_rooms`, `tdb_sessions`, `tdb_error_logs` e tabelas sociais já criadas.

## Atualizar pelo GitHub Desktop

1. Faça `Fetch origin` / `Pull origin` antes de substituir arquivos.
2. Extraia `TDB-JOGOS-v6.0-SOCIAL-PLATFORM.zip`.
3. Abra:
   `GitHub Desktop -> Repository -> Show in Explorer`
4. Copie os arquivos da v6.0 por cima do repositório.
5. Confirme que `api/` continua com apenas `router.js`.
6. Commit sugerido:

```text
TDB JOGOS v6.0 Social Platform
```

7. `Commit to main`.
8. `Push origin`.
9. Aguarde o deploy automático da Vercel.

## Verificar produção

Abra:

```text
https://tdb-jogos.vercel.app/api/health
```

Resultado esperado:

```json
{
  "ok": true,
  "version": "6.0.0",
  "supabase": true,
  "schemaReady": true,
  "readyForMultiplayer": true,
  "maintenance": {
    "enabled": false
  }
}
```

## Teste recomendado com 2–4 navegadores

### Sala / Ready
1. Crie Truco ou Xadrez.
2. Entre com outra conta.
3. Confirme que o host não inicia antes de todos marcarem `PRONTO`.
4. Finalize/volte à sala e confirme que o estado pronto foi resetado.

### Reconexão
1. Durante uma partida, interrompa a conexão de um navegador.
2. Confirme o aviso visual de reconexão e countdown.
3. Volte antes dos 90 segundos.
4. Confirme que a partida continua.

### Party
1. Crie um grupo.
2. Convide 1–3 amigos.
3. Entre em uma sala com o líder.
4. Confirme que os outros recebem `Acompanhar`.

### Chat / reações / espectador
1. Envie mensagens em uma sala.
2. Teste reações rápidas.
3. Abra um espectador e confirme a contagem.
4. Confirme que o espectador não pode realizar ações do jogo.

### Privacidade
Teste os quatro modos:
- Pública
- Somente amigos
- Somente convite
- Com senha

### TDB Music
1. Toque várias faixas e confirme o histórico recente.
2. Favorite uma música.
3. Salve a fila como playlist.
4. Limpe/altere a fila e carregue o preset novamente.

### ADM
1. Confira filtros.
2. Confira versão/sessões dos usuários.
3. Ative manutenção.
4. Confirme que um usuário comum vê a tela de manutenção.
5. Desative manutenção pelo ADM.
6. Confira erros agrupados por versão.

### Salas vazias
Repita para Truco, Xadrez, Blackjack e Music:
1. Todos saem.
2. A sala permanece por até 5 minutos.
3. Se alguém retornar, a expiração é cancelada.
4. Sem retorno, a sala desaparece após o prazo.
