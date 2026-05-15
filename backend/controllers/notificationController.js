const notificationModel = require('../models/notificationModel');
const notificationService = require('../services/notificationService');
const realtimeService = require('../services/realtimeService');

exports.list = async (req, res, next) => {
  try {
    const items = await notificationModel.listActive(50);
    res.json({ success: true, count: items.length, data: items });
  } catch (err) {
    next(err);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    await notificationModel.markRead(req.params.id);
    realtimeService.broadcast({ type: 'notification:read', data: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.markAllRead = async (req, res, next) => {
  try {
    await notificationModel.markAllRead();
    realtimeService.broadcast({ type: 'notification:read-all' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// Manual scan trigger — useful for testing without waiting for the interval.
exports.triggerScan = async (req, res, next) => {
  try {
    const result = await notificationService.runScan({ silent: true });
    res.json({
      success: true,
      data: {
        active: result.findings.length,
        newlyCreated: result.newlyCreated.length,
        email: result.emailResult,
      },
    });
  } catch (err) {
    next(err);
  }
};
