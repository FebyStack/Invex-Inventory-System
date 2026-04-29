const locationModel = require('../models/locationModel');
const { logActivity } = require('../src/utils/logger');

exports.getAllLocations = async (req, res, next) => {
  try {
    const locations = await locationModel.getAllLocations();
    return res.json({ success: true, data: locations });
  } catch (err) {
    return next(err);
  }
};

exports.getLocationById = async (req, res, next) => {
  try {
    const location = await locationModel.getLocationById(req.params.id);

    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    return res.json({ success: true, data: location });
  } catch (err) {
    return next(err);
  }
};

exports.createLocation = async (req, res, next) => {
  try {
    const { name, code, address_line, barangay, city, province, postal_code, type } = req.body;

    if (!name || !code || !type) {
      return res.status(400).json({
        success: false,
        message: 'name, code, and type are required.',
      });
    }

    const location = await locationModel.createLocation({
      name,
      code,
      address_line,
      barangay,
      city,
      province,
      postal_code,
      type,
    });

    void logActivity(req.user.id, 'CREATE_LOCATION', 'locations', location.id, {
      name: location.name,
      code: location.code,
    });

    return res.status(201).json({ success: true, data: location });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A location with this code already exists.',
      });
    }
    return next(err);
  }
};

exports.updateLocation = async (req, res, next) => {
  try {
    const { name, code, address_line, barangay, city, province, postal_code, type } = req.body;

    const updated = await locationModel.updateLocation(req.params.id, {
      name,
      code,
      address_line,
      barangay,
      city,
      province,
      postal_code,
      type,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    void logActivity(req.user.id, 'UPDATE_LOCATION', 'locations', updated.id, {
      updatedFields: Object.keys(req.body),
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A location with this code already exists.',
      });
    }
    return next(err);
  }
};

exports.deleteLocation = async (req, res, next) => {
  try {
    const deleted = await locationModel.softDeleteLocation(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    void logActivity(req.user.id, 'DELETE_LOCATION', 'locations', deleted.id);

    return res.json({ success: true, message: 'Location deleted successfully.' });
  } catch (err) {
    return next(err);
  }
};
