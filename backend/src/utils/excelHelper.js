const ExcelJS = require('exceljs');

/**
 * Parse an Excel file into an array of objects
 * @param {string} filePath - Path to the Excel file
 * @returns {Promise<Array>} Array of parsed objects
 */
const parseExcel = async (filePath) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0]; // Get first worksheet
  if (!worksheet) {
    throw new Error('No worksheet found in the Excel file');
  }

  const results = [];
  let headers = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      // Assuming first row is headers
      row.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value;
      });
    } else {
      const rowData = {};
      row.eachCell((cell, colNumber) => {
        // Skip if there's no header for this column
        if (headers[colNumber]) {
          rowData[headers[colNumber]] = cell.value;
        }
      });
      // Ensure empty cells are at least represented if headers exist
      headers.forEach((header, colNumber) => {
          if(header && rowData[header] === undefined) {
              rowData[header] = null;
          }
      });
      results.push(rowData);
    }
  });

  return results;
};

/**
 * Convert an array of objects to an Excel workbook buffer
 * @param {Array} data - Array of objects
 * @returns {Promise<Buffer>} Excel file buffer
 */
const toExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Data');

  if (data && data.length > 0) {
    // Generate columns based on the keys of the first object
    const columns = Object.keys(data[0]).map((key) => ({
      header: key,
      key: key,
      width: 20,
    }));
    worksheet.columns = columns;

    // Add rows
    data.forEach((item) => {
      worksheet.addRow(item);
    });
  }

  return await workbook.xlsx.writeBuffer();
};

module.exports = {
  parseExcel,
  toExcel,
};
