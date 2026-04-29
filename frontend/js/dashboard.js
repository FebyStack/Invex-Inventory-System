document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  
  // If no token, redirect to login (assuming standard auth flow)
  // if (!token) {
  //   window.location.href = '/login.html';
  //   return;
  // }

  try {
    const response = await fetch('/api/reports/dashboard', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.error('Authentication failed');
        // window.location.href = '/login.html';
        return;
      }
      throw new Error('Failed to fetch dashboard data');
    }

    const json = await response.json();
    if (json.success && json.data) {
      const summary = json.data.summary;
      
      // Format currency
      const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(value);
      };

      // Format number
      const formatNumber = (value) => {
        return new Intl.NumberFormat('en-US').format(value);
      };

      // Update Summary Cards
      document.getElementById('total-products-stat').textContent = formatNumber(summary.totalProducts);
      document.getElementById('low-stock-stat').textContent = formatNumber(summary.lowStock);
      document.getElementById('total-value-stat').textContent = formatCurrency(summary.totalValue);
      document.getElementById('out-of-stock-stat').textContent = formatNumber(summary.outOfStock);

      // Update Recent Movements Table
      const tbody = document.getElementById('recent-movements-tbody');
      tbody.innerHTML = ''; // Clear existing
      
      const recentActivity = json.data.recentActivity || [];
      
      if (recentActivity.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" style="text-align: center; color: var(--text-secondary);">No recent movements found</td>`;
        tbody.appendChild(tr);
      } else {
        recentActivity.forEach(activity => {
          const tr = document.createElement('tr');
          
          const date = new Date(activity.movement_date);
          const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          
          let qtyColor = '';
          let qtySign = '';
          if (activity.quantity_change > 0) {
            qtyColor = 'var(--accent-success)';
            qtySign = '+';
          } else if (activity.quantity_change < 0) {
            qtyColor = 'var(--accent-danger)';
          }

          let statusBadge = '<span class="status-badge status-in-stock">Completed</span>';
          
          tr.innerHTML = `
            <td>${activity.product_name || 'Unknown'}</td>
            <td>${activity.source_type}</td>
            <td>${activity.performed_by || 'System'}</td>
            <td style="color: ${qtyColor}; font-weight: 500;">${qtySign}${activity.quantity_change}</td>
            <td>${dateString}</td>
            <td>${statusBadge}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  } catch (error) {
    console.error('Error loading dashboard:', error);
    // Optionally display error on screen
  }
});
