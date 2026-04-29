const express = require('express');
const cors = require('cors');
const path = require('path');
const { query } = require('./config/db');

// Import route modules
const authRoutes = require('../routes/authRoute');
const productRoutes = require('../routes/productRoute');
const categoryRoutes = require('../routes/categoryRoute');
const supplierRoutes = require('../routes/supplierRoute');
const orderRoutes = require('../routes/orderRoute');
const batchRoutes = require('../routes/batchRoute');
const adjustmentRoutes = require('../routes/adjustmentRoute');
const locationRoutes = require('../routes/locationRoute');
const reportRoutes = require('../routes/reportRoute');
const importExportRoutes = require('../routes/importExportRoute');
const userRoutes = require('../routes/userRoute');
const reasonCodeRoutes = require('../routes/reasonCodeRoute');

// Import middleware
const { errorHandler, asyncHandler } = require('../middleware/errorMiddleware');

const app = express();

// ---------------------
// Global Middleware
// ---------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------
// Static Files
// ---------------------
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.static(path.join(__dirname, '..', '..', 'frontend', 'public')));
app.use('/css', express.static(path.join(__dirname, '..', '..', 'frontend', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', '..', 'frontend', 'js')));
app.use('/components', express.static(path.join(__dirname, '..', '..', 'frontend', 'components')));
app.use('/assets', express.static(path.join(__dirname, '..', '..', 'frontend', 'assets')));

// ---------------------
// API Routes
// ---------------------
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/adjustments', adjustmentRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', importExportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reason-codes', reasonCodeRoutes);

// ---------------------
// Health Check
// ---------------------
app.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    await query('SELECT 1');

    res.json({
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
      name: 'Invex API',
      version: '1.0.0',
    });
  })
);

// ---------------------
// Error Handling
// ---------------------
app.use(errorHandler);

module.exports = app;
