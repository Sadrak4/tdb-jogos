# TDB v7.2.5 — Central de Atividades

O TDB é uma plataforma de jogos e salas online com música compartilhada, compartilhamento de tela e recursos sociais. A **v7.2.5** adiciona uma **Central de Atividades** ao TDB Lobby.

## O que já funciona nesta versão

- Criar **uma mesa de organização** para Xadrez, Sinuca ou Truco dentro de uma sala TDB Lobby;
- Entrar/sair da mesa como jogador ou espectador, com controle de permissões;
- Atualizar a lista de participantes sem recriar a interface da música ou encerrar a transmissão;
- Manter os jogos convencionais e os demais recursos da v7.2.4.

**Limitação:** ainda **não é possível abrir e jogar** Xadrez/Sinuca/Truco dentro do Lobby. Nesta etapa, as mesas apenas organizam participantes. A integração dos jogos será feita em futuras versões.

## Arquivos e pastas

- `index.html`, `app.js`, `style.css`: interface principal;
- `games/`: módulos de música, transmissão e jogos;
- `server/`, `api/`: backend e endpoints;
- `core/`, `ui/`, `assets/`: recursos compartilhados e interface;
- `tests/`: testes (incluindo alguns de versões anteriores);
- `database/`: **scripts SQL de referência** do Supabase (não reaplicar automaticamente);
- `docs/historico/`: relatórios e instruções **antigos**, mantidos para consulta;
- `CHANGELOG.md`: histórico resumido das versões;
- `ATUALIZACAO-v7.2.5.md`: novidades e instruções da versão atual;
- `DEPLOY-VERCEL.md`: publicação via GitHub Desktop + Vercel.

## Instalação e execução

Consulte `ATUALIZACAO-v7.2.5.md` e `DEPLOY-VERCEL.md`. Para ambiente Node.js:

```sh
npm install
npm run dev
```

As credenciais do Supabase devem ser configuradas em variáveis de ambiente; veja `.env.example`. **Não envie `.env` para o GitHub.**

## Supabase

Se o banco já estava configurado para a v7.2.4, **não há SQL novo na v7.2.5**. Os arquivos da pasta `database/` são históricos/de referência, não uma instrução para executá-los novamente.

## Sobre esta reorganização

Os módulos de jogos, APIs, rotas e estilos foram preservados. A mudança reorganiza documentação/SQL, corrige caminhos de consulta em alguns testes e atualiza referências textuais ao local do SQL. **Não acrescenta uma nova funcionalidade de jogo nem modifica o banco.**
