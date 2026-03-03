/**
 * Login page — Google OAuth redirect
 */
(function () {
  'use strict';

  var _cleanup = [];

  function init() {
    // If already logged in, redirect
    if (VMA.currentUser) {
      var redirect = localStorage.getItem('login_redirect') || '/';
      localStorage.removeItem('login_redirect');
      VMARouter.navigate(redirect);
      return;
    }

    // Also check token directly (in case auth hasn't resolved yet)
    var token = localStorage.getItem('sb_token');
    if (token) {
      fetch(VMA.SUPABASE_URL + '/auth/v1/user', {
        headers: { 'Authorization': 'Bearer ' + token, 'apikey': VMA.SUPABASE_KEY }
      }).then(function (res) {
        if (res.ok) {
          var redirect = localStorage.getItem('login_redirect') || '/';
          localStorage.removeItem('login_redirect');
          VMARouter.navigate(redirect);
        }
      }).catch(function () {});
    }

    // Bind login button
    var btn = document.getElementById('googleLoginBtn');
    if (btn) {
      function handleLogin() {
        // Save where the user came from
        var urlParams = new URLSearchParams(window.location.search);
        var returnTo = urlParams.get('redirect') || '/';
        localStorage.setItem('login_redirect', returnTo);

        var redirectUrl = 'https://www.votemyai.com/';
        window.location.href = VMA.SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + redirectUrl;
      }

      btn.addEventListener('click', handleLogin);
      _cleanup.push(function () { btn.removeEventListener('click', handleLogin); });
    }
  }

  function cleanup() {
    _cleanup.forEach(function (fn) { fn(); });
    _cleanup = [];
  }

  VMA._pageCleanup = cleanup;
  init();
})();
