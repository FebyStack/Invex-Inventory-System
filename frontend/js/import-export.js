/**
 * import-export.js
 * Handles drag-and-drop CSV/Excel import and export downloads.
 */
(function () {
  'use strict';

  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('browse-btn');
  const filePreview = document.getElementById('file-preview');
  const fileName = document.getElementById('file-name');
  const clearFileBtn = document.getElementById('clear-file-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const importResult = document.getElementById('import-result');

  let selectedFile = null;

  // Browse button
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Click on drop zone
  dropZone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      selectFile(fileInput.files[0]);
    }
  });

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      selectFile(e.dataTransfer.files[0]);
    }
  });

  function selectFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx'].includes(ext)) {
      alert('Only .csv and .xlsx files are accepted.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File exceeds 5MB limit.');
      return;
    }
    selectedFile = file;
    fileName.textContent = file.name;
    filePreview.style.display = 'flex';
    dropZone.style.display = 'none';
    uploadBtn.disabled = false;
    importResult.style.display = 'none';
  }

  clearFileBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    filePreview.style.display = 'none';
    dropZone.style.display = 'block';
    uploadBtn.disabled = true;
    importResult.style.display = 'none';
  });

  // Upload
  uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading…';

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/import/products', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      importResult.style.display = 'block';

      if (data.success) {
        importResult.innerHTML = `<div class="import-success">✓ ${data.message}</div>`;
      } else {
        let errorHtml = `<div class="import-errors"><h4>Import Failed</h4><p style="color:var(--fg-2);font-size:12px;margin-bottom:8px">${data.message}</p>`;
        if (data.errors && data.errors.length > 0) {
          errorHtml += '<ul>';
          data.errors.forEach(e => {
            errorHtml += `<li>Row ${e.row}: ${e.errors.join(', ')}</li>`;
          });
          errorHtml += '</ul>';
        }
        errorHtml += '</div>';
        importResult.innerHTML = errorHtml;
      }
    } catch (err) {
      importResult.style.display = 'block';
      importResult.innerHTML = `<div class="import-errors"><h4>Network Error</h4><p>Could not connect. Please try again.</p></div>`;
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload & Import';
    }
  });

  // Download Template
  const downloadTemplateBtn = document.getElementById('download-template-btn');
  if (downloadTemplateBtn) {
    downloadTemplateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const headers = ['sku', 'name', 'category_id', 'supplier_id', 'unit_price', 'reorder_level', 'track_expiry', 'unit_of_measure'];
      const rows = [
        ['PROD-001', 'Sample Product', '1', '1', '25.50', '10', 'false', 'pcs'],
        ['PROD-002', 'Expiry Tracked Item', '2', '1', '150.00', '5', 'true', 'box']
      ];
      
      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "invex_product_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  // Export download (globally accessible)
  window.downloadExport = function (type, format) {
    const url = `/api/export/${type}?format=${format}`;

    fetch(url, { headers })
      .then(res => {
        if (!res.ok) throw new Error('Export failed');
        return res.blob();
      })
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = `${type}.${format}`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(objUrl);
        a.remove();
      })
      .catch(err => {
        console.error('Export error:', err);
        alert('Export failed. Please try again.');
      });
  };
})();
