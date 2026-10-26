const { createService } = require('../../shared/createService');

const { app, meta } = createService('FORMS');
app.listen(meta.port, () => {
  console.log(`[FORMS] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
