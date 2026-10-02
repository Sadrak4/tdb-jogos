# TDB JOGOS v7.0 — Visual Rebuild

A v7.0 reconstrói a camada gráfica do TDB JOGOS sem trocar a arquitetura funcional da plataforma.

## Direção visual

**Dark Luxury Gaming**: preto/grafite como base, dourado metálico usado apenas em foco/ações importantes e superfícies mais profundas. O objetivo foi sair de uma coleção de telas funcionais para uma interface com aparência de plataforma de jogos.

## Nova camada de UI

```text
ui/
  tokens.css
  shell.css
  components.css
  pages.css
  games.css
  responsive.css
  icon-system.js
```

A camada v7 é carregada depois dos estilos legados e fica isolada por `body.tdb-v7`, preservando a compatibilidade funcional enquanto substitui a composição visual.

## Artes

Cada experiência ganhou arte vetorial própria em `assets/v7/`:

- Truco
- Blackjack
- Xadrez
- Lounge

## Áreas redesenhadas

Login, navegação, Home, navegador de salas, sala de espera, Amigos, Perfil, Configurações, modais, notificações, Truco, Xadrez, Blackjack, TDB Lounge e painel administrativo.

## Compatibilidade

- Supabase preservado
- multiplayer preservado
- favoritos e playlists preservados
- screen share preservado
- nenhuma migração SQL nova
- versão de API/health: `7.0.0`
