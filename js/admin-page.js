/**
 * Admin page — dashboard with user/track/comment/message management
 * Ported from standalone admin.html into SPA module.
 */
(function () {
  'use strict';

  var _cleanup = [];

  // ─── State (scoped to IIFE) ───
  var PAGE_SIZE = 50;
  var adminPassword = '';
  var authUsers = [];
  var allTracks = [];
  var allComments = [];
  var allMessages = [];
  var userMap = {};
  var pages = { users: 1, tracks: 1, comments: 1, messages: 1 };
  var searchQuery = '';
  var searchDebounceTimer = null;

  // ─── Helpers ───

  function sanitize(str) {
    return VMA.sanitize(str);
  }

  function formatDate(d) {
    if (!d) return '\u2014';
    return new Date(d).toLocaleDateString('no-NO', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  /** Highlight matching text in search results */
  function hl(text) {
    if (!searchQuery || !text) return sanitize(text);
    var safe = sanitize(text);
    var q = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp('(' + q + ')', 'gi'), '<span class="search-match">$1</span>');
  }

  function showStatus(id, msg, type) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = 'status ' + type;
    if (type === 'success') {
      setTimeout(function () { if (el) el.style.display = 'none'; }, 3000);
    }
  }

  function headers() {
    return {
      'apikey': VMA.SUPABASE_KEY,
      'Authorization': 'Bearer ' + VMA.SUPABASE_KEY,
      'Content-Type': 'application/json'
    };
  }

  // ─── Pagination builder ───

  function buildPagination(tab, totalItems) {
    var totalPages = Math.ceil(totalItems / PAGE_SIZE);
    if (totalPages <= 1) return '';
    var current = pages[tab];
    var html = '<div class="pagination">';
    html += '<button ' + (current <= 1 ? 'disabled' : '') + ' data-page-action="prev" data-page-tab="' + tab + '" data-page-num="' + (current - 1) + '">\u2190 Prev</button>';
    for (var p = 1; p <= totalPages; p++) {
      if (totalPages > 7 && p > 2 && p < totalPages - 1 && Math.abs(p - current) > 1) {
        if (p === 3 || p === totalPages - 2) html += '<span class="page-info">\u2026</span>';
        continue;
      }
      html += '<button class="' + (p === current ? 'active' : '') + '" data-page-action="go" data-page-tab="' + tab + '" data-page-num="' + p + '">' + p + '</button>';
    }
    html += '<button ' + (current >= totalPages ? 'disabled' : '') + ' data-page-action="next" data-page-tab="' + tab + '" data-page-num="' + (current + 1) + '">Next \u2192</button>';
    html += '<span class="page-info">' + totalItems + ' total</span>';
    html += '</div>';
    return html;
  }

  function goPage(tab, page) {
    pages[tab] = page;
    renderTab(tab);
    var tabEl = document.getElementById('tab-' + tab);
    if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Tab switching ───

  function switchTab(tab) {
    var tabBtns = document.querySelectorAll('#adminTabs .tab');
    var tabContents = document.querySelectorAll('.tab-content');
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].classList.remove('active');
      if (tabBtns[i].getAttribute('data-tab') === tab) {
        tabBtns[i].classList.add('active');
      }
    }
    for (var j = 0; j < tabContents.length; j++) {
      tabContents[j].classList.remove('active');
    }
    var activeContent = document.getElementById('tab-' + tab);
    if (activeContent) activeContent.classList.add('active');
    renderTab(tab);
  }

  // ─── Login ───

  function login() {
    var input = document.getElementById('adminPasswordInput');
    if (!input) return;
    adminPassword = input.value;

    fetch(VMA.SUPABASE_URL + '/functions/v1/admin-users', {
      headers: { 'x-admin-password': adminPassword }
    }).then(function (res) {
      if (!res.ok) {
        showStatus('loginStatus', 'Wrong password', 'error');
        throw new Error('auth-fail');
      }
      return res.json();
    }).then(function (data) {
      authUsers = data.users || [];
      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('adminPanel').style.display = 'block';
      loadData();
    }).catch(function (e) {
      if (e.message !== 'auth-fail') {
        showStatus('loginStatus', 'Could not connect', 'error');
      }
    });
  }

  // ─── User map ───

  function rebuildUserMap() {
    userMap = {};
    authUsers.forEach(function (u) {
      userMap[u.id] = {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        created_at: u.created_at,
        trackCount: 0,
        ratingCount: 0,
        commentCount: 0
      };
    });
    allTracks.forEach(function (t) {
      if (t.user_id && userMap[t.user_id]) userMap[t.user_id].trackCount++;
    });
    allComments.forEach(function (c) {
      if (c.user_id && userMap[c.user_id]) userMap[c.user_id].commentCount++;
    });
  }

  // ─── Load all data ───

  function loadData() {
    // Refresh auth users list
    var authPromise = fetch(VMA.SUPABASE_URL + '/functions/v1/admin-users', {
      headers: { 'x-admin-password': adminPassword }
    }).then(function (res) {
      if (res.ok) return res.json();
      return null;
    }).then(function (data) {
      if (data && data.users) authUsers = data.users;
    }).catch(function (e) {
      console.warn('Could not refresh auth users:', e);
    });

    authPromise.then(function () {
      var TRACK_FIELDS = 'id,title,user_id,tool,genre,avg_rating,rating_count,created_at';

      // Paginated fetch helper for large tables
      function fetchAll(endpoint) {
        var result = [];
        var off = 0;
        function fetchBatch() {
          return fetch(endpoint + '&offset=' + off + '&limit=1000', {
            headers: headers()
          }).then(function (res) {
            return res.json();
          }).then(function (batch) {
            result = result.concat(batch);
            if (batch.length < 1000) return result;
            off += 1000;
            return fetchBatch();
          });
        }
        return fetchBatch();
      }

      var tracksPromise = fetchAll(
        VMA.SUPABASE_URL + '/rest/v1/tracks?select=' + TRACK_FIELDS + '&order=created_at.desc'
      );
      var commentsPromise = fetchAll(
        VMA.SUPABASE_URL + '/rest/v1/comments?select=id,content,author_name,user_id,track_id,created_at,tracks(title)&order=created_at.desc'
      );
      var messagesPromise = fetch(
        VMA.SUPABASE_URL + '/rest/v1/contact_messages?select=*&order=created_at.desc',
        { headers: headers() }
      ).then(function (res) { return res.json(); });

      return Promise.all([tracksPromise, commentsPromise, messagesPromise]);
    }).then(function (results) {
      allTracks = results[0];
      allComments = results[1];
      allMessages = results[2];

      rebuildUserMap();

      // Compute stats
      var users = Object.values(userMap);
      var totalRatings = allTracks.reduce(function (s, t) { return s + (t.rating_count || 0); }, 0);
      var ratedTracks = allTracks.filter(function (t) { return t.rating_count > 0; });
      var avgRating = ratedTracks.length
        ? (ratedTracks.reduce(function (s, t) { return s + (parseFloat(t.avg_rating) || 0); }, 0) / ratedTracks.length).toFixed(1)
        : '\u2014';

      var el;
      el = document.getElementById('sTracks');  if (el) el.textContent = allTracks.length;
      el = document.getElementById('sRatings'); if (el) el.textContent = totalRatings;
      el = document.getElementById('sComments'); if (el) el.textContent = allComments.length;
      el = document.getElementById('sUsers');   if (el) el.textContent = users.length;
      el = document.getElementById('sMessages'); if (el) el.textContent = allMessages.length;
      el = document.getElementById('sAvg');     if (el) el.textContent = avgRating;

      renderTab('users');
    }).catch(function (err) {
      console.error('Load error:', err);
      showStatus('adminStatus', 'Failed to load data: ' + err.message, 'error');
    });
  }

  // ─── Render tab content ───

  function renderTab(tab) {
    var container = document.getElementById('tab-' + tab);
    if (!container) return;
    var page = pages[tab];
    var q = searchQuery;

    if (tab === 'users') {
      var users = Object.values(userMap);
      users.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      if (q) users = users.filter(function (u) {
        return (u.name || '').toLowerCase().indexOf(q) !== -1 ||
               (u.email || '').toLowerCase().indexOf(q) !== -1;
      });
      var total = users.length;
      var start = (page - 1) * PAGE_SIZE;
      var slice = users.slice(start, start + PAGE_SIZE);
      var warn = !q && authUsers.length >= 50 && authUsers.length % 50 === 0;

      container.innerHTML = '<div class="table-header">' +
        '<span class="table-header-left">' + total + ' ' + (q ? 'matching' : 'registered') + ' users</span>' +
        (warn ? '<span class="table-header-right">\u26a0\ufe0f Showing first ' + total + ' \u2014 update edge function for full list</span>' : '') +
        '</div><div class="table-wrap"><table>' +
        '<tr><th style="width:40px;">#</th><th>User</th><th>Email</th><th>Tracks</th><th>Comments</th><th>Joined</th><th>Actions</th></tr>' +
        (slice.length ? slice.map(function (u, idx) {
          var num = start + idx + 1;
          var avatarHtml = u.avatar
            ? '<img src="' + sanitize(u.avatar) + '" alt="">'
            : (u.name || u.email || '?').charAt(0).toUpperCase();
          return '<tr>' +
            '<td style="color:var(--muted);font-weight:600;font-size:0.75rem;">' + num + '</td>' +
            '<td><span class="user-badge"><span class="user-avatar">' + avatarHtml + '</span>' + hl(u.name || 'No name') + '</span></td>' +
            '<td class="text-email">' + hl(u.email) + '</td>' +
            '<td class="text-accent">' + u.trackCount + '</td>' +
            '<td>' + u.commentCount + '</td>' +
            '<td class="text-muted">' + formatDate(u.created_at) + '</td>' +
            '<td><button class="btn-delete" data-delete-action="user" data-delete-id="' + u.id + '">Delete</button></td>' +
            '</tr>';
        }).join('') : '<tr><td colspan="7" class="empty-state">' + (q ? 'No users matching "' + sanitize(searchQuery) + '"' : 'No users yet') + '</td></tr>') +
        '</table></div>' + buildPagination('users', total);
    }

    else if (tab === 'tracks') {
      var tracks = allTracks.slice();
      if (q) tracks = tracks.filter(function (t) {
        var owner = userMap[t.user_id];
        return (t.title || '').toLowerCase().indexOf(q) !== -1 ||
               (t.tool || '').toLowerCase().indexOf(q) !== -1 ||
               (t.genre || '').toLowerCase().indexOf(q) !== -1 ||
               ((owner ? (owner.name || owner.email || '') : '')).toLowerCase().indexOf(q) !== -1;
      });
      var total = tracks.length;
      var start = (page - 1) * PAGE_SIZE;
      var slice = tracks.slice(start, start + PAGE_SIZE);

      container.innerHTML = '<div class="table-header">' +
        '<span class="table-header-left">' + total + ' ' + (q ? 'matching' : '') + ' tracks</span>' +
        '</div><div class="table-wrap"><table>' +
        '<tr><th style="width:40px;">#</th><th>Title</th><th>Submitted By</th><th>Tool</th><th>Genre</th><th>Avg</th><th>Ratings</th><th>Submitted</th><th>Actions</th></tr>' +
        (slice.length ? slice.map(function (t, idx) {
          var num = start + idx + 1;
          var user = t.user_id && userMap[t.user_id] ? userMap[t.user_id] : null;
          var submitter = user ? hl(user.name || user.email || 'Unknown') : '<span class="text-muted">Unknown</span>';
          var avg = t.avg_rating ? parseFloat(t.avg_rating).toFixed(1) : '\u2014';
          return '<tr>' +
            '<td style="color:var(--muted);font-weight:600;font-size:0.75rem;">' + num + '</td>' +
            '<td><strong>' + hl(t.title) + '</strong></td>' +
            '<td class="text-sm">' + submitter + '</td>' +
            '<td>' + hl(t.tool) + '</td>' +
            '<td>' + hl(t.genre) + '</td>' +
            '<td class="text-accent">' + avg + '</td>' +
            '<td>' + (t.rating_count || 0) + '</td>' +
            '<td class="text-muted">' + formatDate(t.created_at) + '</td>' +
            '<td><button class="btn-delete" data-delete-action="track" data-delete-id="' + t.id + '">Delete</button></td>' +
            '</tr>';
        }).join('') : '<tr><td colspan="9" class="empty-state">' + (q ? 'No tracks matching "' + sanitize(searchQuery) + '"' : 'No tracks yet') + '</td></tr>') +
        '</table></div>' + buildPagination('tracks', total);
    }

    else if (tab === 'comments') {
      var comments = allComments.slice();
      if (q) comments = comments.filter(function (c) {
        return (c.content || '').toLowerCase().indexOf(q) !== -1 ||
               (c.author_name || '').toLowerCase().indexOf(q) !== -1 ||
               ((c.tracks && c.tracks.title) || '').toLowerCase().indexOf(q) !== -1;
      });
      var total = comments.length;
      var start = (page - 1) * PAGE_SIZE;
      var slice = comments.slice(start, start + PAGE_SIZE);

      container.innerHTML = '<div class="table-header">' +
        '<span class="table-header-left">' + total + ' ' + (q ? 'matching' : '') + ' comments</span>' +
        '</div><div class="table-wrap"><table>' +
        '<tr><th style="width:40px;">#</th><th>Track</th><th>Author</th><th>Email</th><th>Comment</th><th>Date</th><th>Actions</th></tr>' +
        (slice.length ? slice.map(function (c, idx) {
          var num = start + idx + 1;
          var user = c.user_id && userMap[c.user_id] ? userMap[c.user_id] : null;
          var email = user ? sanitize(user.email) : '<span class="text-muted">\u2014</span>';
          return '<tr>' +
            '<td style="color:var(--muted);font-weight:600;font-size:0.75rem;">' + num + '</td>' +
            '<td>' + hl((c.tracks && c.tracks.title) || 'Unknown') + '</td>' +
            '<td>' + hl(c.author_name || 'Anonymous') + '</td>' +
            '<td class="text-email text-sm">' + email + '</td>' +
            '<td>' + hl(c.content) + '</td>' +
            '<td class="text-muted">' + formatDate(c.created_at) + '</td>' +
            '<td><button class="btn-delete" data-delete-action="comment" data-delete-id="' + c.id + '">Delete</button></td>' +
            '</tr>';
        }).join('') : '<tr><td colspan="7" class="empty-state">' + (q ? 'No comments matching "' + sanitize(searchQuery) + '"' : 'No comments yet') + '</td></tr>') +
        '</table></div>' + buildPagination('comments', total);
    }

    else if (tab === 'messages') {
      var messages = allMessages.slice();
      if (q) messages = messages.filter(function (m) {
        return (m.name || '').toLowerCase().indexOf(q) !== -1 ||
               (m.email || '').toLowerCase().indexOf(q) !== -1 ||
               (m.message || '').toLowerCase().indexOf(q) !== -1;
      });
      var total = messages.length;
      var start = (page - 1) * PAGE_SIZE;
      var slice = messages.slice(start, start + PAGE_SIZE);

      container.innerHTML = '<div class="table-header">' +
        '<span class="table-header-left">' + total + ' ' + (q ? 'matching' : '') + ' messages</span>' +
        '</div><div class="table-wrap"><table>' +
        '<tr><th style="width:40px;">#</th><th>Name</th><th>Email</th><th>Message</th><th>Date</th><th>Actions</th></tr>' +
        (slice.length ? slice.map(function (m, idx) {
          var num = start + idx + 1;
          return '<tr>' +
            '<td style="color:var(--muted);font-weight:600;font-size:0.75rem;">' + num + '</td>' +
            '<td>' + hl(m.name) + '</td>' +
            '<td class="text-email">' + hl(m.email) + '</td>' +
            '<td>' + hl(m.message) + '</td>' +
            '<td class="text-muted">' + formatDate(m.created_at) + '</td>' +
            '<td><button class="btn-delete" data-delete-action="message" data-delete-id="' + m.id + '">Delete</button></td>' +
            '</tr>';
        }).join('') : '<tr><td colspan="6" class="empty-state">' + (q ? 'No messages matching "' + sanitize(searchQuery) + '"' : 'No messages yet') + '</td></tr>') +
        '</table></div>' + buildPagination('messages', total);
    }
  }

  // ─── Delete via edge function ───

  function adminDelete(table, id, label) {
    if (!confirm('Delete this ' + label + '?')) return;
    fetch(VMA.SUPABASE_URL + '/functions/v1/admin-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({ table: table, id: id })
    }).then(function (res) {
      if (res.ok) {
        showStatus('adminStatus', label + ' deleted.', 'success');
        loadData();
        return;
      }
      showStatus('adminStatus', 'Delete failed (status ' + res.status + ')', 'error');
    }).catch(function () {
      showStatus('adminStatus', 'Delete request failed', 'error');
    });
  }

  function deleteTrack(id) { adminDelete('tracks', id, 'Track'); }
  function deleteComment(id) { adminDelete('comments', id, 'Comment'); }
  function deleteMessage(id) { adminDelete('contact_messages', id, 'Message'); }

  function deleteUser(userId) {
    if (!confirm('Delete this user and ALL their data (tracks, comments, ratings, auth account)?\n\nThis is permanent and cannot be undone.')) return;
    showStatus('adminStatus', 'Deleting user data...', 'success');

    var deleteHeaders = {
      'Content-Type': 'application/json',
      'x-admin-password': adminPassword
    };

    // Sequential cascade: comments -> tracks -> ratings -> auth account
    fetch(VMA.SUPABASE_URL + '/functions/v1/admin-delete', {
      method: 'POST',
      headers: deleteHeaders,
      body: JSON.stringify({ table: 'comments', id: userId, column: 'user_id' })
    }).then(function () {
      return fetch(VMA.SUPABASE_URL + '/functions/v1/admin-delete', {
        method: 'POST',
        headers: deleteHeaders,
        body: JSON.stringify({ table: 'tracks', id: userId, column: 'user_id' })
      });
    }).then(function () {
      return fetch(VMA.SUPABASE_URL + '/functions/v1/admin-delete', {
        method: 'POST',
        headers: deleteHeaders,
        body: JSON.stringify({ table: 'anonymous_ratings', id: userId, column: 'user_id' })
      });
    }).then(function () {
      return fetch(VMA.SUPABASE_URL + '/functions/v1/admin-delete-user', {
        method: 'POST',
        headers: deleteHeaders,
        body: JSON.stringify({ user_id: userId })
      });
    }).then(function (authRes) {
      if (authRes.ok) {
        showStatus('adminStatus', 'User fully deleted (data + auth account).', 'success');
      } else {
        return authRes.text().then(function (errText) {
          showStatus('adminStatus', 'User data deleted, but auth account removal failed: ' + errText + '. Delete manually in Supabase Dashboard \u2192 Authentication.', 'error');
        });
      }
    }).then(function () {
      loadData();
    }).catch(function (err) {
      showStatus('adminStatus', 'Error: ' + err.message, 'error');
    });
  }

  // ─── Event delegation router ───

  function handleDelegatedClick(e) {
    var target = e.target;

    // Delete buttons (data-delete-action)
    var deleteBtn = target.closest('[data-delete-action]');
    if (deleteBtn) {
      var action = deleteBtn.getAttribute('data-delete-action');
      var id = deleteBtn.getAttribute('data-delete-id');
      if (action === 'user') deleteUser(id);
      else if (action === 'track') deleteTrack(id);
      else if (action === 'comment') deleteComment(id);
      else if (action === 'message') deleteMessage(id);
      return;
    }

    // Pagination buttons (data-page-action)
    var pageBtn = target.closest('[data-page-action]');
    if (pageBtn && !pageBtn.disabled) {
      var tab = pageBtn.getAttribute('data-page-tab');
      var num = parseInt(pageBtn.getAttribute('data-page-num'), 10);
      if (tab && !isNaN(num)) goPage(tab, num);
      return;
    }
  }

  // ─── Init ───

  function init() {
    // Login button
    var loginBtn = document.getElementById('adminLoginBtn');
    if (loginBtn) {
      var handleLoginClick = function () { login(); };
      loginBtn.addEventListener('click', handleLoginClick);
      _cleanup.push(function () { loginBtn.removeEventListener('click', handleLoginClick); });
    }

    // Enter key on password input
    var passwordInput = document.getElementById('adminPasswordInput');
    if (passwordInput) {
      var handlePasswordKeydown = function (e) {
        if (e.key === 'Enter') login();
      };
      passwordInput.addEventListener('keydown', handlePasswordKeydown);
      _cleanup.push(function () { passwordInput.removeEventListener('keydown', handlePasswordKeydown); });
    }

    // Tab buttons — event delegation on #adminTabs
    var adminTabs = document.getElementById('adminTabs');
    if (adminTabs) {
      var handleTabClick = function (e) {
        var btn = e.target.closest('[data-tab]');
        if (!btn) return;
        var tab = btn.getAttribute('data-tab');
        if (tab) switchTab(tab);
      };
      adminTabs.addEventListener('click', handleTabClick);
      _cleanup.push(function () { adminTabs.removeEventListener('click', handleTabClick); });
    }

    // Search input with debounce
    var searchInput = document.getElementById('adminSearch');
    if (searchInput) {
      var handleSearchInput = function () {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(function () {
          searchQuery = searchInput.value.trim().toLowerCase();
          pages.users = 1;
          pages.tracks = 1;
          pages.comments = 1;
          pages.messages = 1;
          // Render the currently active tab
          var activeTab = document.querySelector('#adminTabs .tab.active');
          var tabName = activeTab ? activeTab.getAttribute('data-tab') : 'users';
          renderTab(tabName);
        }, 200);
      };
      searchInput.addEventListener('input', handleSearchInput);
      _cleanup.push(function () { searchInput.removeEventListener('input', handleSearchInput); });
    }

    // Event delegation on admin panel for delete buttons and pagination
    var adminPanel = document.getElementById('adminPanel');
    if (adminPanel) {
      adminPanel.addEventListener('click', handleDelegatedClick);
      _cleanup.push(function () { adminPanel.removeEventListener('click', handleDelegatedClick); });
    }
  }

  // ─── Cleanup ───

  function cleanup() {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    // Reset state
    adminPassword = '';
    authUsers = [];
    allTracks = [];
    allComments = [];
    allMessages = [];
    userMap = {};
    pages = { users: 1, tracks: 1, comments: 1, messages: 1 };
    searchQuery = '';
    // Remove listeners
    _cleanup.forEach(function (fn) { fn(); });
    _cleanup = [];
  }

  VMA._pageCleanup = cleanup;
  init();
})();
