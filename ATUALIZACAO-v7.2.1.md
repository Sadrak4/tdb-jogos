# TDB v7.2.1 — Música sem limite

## Alteração

- Removido definitivamente o limite de músicas por pessoa no TDB Lobby/Música.
- A criação de sala não oferece mais seleção 3/5/10 músicas. A fila é sempre ilimitada.
- A edição de regras também informa que a fila é sem limite.
- O servidor não conta mais quantas músicas cada usuário adicionou e não retorna mais o erro de limite por pessoa.
- Salas antigas que ainda tenham `musicQueueLimit: 5` continuam funcionando sem limite, pois a limitação deixou de ser aplicada pelo servidor.
- O painel da sala mostra `∞ Sem limite`.
- Nenhuma alteração de banco de dados é necessária.
