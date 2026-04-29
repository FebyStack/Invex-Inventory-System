const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const supplierController = require('../controllers/supplierController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

router.get('/', asyncHandler(supplierController.getAllSuppliers));
router.get('/:id', asyncHandler(supplierController.getSupplierById));
router.post('/', authorize('admin'), asyncHandler(supplierController.createSupplier));
router.put('/:id', authorize('admin'), asyncHandler(supplierController.updateSupplier));
router.delete('/:id', authorize('admin'), asyncHandler(supplierController.deleteSupplier));

module.exports = router;
