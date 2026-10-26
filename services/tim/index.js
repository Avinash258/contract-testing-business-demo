const { createService } = require('../../shared/createService');

const { app, meta } = createService('TAX');
app.listen(meta.port, () => {
  console.log(`[TAX] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
