/**
 * Invex Audit Logs Client Controller
 * Author: Lev
 * Connects to GET /api/audit-logs with filtering, pagination, and JSON state inspection.
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  let currentPage = 0;
  const pageSize = 25;
  let totalRecords = 0;
  let auditRecords = [];

  // DOM elements
  const tableBody = document.getElementById('audit-table-body');
  const pageInfo = document.getElementById('page-info');
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');

  const filterTable = document.getElementById('filter-table');
  const filterAction = document.getElementById('filter-action');
  const filterStartDate = document.getElementById('filter-start-date');
  const filterEndDate = document.getElementById('filter-end-date');
  const btnApply = document.getElementById('btn-apply-filters');
  const btnReset = document.getElementById('btn-reset-filters');

  // Modal elements
  const diffModal = document.getElementById('diff-modal');
  const diffModalClose = document.getElementById('diff-modal-close');
  const diffModalTitle = document.getElementById('diff-modal-title');
  const diffOldJson = document.getElementById('diff-old-json');
  const diffNewJson = document.getElementById('diff-new-json');

  // Auth & Token check
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  let currentUser = null;
  try {
    currentUser = userJson ? JSON.parse(userJson) : null;
  } catch (e) {}

  // Check Role Authorization (Super Admin / Admin only)
  if (currentUser && currentUser.role && !['super_admin', 'admin'].includes(currentUser.role)) {
    alert('Access restricted: Only Super Admins can review immutable audit trails.');
    window.location.href = '/dashboard.html';
    return;
  }

  // Toast Notification helper
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  // Format Date Helper
  function formatTimestamp(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  // Fetch Audit Logs from Backend API
  async function fetchAuditLogs() {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Fetching records from PostgreSQL...
        </td>
      </tr>
    `;

    const params = new URLSearchParams({
      limit: pageSize,
      offset: currentPage * pageSize
    });

    if (filterTable.value) params.append('table_name', filterTable.value);
    if (filterAction.value) params.append('action', filterAction.value);
    if (filterStartDate.value) params.append('start_date', filterStartDate.value);
    if (filterEndDate.value) params.append('end_date', filterEndDate.value);

    try {
      const response = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          showToast('Unauthorized. Super admin access required.', 'error');
          return;
        }
        throw new Error(`Failed to load audit logs: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success) {
        auditRecords = result.data || [];
        totalRecords = result.count || 0;
        renderTable();
        updatePagination();
      }
    } catch (err) {
      console.error('Audit log fetch error:', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px; color: var(--accent-danger);">
            Failed to load audit logs. ${err.message}
          </td>
        </tr>
      `;
      showToast(err.message, 'error');
    }
  }

  // Render Table Rows
  function renderTable() {
    tableBody.innerHTML = '';

    if (auditRecords.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No audit records found matching criteria.
          </td>
        </tr>
      `;
      return;
    }

    auditRecords.forEach((record, index) => {
      const tr = document.createElement('tr');

      let actionBadgeClass = 'badge-insert';
      if (record.action === 'UPDATE') actionBadgeClass = 'badge-update';
      if (record.action === 'DELETE') actionBadgeClass = 'badge-delete';

      tr.innerHTML = `
        <td style="font-family: 'DM Mono', monospace; font-size: 0.85rem; color: var(--text-secondary);">
          ${formatTimestamp(record.changed_at)}
        </td>
        <td><span class="table-code">${record.table_name}</span></td>
        <td style="font-weight: 600; color: var(--text-primary);">${record.record_id ?? '—'}</td>
        <td><span class="badge ${actionBadgeClass}">${record.action}</span></td>
        <td>
          <div style="font-weight: 500;">${record.changed_by_name || 'System / Batch'}</div>
          ${record.changed_by ? `<div style="font-size: 0.75rem; color: var(--text-muted);">User ID: ${record.changed_by}</div>` : ''}
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-inspect" data-index="${index}" style="padding: 6px 12px; font-size: 0.8rem;">
            Inspect Diff
          </button>
        </td>
      `;

      tableBody.appendChild(tr);
    });

    // Attach click listeners to inspect buttons
    document.querySelectorAll('.btn-inspect').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        openDiffModal(auditRecords[idx]);
      });
    });
  }

  // Pagination Controller
  function updatePagination() {
    const startIdx = totalRecords === 0 ? 0 : currentPage * pageSize + 1;
    const endIdx = Math.min((currentPage + 1) * pageSize, totalRecords);

    pageInfo.textContent = `Showing ${startIdx}-${endIdx} of ${totalRecords} logs`;

    btnPrev.disabled = currentPage === 0;
    btnNext.disabled = endIdx >= totalRecords;
  }

  // Open JSON Diff Modal
  function openDiffModal(record) {
    if (!record) return;

    diffModalTitle.textContent = `Record Mutation: ${record.table_name} (ID: ${record.record_id || 'N/A'}) - ${record.action}`;

    // Format old_data JSON
    if (record.old_data && Object.keys(record.old_data).length > 0) {
      diffOldJson.textContent = JSON.stringify(record.old_data, null, 2);
    } else {
      diffOldJson.textContent = '// Prior state was NULL (Record was created via INSERT)';
    }

    // Format new_data JSON
    if (record.new_data && Object.keys(record.new_data).length > 0) {
      diffNewJson.textContent = JSON.stringify(record.new_data, null, 2);
    } else {
      diffNewJson.textContent = '// New state is NULL (Record was removed via DELETE)';
    }

    diffModal.classList.add('active');
  }

  // Close Modal handler
  diffModalClose.addEventListener('click', () => {
    diffModal.classList.remove('active');
  });

  diffModal.addEventListener('click', (e) => {
    if (e.target === diffModal) {
      diffModal.classList.remove('active');
    }
  });

  // Event Listeners for Filters & Pagination
  btnApply.addEventListener('click', () => {
    currentPage = 0;
    fetchAuditLogs();
  });

  btnReset.addEventListener('click', () => {
    filterTable.value = '';
    filterAction.value = '';
    filterStartDate.value = '';
    filterEndDate.value = '';
    currentPage = 0;
    fetchAuditLogs();
  });

  btnPrev.addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage--;
      fetchAuditLogs();
    }
  });

  btnNext.addEventListener('click', () => {
    if ((currentPage + 1) * pageSize < totalRecords) {
      currentPage++;
      fetchAuditLogs();
    }
  });

  // Initial Load
  fetchAuditLogs();
});
