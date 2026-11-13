// Loads Cloudflare Turnstile (the only third-party script) and renders it explicitly so the
// widget can use the compact size on very narrow phones. Turnstile adds the
// cf-turnstile-response field to the form itself.
(function () {
  'use strict';
  var el = document.getElementById('turnstile');
  if (!el) return;
  window.vllTurnstileReady = function () {
    if (!window.turnstile) return;
    var narrow = el.getBoundingClientRect().width < 300;
    window.turnstile.render(el, {
      sitekey: el.getAttribute('data-sitekey'),
      action: el.getAttribute('data-action') || 'sign',
      size: narrow ? 'compact' : 'flexible',
      theme: 'auto',
      'response-field-name': 'cf-turnstile-response',
    });
  };
  var s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=vllTurnstileReady';
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
})();
