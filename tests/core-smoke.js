
/*
  Manual/CI-friendly smoke tests.
  They do not start automatically in the app.
  Run in DevTools after loading the app:
      runTDBCoreSmokeTests()
*/
window.runTDBCoreSmokeTests = function () {
  const results = [];
  const assert = (name, condition) => {
    results.push({ name, ok: !!condition });
    if (!condition) console.error('[FAIL]', name);
    else console.log('[OK]', name);
  };

  assert('TDBCore existe', !!window.TDBCore);
  assert('Storage adapter existe', !!window.TDBCore?.storage);
  assert('Auth adapter existe', !!window.TDBCore?.auth);
  assert('Room adapter existe', !!window.TDBCore?.rooms);
  assert('Realtime adapter existe', !!window.TDBCore?.realtime);
  assert('Action bus existe', !!window.TDBCore?.actions);

  const registry = window.TDBGameRegistry;
  assert('Truco registrado', registry?.truco?.key === 'truco');
  assert('Xadrez ainda apenas planejado', registry?.chess?.status === 'planned');

  console.table(results);
  return results;
};
