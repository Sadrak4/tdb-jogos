
(function () {
  window.TDBGameRegistry = Object.freeze({
    truco: {
      key: 'truco',
      name: 'Truco',
      status: 'playable',
      prefix: 'TRC',
      minPlayers: 2,
      maxPlayers: 4,
      modes: [2, 4]
    },
    blackjack: {
      key: 'blackjack',
      name: 'Blackjack',
      status: 'planned',
      prefix: 'BLJ',
      minPlayers: 1,
      maxPlayers: 5,
      modes: [1, 2, 3, 4, 5]
    },
    chess: {
      key: 'chess',
      name: 'Xadrez',
      status: 'playable',
      prefix: 'XDR',
      minPlayers: 2,
      maxPlayers: 2,
      modes: [2]
    },
    music: {
      key: 'music',
      name: 'TDB Music',
      status: 'playable',
      prefix: 'MUS',
      minPlayers: 1,
      maxPlayers: 20,
      modes: ['shared-room']
    }
  });
})();
