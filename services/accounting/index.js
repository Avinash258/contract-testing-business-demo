const { createService } = require('../../shared/createService');

const { app, meta } = createService('B');
app.listen(meta.port, () => {
  console.log(`[B] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
