const { createService } = require('../../shared/createService');

const { app, meta } = createService('A');
app.listen(meta.port, () => {
  console.log(`[A] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
