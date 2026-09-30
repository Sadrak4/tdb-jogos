# COMO PUBLICAR O TDB JOGOS — GitHub + Vercel

## 1. Extraia o ZIP

Extraia a pasta inteira. Não envie somente `index.html`.

## 2. Teste local

Dentro da pasta:

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal.

Teste:
- cadastro/login;
- criar sala TDB Music;
- duas abas;
- criar Xadrez;
- criar Truco.

## 3. GitHub

Crie um repositório vazio, por exemplo:

`tdb-jogos`

Na pasta do projeto:

```bash
git init
git add .
git commit -m "TDB JOGOS v4.0 Online"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/tdb-jogos.git
git push -u origin main
```

## 4. Vercel

1. Abra Vercel.
2. `Add New` > `Project`.
3. Importe `tdb-jogos`.
4. Framework Preset: `Other`.
5. Root Directory: raiz do repositório.
6. Deploy.

## 5. Redis — obrigatório para multiplayer de produção

No projeto da Vercel:

1. abra Marketplace/Storage;
2. adicione um Redis compatível;
3. conecte ao projeto;
4. crie/confirme a variável:

```text
REDIS_URL
```

Use a URL de conexão entregue pelo provedor.

Depois faça um Redeploy.

## 6. Testar backend

Abra:

```text
https://SEU-DOMINIO.vercel.app/api/health
```

Deve responder com JSON do TDB JOGOS.

No site, o topo deve mostrar:

`ONLINE`

## 7. Teste real em dois computadores

### Music
PC 1:
- cria sala;
- adiciona link.

PC 2:
- entra pelo código;
- deve receber a fila;
- teste play/pause/próxima.

### Xadrez
- dois usuários diferentes;
- entrar na mesma sala;
- host inicia;
- cada jogador recebe sua cor;
- movimentos aparecem nos dois PCs.

### Truco
- crie 1x1 primeiro;
- dois usuários;
- host inicia;
- cada jogador vê somente sua mão.

Depois teste 2x2 com quatro usuários.

### Espectador
Em outro navegador/conta:
- Lobby > Partidas ao Vivo;
- Assistir;
- confirmar que não existem botões para jogar;
- no Truco, confirmar que nenhuma mão privada aparece.

## 8. YouTube API

Não é obrigatória.

Adicionar por link funciona sem a YouTube Data API.

Para pesquisa, configure uma chave separadamente.

## 9. Atualizações futuras

Depois que GitHub e Vercel estiverem conectados:

```bash
git add .
git commit -m "Atualização"
git push
```

A Vercel cria novo deploy automaticamente.

## Segurança

Não coloque no GitHub:
- `.env`;
- `REDIS_URL`;
- chaves privadas.

O `.gitignore` já ignora arquivos `.env`.
