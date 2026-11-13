// Marks the page as JS-capable and moves focus to the error summary after a failed submit.
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  function init() {
    var summary = document.getElementById('error-summary');
    if (summary) {
      summary.focus();
      summary.addEventListener('click', function (e) {
        var link = e.target.closest('a[href^="#"]');
        if (!link) return;
        var target = document.getElementById(link.getAttribute('href').slice(1));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ block: 'center' });
          target.focus();
        }
      });
    }
    // Prevent double submission (slow phones, impatient taps).
    var form = document.querySelector('form.sign-form');
    if (form) {
      form.addEventListener('submit', function () {
        var btn = form.querySelector('button[type="submit"]');
        if (btn) {
          window.setTimeout(function () { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }, 0);
        }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
