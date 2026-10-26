const { createService } = require('../../shared/createService');

const { app, meta } = createService('ACC');
app.listen(meta.port, () => {
  console.log(`[ACC] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
