# TDB 8.3.3 RC1 — Biblioteca e Jogos Clássicos

**Comece por:** [`LEIA-PRIMEIRO-8.3.3.md`](LEIA-PRIMEIRO-8.3.3.md).

- Removida a barra horizontal redundante de atalhos da sala, preservando os botões reais dos respectivos painéis e o convite no cabeçalho.
- Biblioteca pessoal com abas Playlists / Favoritos / Histórico, pesquisa, playlists recolhíveis e gestão das faixas.
- Truco paulista: feedback de Truco, Seis, Nove, Doze, Mão de 11 e cartas vencedoras com destaque dourado; revelação de rodada reduzida para 1,25 segundo.
- Xadrez: status, aviso de empate e resumo ao encerrar, preservando o motor original, janelas, relógios, PGN e BOTs.
- Correção de estado musical ao abrir/restaurar/fechar janelas de jogos.

**Não há nova migração SQL, serviço pago nem publicação automática.** O ADM continua separado em `/adm`, Notícias continua como página inicial e Sinuca permanece removida. O SQL da versão 8.1.4 continua necessário para instalações antigas que ainda não o receberam.

Esta é uma *release candidate* para homologação: o conjunto de testes de navegador utiliza API simulada, e a integração completa com Supabase real permanece pendente.
