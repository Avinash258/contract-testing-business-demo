const { createService } = require('../../shared/createService');

const { app, meta } = createService('ALC');
app.listen(meta.port, () => {
  console.log(`[ALC] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
