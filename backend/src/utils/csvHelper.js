const fs = require('fs');
const Papa = require('papaparse');

/**
 * Parse a CSV file into an array of objects
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<Array>} Array of parsed objects
 */
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true, // Automatically converts numbers/booleans
      complete: (results) => {
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
};

/**
 * Convert an array of objects to CSV format
 * @param {Array} data - Array of objects
 * @returns {string} CSV formatted string
 */
const toCSV = (data) => {
  return Papa.unparse(data);
};

module.exports = {
  parseCSV,
  toCSV,
};
