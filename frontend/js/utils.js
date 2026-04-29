/**
 * utils.js
 * Contains shared utility functions used across the frontend.
 */

/**
 * Format a date string or Date object to a readable string format.
 * Format: "Oct 24, 2026"
 * 
 * @param {string|Date} date - The date to format.
 * @returns {string} - Formatted date string.
 */
export function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(d);
}

/**
 * Format a number to Philippine Peso currency format.
 * Format: "₱ 1,234.56"
 * 
 * @param {number|string} amount - The amount to format.
 * @returns {string} - Formatted currency string.
 */
export function formatCurrency(amount) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount)) return '₱ 0.00';

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numericAmount);
}

/**
 * Display a floating toast notification.
 * 
 * @param {string} message - The text message to display.
 * @param {string} type - 'success', 'error', 'warning', or 'info'. Default is 'info'.
 */
export function showToast(message, type = 'info') {
  // Check if a toast container already exists, if not, create one
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    // Base styles for the container (fixed bottom-right or top-right)
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      zIndex: '9999'
    });
    document.body.appendChild(container);
  }

  // Create the toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Base styles for the toast
  let backgroundColor = '#3b82f6'; // info (blue)
  if (type === 'success') backgroundColor = '#10b981'; // green
  if (type === 'error') backgroundColor = '#ef4444'; // red
  if (type === 'warning') backgroundColor = '#f59e0b'; // amber

  Object.assign(toast.style, {
    minWidth: '250px',
    padding: '12px 20px',
    borderRadius: '8px',
    backgroundColor: backgroundColor,
    color: '#ffffff',
    fontSize: '0.9rem',
    fontWeight: '500',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    opacity: '0',
    transform: 'translateY(20px)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer'
  });

  // Allow clicking to dismiss early
  toast.onclick = () => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  };

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Auto remove after 3 seconds
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => {
        if (document.body.contains(toast)) {
          toast.remove();
        }
      }, 300);
    }
  }, 3000);
}
