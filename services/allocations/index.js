const { createService } = require('../../shared/createService');

const { app, meta } = createService('D');
app.listen(meta.port, () => {
  console.log(`[D] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
