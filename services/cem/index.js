const { createService } = require('../../shared/createService');

const { app, meta } = createService('CLM');
app.listen(meta.port, () => {
  console.log(`[CLM] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
