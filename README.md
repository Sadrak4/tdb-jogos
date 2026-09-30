# TDB JOGOS v5.5 — Admin + Áudio/UX

TDB JOGOS é uma plataforma browser-first com Truco Paulista, Xadrez e TDB Music, usando Vercel + Supabase para multiplayer e persistência.

## v5.5

### Painel administrativo

A v5.5 adiciona um painel administrativo separado do login normal do jogador.

A autenticação do administrador é validada no servidor. A senha não fica exposta no JavaScript do navegador; o código do servidor guarda somente um hash derivado.

O painel permite:

- visualizar quantidade de contas;
- buscar conta por nome ou `TDB-ID`;
- recuperar conta redefinindo a senha;
- gerar senha temporária;
- trocar a senha manualmente;
- encerrar todas as sessões de uma conta;
- banir e desbanir IDs;
- visualizar logs de erro de cliente/servidor;
- visualizar auditoria das ações administrativas;
- receber e tratar reportes de bugs/erros enviados pelos jogadores.

> A senha antiga de um jogador nunca pode ser visualizada porque as senhas são armazenadas com hash. Recuperação significa redefinir a senha.

O acesso pode ser aberto pela opção **Administração** na tela de login ou diretamente com `#admin` no endereço do site.

### Reportes

Todos os jogadores logados têm em **Configurações** um bloco **Reportar bug ou erro**.

O reporte envia ao painel ADM:

- jogador/ID;
- categoria;
- descrição;
- tela atual;
- jogo e sala, quando houver;
- versão do app;
- estado da conexão e latência;
- identificação técnica do navegador.

Nenhuma senha, token ou carta privada é enviada no reporte.

### Banimento

Contas banidas:

- não conseguem realizar um novo login;
- têm as sessões existentes revogadas ao serem banidas;
- perdem acesso às APIs protegidas quando a sessão é invalidada.

### Áudio

O áudio foi centralizado em um único `AudioContext`, evitando criar um contexto novo a cada clique.

Há efeitos de baixo volume para:

- botões e navegação;
- confirmar/voltar/erro/sucesso;
- criar/entrar em sala;
- iniciar partida;
- distribuição e jogada de cartas;
- carta escondida;
- Truco/6/9/12;
- rodada vencida/perdida;
- vitória/derrota;
- seleção, movimento, captura e xeque no Xadrez;
- adicionar/remover faixa no TDB Music.

Em **Configurações** existem controles separados para:

- volume geral;
- interface;
- jogos;
- alertas sonoros.

Os volumes padrão são intencionalmente baixos.

### Ping

A barra superior agora exibe a latência aproximada da API em milissegundos. O valor é atualizado durante os heartbeats da sessão.

### Ranking global removido

O sistema de TOP global/ranking foi removido completamente da interface e da API.

Foram preservados:

- histórico individual do perfil;
- vitórias/derrotas/empates do próprio jogador;
- resultados das partidas reais;
- regra de que partidas contra bots não contam para o histórico competitivo.

### Notificações

O sistema de notificações existente não foi alterado nesta atualização.

## Multiplayer

A v5.5 mantém as correções da v5.4:

- Truco 1x1 e 2x2 com mão privada por jogador;
- você sempre aparece embaixo na própria tela do Truco;
- servidor autoritativo para Truco/Xadrez;
- Xadrez com seleção estável e movimento otimista;
- reconexão de 90 segundos;
- host migratório;
- ciclo Sala → Partida → Resultado → Sala → Nova partida;
- TDB Music compartilhado sem usar o lifecycle competitivo.

## Banco de dados

A v5.5 adiciona estruturas novas. É obrigatório executar a seção **MIGRAÇÃO v5.5** do `SUPABASE-SCHEMA.sql` antes de publicar o código v5.5.

Novidades no banco:

- campos de banimento em `tdb_users`;
- `tdb_admin_sessions`;
- `tdb_reports`;
- `tdb_admin_audit_logs`.

As contas e históricos existentes são preservados.

## Produção

Depois da migração e do deploy, confira:

`https://tdb-jogos.vercel.app/api/health`

Esperado: `version: "5.5.0"`, `supabase: true`, `schemaReady: true` e `readyForMultiplayer: true`.
