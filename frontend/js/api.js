/**
 * api.js
 * A centralized wrapper around the native browser fetch() API.
 * Automatically attaches the JWT authorization header to every request.
 * Handles global API errors (like 401 Unauthorized for expired tokens).
 */

const API_BASE_URL = '/api';

/**
 * Perform an API request.
 * 
 * @param {string} endpoint - The API endpoint (e.g., '/batches' or '/products')
 * @param {Object} options - Standard fetch options (method, headers, body, etc.)
 * @returns {Promise<Object>} - Resolves to the parsed JSON response body.
 */
export async function fetchApi(endpoint, options = {}) {
  // Ensure we have a base options object
  const fetchOptions = { ...options };

  // Set default headers
  fetchOptions.headers = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers || {})
  };

  // Automatically attach the JWT token if present in sessionStorage
  const token = sessionStorage.getItem('token');
  if (token) {
    fetchOptions.headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    // Make the request to the combined URL
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

    // If unauthorized (token missing or expired), force logout
    if (response.status === 401) {
      console.warn('Unauthorized request. Token may be expired. Logging out.');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      window.location.href = '/login.html';
      return;
    }

    // Parse the JSON response
    const data = await response.json();

    // If the server explicitly returned success: false, throw an error
    if (!response.ok || data.success === false) {
      throw new Error(data.message || `API Error: ${response.statusText}`);
    }

    return data;
  } catch (error) {
    console.error(`fetchApi Error [${options.method || 'GET'} ${endpoint}]:`, error);
    throw error;
  }
}
