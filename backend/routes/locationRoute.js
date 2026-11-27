const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const locationController = require('../controllers/locationController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

router.get('/', asyncHandler(locationController.getAllLocations));
router.get('/summary', asyncHandler(locationController.getSummary));
router.get('/inventory-matrix', asyncHandler(locationController.getInventoryMatrix));
router.post('/import-stock', authorize('super_admin'), asyncHandler(locationController.importStock));
router.get('/:id', asyncHandler(locationController.getLocationById));
router.post('/', authorize('super_admin'), asyncHandler(locationController.createLocation));
router.put('/:id', authorize('super_admin'), asyncHandler(locationController.updateLocation));
router.delete('/:id', authorize('super_admin'), asyncHandler(locationController.deleteLocation));

module.exports = router;
