(function () {
  var _cleanup = [];

  function init() {
    var token = localStorage.getItem('sb_token');
    var currentUser = VMA.currentUser;

    // If not logged in, redirect to login
    if (!currentUser || !token) {
      VMARouter.navigate('/login.html');
      return;
    }

    // Profile info
    var displayName =
      (currentUser.user_metadata && currentUser.user_metadata.display_name) ||
      (currentUser.user_metadata && currentUser.user_metadata.name) ||
      currentUser.email.split('@')[0];

    document.getElementById('userName').textContent = displayName;
    document.getElementById('userEmail').textContent = currentUser.email;

    var nameInput = document.getElementById('nameInput');
    nameInput.value =
      (currentUser.user_metadata && currentUser.user_metadata.display_name) || '';
    nameInput.placeholder = displayName;

    // Avatar
    var avatarEl = document.getElementById('avatar');
    var avatarUrl =
      (currentUser.user_metadata && currentUser.user_metadata.avatar_url) ||
      (currentUser.user_metadata && currentUser.user_metadata.picture);

    if (avatarUrl) {
      avatarEl.innerHTML =
        '<img src="' +
        VMA.sanitize(avatarUrl) +
        '" alt="' +
        VMA.sanitize(displayName) +
        '">';
    } else {
      avatarEl.textContent = displayName.charAt(0).toUpperCase();
    }

    // Load data
    Promise.all([loadMyTracks(token, currentUser), loadMyRatings(token)]);

    // Save name button
    var btnSave = document.getElementById('btnSaveName');
    function onSaveName() {
      saveName(token);
    }
    btnSave.addEventListener('click', onSaveName);
    _cleanup.push(function () {
      btnSave.removeEventListener('click', onSaveName);
    });

    // Logout button
    var btnLogout = document.getElementById('btnLogout');
    function onLogout() {
      localStorage.removeItem('sb_token');
      VMA.currentUser = null;
      VMARouter.navigate('/');
    }
    btnLogout.addEventListener('click', onLogout);
    _cleanup.push(function () {
      btnLogout.removeEventListener('click', onLogout);
    });

    // Delete track delegation
    var tracksList = document.getElementById('tracksList');
    function onTracksClick(e) {
      var btn = e.target.closest('.btn-delete');
      if (!btn) return;
      var trackId = btn.getAttribute('data-track-id');
      if (!trackId) return;
      deleteTrack(trackId, token, currentUser);
    }
    tracksList.addEventListener('click', onTracksClick);
    _cleanup.push(function () {
      tracksList.removeEventListener('click', onTracksClick);
    });
  }

  function getThumbUrl(track) {
    if (track.thumbnail_url) return track.thumbnail_url;
    if (track.yt_id)
      return 'https://img.youtube.com/vi/' + track.yt_id + '/mqdefault.jpg';
    return '';
  }

  function saveName(token) {
    var nameInput = document.getElementById('nameInput');
    var newName = nameInput.value.trim();

    if (!newName) {
      VMA.showToast('Name cannot be empty');
      return;
    }
    if (newName.length > 30) {
      VMA.showToast('Max 30 characters');
      return;
    }

    var btn = document.getElementById('btnSaveName');
    btn.disabled = true;
    btn.textContent = '...';

    fetch(VMA.SUPABASE_URL + '/auth/v1/user', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token,
        apikey: VMA.SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { display_name: newName } }),
    })
      .then(function (res) {
        if (res.ok) {
          document.getElementById('userName').textContent = newName;
          document.getElementById('saveStatus').textContent = 'Name updated!';
          // Update currentUser metadata
          if (VMA.currentUser && VMA.currentUser.user_metadata) {
            VMA.currentUser.user_metadata.display_name = newName;
          }
          setTimeout(function () {
            var el = document.getElementById('saveStatus');
            if (el) el.textContent = '';
          }, 2000);
        } else {
          VMA.showToast('Could not update name');
        }
      })
      .catch(function () {
        VMA.showToast('Network error');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Save';
      });
  }

  function loadMyTracks(token, currentUser) {
    return fetch(
      VMA.SUPABASE_URL +
        '/rest/v1/tracks?user_id=eq.' +
        currentUser.id +
        '&select=*&order=created_at.desc',
      {
        headers: {
          apikey: VMA.SUPABASE_KEY,
          Authorization: 'Bearer ' + token,
        },
      }
    )
      .then(function (res) {
        return res.json();
      })
      .then(function (tracks) {
        document.getElementById('statTracks').textContent = tracks.length;

        var rated = tracks.filter(function (t) {
          return t.rating_count > 0;
        });
        var totalRatings = tracks.reduce(function (s, t) {
          return s + (t.rating_count || 0);
        }, 0);

        document.getElementById('statTotalRatings').textContent = totalRatings;

        if (rated.length > 0) {
          var avgAll =
            rated.reduce(function (s, t) {
              return s + (t.avg_rating || 0);
            }, 0) / rated.length;
          document.getElementById('statAvgRating').textContent =
            avgAll.toFixed(1);
        } else {
          document.getElementById('statAvgRating').textContent = '\u2014';
        }

        var list = document.getElementById('tracksList');

        if (!tracks.length) {
          list.innerHTML =
            '<div class="empty">No tracks yet. <a href="/submit.html" data-link>Submit your first track!</a></div>';
          return;
        }

        list.innerHTML = tracks
          .map(function (t) {
            var thumb = getThumbUrl(t);
            var avg = t.avg_rating
              ? parseFloat(t.avg_rating).toFixed(1)
              : '\u2014';
            return (
              '<div class="track-item">' +
              (thumb
                ? '<div class="track-thumb"><img src="' +
                  VMA.sanitize(thumb) +
                  '" alt="' +
                  VMA.sanitize(t.title) +
                  '" loading="lazy"></div>'
                : '') +
              '<div class="track-details"><div class="track-title">' +
              VMA.sanitize(t.title) +
              '</div><div class="track-meta">' +
              VMA.sanitize(t.tool) +
              ' \u00b7 ' +
              VMA.sanitize(t.genre) +
              ' \u00b7 ' +
              (t.rating_count || 0) +
              ' ratings</div></div>' +
              '<div class="track-rating"><span class="track-rating-score">' +
              avg +
              '</span><span class="track-rating-count">avg</span></div>' +
              '<button class="btn-delete" data-track-id="' +
              t.id +
              '">Delete</button></div>'
            );
          })
          .join('');
      })
      .catch(function () {
        document.getElementById('tracksList').innerHTML =
          '<div class="empty">Could not load tracks</div>';
      });
  }

  function loadMyRatings(token) {
    var anonToken = localStorage.getItem('votemyai_anon_token');
    if (!anonToken) {
      document.getElementById('ratingsList').innerHTML =
        '<div class="empty">No ratings yet</div>';
      return Promise.resolve();
    }

    return fetch(
      VMA.SUPABASE_URL +
        '/rest/v1/anonymous_ratings?anon_token=eq.' +
        anonToken +
        '&select=track_id,score',
      {
        headers: {
          apikey: VMA.SUPABASE_KEY,
          Authorization: 'Bearer ' + VMA.SUPABASE_KEY,
        },
      }
    )
      .then(function (res) {
        return res.json();
      })
      .then(function (ratings) {
        if (!ratings.length) {
          document.getElementById('ratingsList').innerHTML =
            '<div class="empty">No ratings yet \u2014 go rate some tracks!</div>';
          return;
        }

        var trackIds = ratings.map(function (r) {
          return r.track_id;
        });

        return fetch(
          VMA.SUPABASE_URL +
            '/rest/v1/tracks?id=in.(' +
            trackIds.join(',') +
            ')&select=id,title,tool,genre,thumbnail_url,yt_id',
          {
            headers: { apikey: VMA.SUPABASE_KEY },
          }
        )
          .then(function (tracksRes) {
            return tracksRes.json();
          })
          .then(function (tracks) {
            var trackMap = {};
            tracks.forEach(function (t) {
              trackMap[t.id] = t;
            });

            var list = document.getElementById('ratingsList');
            list.innerHTML = ratings
              .map(function (r) {
                var t = trackMap[r.track_id];
                if (!t) return '';
                var thumb = getThumbUrl(t);
                var stars =
                  '\u2605'.repeat(r.score) + '\u2606'.repeat(5 - r.score);
                return (
                  '<div class="track-item">' +
                  (thumb
                    ? '<div class="track-thumb"><img src="' +
                      VMA.sanitize(thumb) +
                      '" alt="' +
                      VMA.sanitize(t.title) +
                      '" loading="lazy"></div>'
                    : '') +
                  '<div class="track-details"><div class="track-title">' +
                  VMA.sanitize(t.title) +
                  '</div><div class="track-meta">' +
                  VMA.sanitize(t.tool) +
                  ' \u00b7 ' +
                  VMA.sanitize(t.genre) +
                  '</div></div>' +
                  '<div class="rated-star">' +
                  stars +
                  '</div></div>'
                );
              })
              .filter(Boolean)
              .join('');

            if (!list.innerHTML) {
              list.innerHTML = '<div class="empty">No ratings yet</div>';
            }
          });
      })
      .catch(function () {
        document.getElementById('ratingsList').innerHTML =
          '<div class="empty">Could not load ratings</div>';
      });
  }

  function deleteTrack(trackId, token, currentUser) {
    if (!confirm('Are you sure you want to delete this track?')) return;

    fetch(
      VMA.SUPABASE_URL +
        '/rest/v1/tracks?id=eq.' +
        trackId +
        '&user_id=eq.' +
        currentUser.id,
      {
        method: 'DELETE',
        headers: {
          apikey: VMA.SUPABASE_KEY,
          Authorization: 'Bearer ' + token,
        },
      }
    )
      .then(function (res) {
        if (res.ok) {
          VMA.showToast('Track deleted');
          loadMyTracks(token, currentUser);
        } else {
          VMA.showToast('Could not delete track');
        }
      })
      .catch(function () {
        VMA.showToast('Network error');
      });
  }

  function cleanup() {
    _cleanup.forEach(function (fn) {
      fn();
    });
    _cleanup = [];
  }

  VMA._pageCleanup = cleanup;
  init();
})();
