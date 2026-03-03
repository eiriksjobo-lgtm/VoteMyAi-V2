/**
 * Contact page — form submission
 */
(function () {
  'use strict';

  var _cleanup = [];

  function init() {
    var form = document.getElementById('contactForm');
    if (!form) return;

    function handleSubmit(e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var status = document.getElementById('contactStatus');

      btn.disabled = true;
      btn.textContent = 'Sending...';

      fetch(VMA.SUPABASE_URL + '/rest/v1/contact_messages', {
        method: 'POST',
        headers: {
          'apikey': VMA.SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: document.getElementById('contactName').value,
          email: document.getElementById('contactEmail').value,
          message: document.getElementById('contactMessage').value
        })
      }).then(function (res) {
        if (res.ok) {
          status.innerHTML = '<p style="color:#4ade80;margin-top:16px;">Message sent successfully!</p>';
          form.reset();
        } else {
          status.innerHTML = '<p style="color:#f87171;margin-top:16px;">Failed to send. Please try again.</p>';
        }
      }).catch(function () {
        status.innerHTML = '<p style="color:#f87171;margin-top:16px;">Network error. Please try again.</p>';
      }).finally(function () {
        btn.disabled = false;
        btn.textContent = 'Send Message';
      });
    }

    form.addEventListener('submit', handleSubmit);
    _cleanup.push(function () { form.removeEventListener('submit', handleSubmit); });
  }

  function cleanup() {
    _cleanup.forEach(function (fn) { fn(); });
    _cleanup = [];
  }

  VMA._pageCleanup = cleanup;
  init();
})();
