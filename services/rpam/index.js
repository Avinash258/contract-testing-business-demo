const { createService } = require('../../shared/createService');

const { app, meta } = createService('RPAM');
app.listen(meta.port, () => {
  console.log(`[RPAM] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
