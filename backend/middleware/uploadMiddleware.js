const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const config = require('../src/config/env');

// Map allowed MIME types to the file extensions they may use.
// Used by the file filter to reject files whose extension doesn't match
// the declared content type (a basic anti-spoof check).
const MIME_EXT_MAP = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.csv', '.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

const SAFE_EXT = /^\.[a-z0-9]{1,5}$/i;

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', config.upload.dir));
  },
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const ext = SAFE_EXT.test(rawExt) ? rawExt : '';
    cb(null, `${file.fieldname}-${crypto.randomUUID()}${ext}`);
  },
});

// File filter — allow images and spreadsheets, and require the extension
// to match the declared MIME type.
const fileFilter = (req, file, cb) => {
  const allowedExtensions = MIME_EXT_MAP[file.mimetype];
  if (!allowedExtensions) {
    return cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return cb(new Error('File extension does not match its content type.'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxFileSize },
});

module.exports = { upload };
