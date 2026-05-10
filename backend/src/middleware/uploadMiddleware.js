const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed MIME types and the extensions they may carry.
// Used by the file filter to reject extension/MIME mismatches.
const MIME_EXT_MAP = {
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.csv', '.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

const SAFE_EXT = /^\.[a-z0-9]{1,5}$/i;

// Cryptographically random filenames so users cannot guess upload URLs
// or collide on Date.now() under load.
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const ext = SAFE_EXT.test(rawExt) ? rawExt : '';
    cb(null, `${file.fieldname}-${crypto.randomUUID()}${ext}`);
  },
});

// File filter for CSV and XLSX — both MIME and extension must agree.
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = MIME_EXT_MAP[file.mimetype];

  if (allowed && allowed.includes(ext)) {
    return cb(null, true);
  }

  // Some browsers report octet-stream for .xlsx — accept by extension as
  // a last resort, but only for the safe spreadsheet extensions.
  if (file.mimetype === 'application/octet-stream' && ['.csv', '.xlsx'].includes(ext)) {
    return cb(null, true);
  }

  return cb(new Error('Only .csv and .xlsx files are allowed.'), false);
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: fileFilter,
});

module.exports = upload;
