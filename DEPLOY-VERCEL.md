# TDB JOGOS v4.2 — GitHub + Vercel + Redis

## PASSO 1 — Atualizar o GitHub

No seu PC, abra a pasta usada pelo GitHub Desktop para o repositório `tdb-jogos`.

Copie TODOS os arquivos desta v4.2 para dentro dela e substitua os antigos.

No GitHub Desktop:

1. escreva no Summary:
   `TDB JOGOS v4.2 Online Sync Fix`
2. clique em `Commit to main`;
3. clique em `Push origin`.

A Vercel deve detectar o novo commit automaticamente.

---

## PASSO 2 — Framework da Vercel

No projeto TDB JOGOS:

- Framework / Application Preset: `Other`
- Root Directory: `./`
- Build Command: padrão/vazio
- Output Directory: padrão/vazio

O projeto é frontend estático + funções em `/api`.

---

## PASSO 3 — Redis (OBRIGATÓRIO)

Sem Redis, duas pessoas podem cair em instâncias diferentes da Vercel e enxergar estados diferentes.

No projeto da Vercel:

1. abra `Marketplace` ou `Storage`;
2. adicione um Redis compatível;
3. conecte ao projeto;
4. obtenha uma URL TCP Redis no formato:
   `redis://...`
   ou
   `rediss://...`
5. abra:
   `Settings > Environment Variables`
6. crie:
   `REDIS_URL`
7. coloque a URL como valor;
8. marque Production, Preview e Development se desejar;
9. salve;
10. faça `Redeploy`.

NUNCA coloque o valor de REDIS_URL dentro do GitHub.

---

## PASSO 4 — Conferir

Abra:

`https://SEU-DOMINIO.vercel.app/api/health`

Precisa aparecer:

- `"redis": true`
- `"readyForMultiplayer": true`

No topo do site deve aparecer:

`ONLINE`

Se aparecer:

`SEM REDIS`

o banco ainda não está conectado.

---

## PASSO 5 — Contas

Se você criou contas na versão anterior SEM Redis, recrie as contas depois de configurar o Redis.

Sem banco compartilhado, as contas antigas podiam existir apenas na memória temporária de uma instância.

---

## PASSO 6 — Teste de sala

### PC 1
- conta A;
- cria sala Xadrez/Truco/Music.

### PC 2
- conta B;
- abre o mesmo domínio;
- a sala deve aparecer em até aproximadamente 2 segundos;
- entra.

No host, o nome do segundo jogador deve aparecer automaticamente.

---

## PASSO 7 — Xadrez

- dois usuários na sala;
- host clica Iniciar;
- os dois devem abrir o tabuleiro;
- uma jogada deve aparecer no outro PC em menos de ~1 segundo.

---

## PASSO 8 — Truco

Comece em 1x1.

- jogador A vê somente sua mão;
- jogador B vê somente sua mão;
- cartas jogadas aparecem para ambos;
- depois teste 2x2.

---

## PASSO 9 — TDB Music

- ambos entram na mesma sala;
- PC 1 adiciona vídeo;
- PC 2 recebe a fila;
- teste Tocar/Pausar/Próxima;
- diferenças pequenas de tempo são corrigidas automaticamente.

---

## PASSO 10 — Amigos

Copie o ID exibido no perfil de uma conta, por exemplo:

`TDB-XXXXXXXX`

Na outra conta:

`Amigos > Adicionar por ID`

A busca agora acontece no backend, não somente no navegador local.

---

## Diagnóstico rápido

### Sala aparece às vezes e às vezes não
Verifique `/api/health`.
Se `redis:false`, esse é o problema.

### Site mostra LOCAL
O frontend não está conseguindo acessar as funções `/api`.

### Site mostra SEM REDIS
Backend está acessível, mas `REDIS_URL` não está configurado corretamente.

### Site mostra ONLINE
Backend + Redis estão prontos para multiplayer.

### WebSocket falha mas ONLINE continua
Normal nesta versão: o HTTP fallback mantém a sincronização.
