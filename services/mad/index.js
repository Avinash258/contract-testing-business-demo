const { createService } = require('../../shared/createService');

const { app, meta } = createService('MAD');
app.listen(meta.port, () => {
  console.log(`[MAD] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
