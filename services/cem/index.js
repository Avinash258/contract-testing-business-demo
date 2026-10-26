const { createService } = require('../../shared/createService');

const { app, meta } = createService('CEM');
app.listen(meta.port, () => {
  console.log(`[CEM] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
