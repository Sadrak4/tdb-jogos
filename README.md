# TDB 8.3.2 — Navegação, ADM separado e Nuuvem

**Leia primeiro:** [`LEIA-PRIMEIRO-8.3.2.md`](LEIA-PRIMEIRO-8.3.2.md).

Acesso administrativo independente: `/adm`, com credenciais de servidor. O menu normal apresenta Notícias, Salas, Jogos, Música, Amigos e Meu perfil. A atualização mantém os recursos da 8.3.1 sem novas migrações.

# TDB 8.3.0 RC1 — Gaming Universe

**Primeiro leia [`LEIA-PRIMEIRO-8.3.0.md`](LEIA-PRIMEIRO-8.3.0.md).** Esta é uma versão candidata para testes, não para substituir produção sem homologação.

Redesign oficial **preto / dourado / verde** baseado na prévia aprovada: Notícias como primeira página após autenticação, promoções Steam/Epic/cloud gaming, navegação renovada com pesquisa Ctrl+K, ações e salas reais, interior social reorganizado e Xadrez/Truco originais em janelas de jogo preservadas. A Sinuca permanece removida. Não há novos serviços pagos nem migração SQL da 8.3.

## Desenvolvimento e testes

```bash
npm install
npm run test:integrated
npm run test:universe
npm run test:free
npm start
```

Para testes visuais, use Python Playwright com Chromium instalado. Os testes de browser usam API simulada e **não** substituem a homologação de Supabase/Vercel/YouTube/WebRTC em produção. Consulte a documentação da migração 8.1.4 caso esteja atualizando a partir de uma instalação anterior.

## Registro de versões

Veja `CHANGELOG.md` e os arquivos `ATUALIZACAO-*`. Alguns documentos anteriores descrevem recursos que mudaram depois; **este guia 8.3 prevalece para a RC atual**.


## Atualização 8.3.1

Leia **LEIA-PRIMEIRO-8.3.1.md** antes de colocar em Preview. O painel ADM requer variáveis de ambiente.
