const { createService } = require('../../shared/createService');

const { app, meta } = createService('TIM');
app.listen(meta.port, () => {
  console.log(`[TIM] ${meta.name} listening on http://127.0.0.1:${meta.port}`);
});
