const { createService } = require('../../shared/createService');

const { app, meta } = createService('C');
app.listen(meta.port, () => {
  console.log(`[C] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
