# TDB v7.1.7 — Perfil 3.0 + Xadrez maior

## Perfil 3.0
- Refeito o visual da página de perfil.
- Banner virou uma capa maior e integrada ao cabeçalho do perfil.
- Avatar ficou maior e sobreposto à capa.
- Adicionado chip de presença/status.
- ID TDB ganhou ação de copiar mais clara.
- Área de edição agora possui pré-visualização.
- Mantidas as iniciais como fallback.
- Adicionada **Foto de perfil por URL de imagem** independente do banner.
- Links de imagem são limitados a HTTP/HTTPS no backend.

## Perfis de amigos
- Adicionado botão **Visitar perfil** nos cards de amigos.
- Clicar no amigo abre uma página pública completa em vez de depender apenas do modal rápido.
- Página pública mostra banner, foto, nome, ID, presença, estatísticas e partidas recentes.
- Se você estiver em uma sala, pode convidar o amigo diretamente do perfil.
- Busca de jogadores também ganhou ação **Ver perfil**.

## Avatar em outras áreas
- Foto de perfil passa a aparecer na barra lateral/perfil compacto, lista de amigos, busca de jogadores, sala de espera e componentes compatíveis.
- O campo antigo `avatar` continua armazenando as iniciais/fallback para compatibilidade.

## Xadrez
- Nova regra final de dimensionamento do tabuleiro em desktop.
- O tamanho agora considera simultaneamente largura e altura disponíveis.
- Removido o gargalo visual que deixava grandes espaços vazios acima/abaixo do tabuleiro.
- Painel direito continua reservado e acessível.
- Em telas baixas existe uma regra específica para evitar estouro da resolução.

## Supabase
Esta atualização precisa de uma coluna nova em `public.tdb_users`:

```sql
alter table public.tdb_users
  add column if not exists avatar_image text;
```

O mesmo comando está em `SUPABASE-MIGRATION-v7.1.7.sql`.
