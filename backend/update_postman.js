const fs = require('fs');
const path = require('path');

const collPath = path.join(__dirname, '..', 'postman', 'Invex_Collection.json');
const coll = JSON.parse(fs.readFileSync(collPath, 'utf8'));

const locationsFolder = {
  name: "Locations",
  description: "CRUD operations for Locations module",
  item: [
    {
      name: "GET All Locations (200)",
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "pm.test('Status is 200', () => pm.response.to.have.status(200));",
              "pm.test('Returns array', () => { pm.expect(pm.response.json().data).to.be.an('array'); });"
            ]
          }
        }
      ],
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/locations", host: ["{{baseUrl}}"], path: ["locations"] }
      }
    },
    {
      name: "POST Create Location (201)",
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "pm.test('Status is 201', () => pm.response.to.have.status(201));",
              "const res = pm.response.json();",
              "pm.environment.set('locationId', res.data.id);"
            ]
          }
        }
      ],
      request: {
        method: "POST",
        header: [
          { key: "Content-Type", value: "application/json" },
          { key: "Authorization", value: "Bearer {{adminToken}}" }
        ],
        body: {
          mode: "raw",
          raw: "{\n  \"name\": \"Main Warehouse\",\n  \"code\": \"WH-MAIN\",\n  \"address_line\": \"123 Storage Rd\",\n  \"type\": \"warehouse\"\n}"
        },
        url: { raw: "{{baseUrl}}/locations", host: ["{{baseUrl}}"], path: ["locations"] }
      }
    },
    {
      name: "GET Location By ID (200)",
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: ["pm.test('Status is 200', () => pm.response.to.have.status(200));"]
          }
        }
      ],
      request: {
        method: "GET",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/locations/{{locationId}}", host: ["{{baseUrl}}"], path: ["locations", "{{locationId}}"] }
      }
    },
    {
      name: "PUT Update Location (200)",
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: ["pm.test('Status is 200', () => pm.response.to.have.status(200));"]
          }
        }
      ],
      request: {
        method: "PUT",
        header: [
          { key: "Content-Type", value: "application/json" },
          { key: "Authorization", value: "Bearer {{adminToken}}" }
        ],
        body: {
          mode: "raw",
          raw: "{\n  \"name\": \"Updated Warehouse\"\n}"
        },
        url: { raw: "{{baseUrl}}/locations/{{locationId}}", host: ["{{baseUrl}}"], path: ["locations", "{{locationId}}"] }
      }
    },
    {
      name: "DELETE Location (200)",
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: ["pm.test('Status is 200', () => pm.response.to.have.status(200));"]
          }
        }
      ],
      request: {
        method: "DELETE",
        header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
        url: { raw: "{{baseUrl}}/locations/{{locationId}}", host: ["{{baseUrl}}"], path: ["locations", "{{locationId}}"] }
      }
    }
  ]
};

// Check if Locations already exists
const existingIdx = coll.item.findIndex(i => i.name === 'Locations');
if (existingIdx >= 0) {
  coll.item[existingIdx] = locationsFolder;
} else {
  coll.item.push(locationsFolder);
}

fs.writeFileSync(collPath, JSON.stringify(coll, null, 2));
console.log('Postman collection updated with Locations folder.');
