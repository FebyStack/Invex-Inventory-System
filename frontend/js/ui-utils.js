/**
 * ui-utils.js — High-fidelity custom dialogs for Invex
 */
(function() {
  'use strict';

  /**
   * showConfirm({ title, text, confirmText, cancelText, type })
   * Returns a Promise resolving to true/false.
   */
  window.showConfirm = function({ title = 'Confirm Action', text = '', confirmText = 'OK', cancelText = 'Cancel', type = 'info' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'custom-modal-overlay';
      
      overlay.innerHTML = `
        <div class="custom-modal-card type-${type}">
          <div class="custom-modal-body">
            <div class="custom-modal-title">
              ${type === 'danger' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' : ''}
              ${title}
            </div>
            <div class="custom-modal-text">${text}</div>
          </div>
          <div class="custom-modal-footer">
            <button type="button" class="btn btn-ghost cancel-btn">${cancelText}</button>
            <button type="button" class="btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'} confirm-btn">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Force reflow for animation
      overlay.offsetHeight;
      overlay.classList.add('open');

      const close = (result) => {
        overlay.classList.remove('open');
        setTimeout(() => {
          overlay.remove();
          resolve(result);
        }, 250);
      };

      overlay.querySelector('.cancel-btn').onclick = () => close(false);
      overlay.querySelector('.confirm-btn').onclick = () => close(true);
      overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    });
  };

  /**
   * showAlert({ title, text, btnText, type })
   */
  window.showAlert = function({ title = 'Alert', text = '', btnText = 'Close', type = 'info' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'custom-modal-overlay';
      
      overlay.innerHTML = `
        <div class="custom-modal-card type-${type}">
          <div class="custom-modal-body">
            <div class="custom-modal-title">
              ${type === 'danger' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' : ''}
              ${title}
            </div>
            <div class="custom-modal-text">${text}</div>
          </div>
          <div class="custom-modal-footer">
            <button type="button" class="btn btn-primary close-btn">${btnText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      overlay.offsetHeight;
      overlay.classList.add('open');

      const close = () => {
        overlay.classList.remove('open');
        setTimeout(() => {
          overlay.remove();
          resolve();
        }, 250);
      };

      overlay.querySelector('.close-btn').onclick = close;
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
    });
  };

})();
