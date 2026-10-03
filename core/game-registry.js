(function () {
  window.TDBGameRegistry = Object.freeze({
    truco: { key:'truco', name:'Truco', status:'playable', prefix:'TRC', minPlayers:2, maxPlayers:4, modes:[2,4] },
    pool: { key:'pool', name:'Sinuca', status:'playable', prefix:'SNK', minPlayers:2, maxPlayers:2, modes:['8-ball'] },
    chess: { key:'chess', name:'Xadrez', status:'playable', prefix:'XDR', minPlayers:2, maxPlayers:2, modes:[2] },
    music: { key:'music', name:'TDB Lobby', status:'playable', prefix:'MUS', minPlayers:1, maxPlayers:20, modes:['shared-room'] },
    blackjack: { key:'blackjack', name:'Blackjack', status:'maintenance', prefix:'BLJ', minPlayers:1, maxPlayers:3, modes:[1,2,3] }
  });
})();
