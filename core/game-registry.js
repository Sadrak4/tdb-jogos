
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
      status: 'playable',
      prefix: 'BLJ',
      minPlayers: 1,
      maxPlayers: 3,
      modes: [1, 2, 3]
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
      name: 'TDB Lounge',
      status: 'playable',
      prefix: 'MUS',
      minPlayers: 1,
      maxPlayers: 20,
      modes: ['shared-room']
    }
  });
})();
