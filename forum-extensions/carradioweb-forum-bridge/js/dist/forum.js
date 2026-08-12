(function () {
  'use strict';

  // FoF Passport opens a popup by default. A full-page redirect is reliable
  // on mobile browsers and when popup blocking is enabled.
  document.addEventListener('click', function (event) {
    var target = event.target;
    var button = target && target.closest ? target.closest('.LogInButton--passport') : null;
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var baseUrl = (window.flarum && window.flarum.data && window.flarum.data.baseUrl) || window.location.origin;
    window.location.assign(String(baseUrl).replace(/\/$/, '') + '/auth/passport');
  }, true);
}());
