const { createService } = require('../../shared/createService');

const { app, meta } = createService('CAM');
app.listen(meta.port, () => {
  console.log(`[CAM] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
