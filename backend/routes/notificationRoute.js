const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/read-all', ctrl.markAllRead);
router.post('/scan', authorize('admin'), ctrl.triggerScan);
router.post('/:id/read', ctrl.markRead);

module.exports = router;
