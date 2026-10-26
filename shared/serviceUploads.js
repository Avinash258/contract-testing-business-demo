const multer = require('multer');
const filing = require('./filingEngine');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /\.xlsx$/i.test(file.originalname) || /spreadsheetml/i.test(file.mimetype);
    cb(ok ? null : new Error('Only .xlsx Excel files are supported'), ok);
  },
});

function attachExcelUpload(app, moduleName) {
  const importers = {
    CEM: filing.importCemExcel,
    MAD: filing.importMadExcel,
    CAM: filing.importCamExcel,
  };
  const importer = importers[moduleName];
  if (!importer) return;

  app.post('/upload', upload.single('file'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Missing file field "file" (.xlsx)' });
      const snapshot = importer(req.file.buffer, req.file.originalname);
      res.json({
        ok: true,
        module: moduleName,
        service: moduleName,
        fileName: req.file.originalname,
        snapshot,
      });
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
  });
}

module.exports = { attachExcelUpload, upload };
