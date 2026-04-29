const fs = require('fs');
const path = require('path');

const collPath = path.join(__dirname, '..', '..', 'postman', 'Invex_Collection.json');
let coll;
try {
  coll = JSON.parse(fs.readFileSync(collPath, 'utf8'));
} catch (err) {
  console.error('Could not read postman collection', err);
  process.exit(1);
}

const importExportFolder = {
  name: "Import/Export",
  description: "Bulk data operations",
  item: [
    {
      name: "POST Import Products",
      request: {
        method: "POST",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        body: {
          mode: "formdata",
          formdata: [
            { key: "file", type: "file", src: "" }
          ]
        },
        url: { raw: "{{baseUrl}}/import/products", host: ["{{baseUrl}}"], path: ["import", "products"] }
      }
    },
    {
      name: "GET Export Products (CSV)",
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/export/products?format=csv", host: ["{{baseUrl}}"], path: ["export", "products"], query: [{ key: "format", value: "csv" }] }
      }
    },
    {
      name: "GET Export Stock Report",
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/export/stock-report?format=csv", host: ["{{baseUrl}}"], path: ["export", "stock-report"], query: [{ key: "format", value: "csv" }] }
      }
    },
    {
      name: "GET Export Movement Log",
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/export/movement-log?format=csv", host: ["{{baseUrl}}"], path: ["export", "movement-log"], query: [{ key: "format", value: "csv" }] }
      }
    }
  ]
};

const reportsFolder = {
  name: "Reports",
  description: "Dashboard and Analytics endpoints",
  item: [
    {
      name: "GET Dashboard Data",
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/reports/dashboard", host: ["{{baseUrl}}"], path: ["reports", "dashboard"] }
      }
    },
    {
      name: "GET Low Stock Report",
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/reports/low-stock", host: ["{{baseUrl}}"], path: ["reports", "low-stock"] }
      }
    },
    {
      name: "GET Expiring Batches",
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/reports/expiring?days=30", host: ["{{baseUrl}}"], path: ["reports", "expiring"], query: [{ key: "days", value: "30" }] }
      }
    },
    {
      name: "GET Stock Summary",
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/reports/stock-summary", host: ["{{baseUrl}}"], path: ["reports", "stock-summary"] }
      }
    },
    {
      name: "GET Movement Log (Report)",
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/reports/movement-log?limit=100&offset=0", host: ["{{baseUrl}}"], path: ["reports", "movement-log"], query: [{ key: "limit", value: "100" }, { key: "offset", value: "0" }] }
      }
    }
  ]
};

const mergeFolder = (folder) => {
  const existingIdx = coll.item.findIndex(i => i.name === folder.name);
  if (existingIdx >= 0) {
    coll.item[existingIdx] = folder;
  } else {
    coll.item.push(folder);
  }
};

mergeFolder(importExportFolder);
mergeFolder(reportsFolder);

fs.writeFileSync(collPath, JSON.stringify(coll, null, 2));
console.log('Postman collection updated with Import/Export and Reports endpoints.');
