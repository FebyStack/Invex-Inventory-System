const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const locationController = require('../controllers/locationController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

router.get('/', asyncHandler(locationController.getAllLocations));
router.get('/:id', asyncHandler(locationController.getLocationById));
router.post('/', authorize('admin'), asyncHandler(locationController.createLocation));
router.put('/:id', asyncHandler(locationController.updateLocation));
router.delete('/:id', authorize('admin'), asyncHandler(locationController.deleteLocation));

module.exports = router;
