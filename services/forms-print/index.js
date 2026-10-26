const { createService } = require('../../shared/createService');

const { app, meta } = createService('DOC');
app.listen(meta.port, () => {
  console.log(`[DOC] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
