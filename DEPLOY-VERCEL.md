# Atualização v4.3 na Vercel

## 1. Substitua os arquivos no repositório local

Extraia esta versão e copie todo o conteúdo para dentro da pasta `tdb-jogos` usada pelo GitHub Desktop.

Aceite **Substituir arquivos**.

## 2. GitHub Desktop

- Summary: `TDB JOGOS v4.3 Vercel Hobby Fix`
- Commit to main
- Push origin

## 3. Vercel

No projeto correto `tdb-jogos`:

- Application/Framework Preset: `Other`
- Root Directory: `./`
- Build Command: padrão/vazio
- Output Directory: padrão/vazio

A Vercel deverá criar um novo deployment automaticamente.

A v4.3 usa apenas duas funções em `/api`, ficando abaixo do limite mostrado no plano Hobby.

## 4. Redis

Configure `REDIS_URL` em Settings > Environment Variables e faça Redeploy.

## 5. Teste

Abra:

`https://SEU-DOMINIO.vercel.app/api/health`

Confirme:

- `redis: true`
- `readyForMultiplayer: true`

Depois teste com duas contas em dispositivos diferentes.
