/**
 * Submit page — track submission with platform detection,
 * genre combobox, preview rendering, and form handling.
 */
(function () {
  'use strict';

  var _cleanup = [];

  // ── State ──
  var detectedPlatform = null;
  var detectedId = null;
  var detectedUrl = null;
  var debounceTimer = null;

  // ── Genre data ──
  var GENRES = {
    'Pop': ['Pop', 'Synth-Pop', 'Indie Pop', 'Electropop', 'Dream Pop', 'K-Pop', 'J-Pop', 'Art Pop', 'Dance Pop'],
    'Rock': ['Rock', 'Indie Rock', 'Alt Rock', 'Punk Rock', 'Post-Punk', 'Garage Rock', 'Psychedelic Rock', 'Prog Rock', 'Shoegaze', 'Grunge', 'Britpop'],
    'Hip-Hop & Rap': ['Hip-Hop', 'Trap', 'Boom Bap', 'Lo-Fi Hip-Hop', 'Drill', 'Conscious Rap', 'Old School Hip-Hop', 'Cloud Rap'],
    'Electronic': ['Electronic', 'House', 'Deep House', 'Tech House', 'Techno', 'Trance', 'Dubstep', 'Drum & Bass', 'IDM', 'Breakbeat', 'Garage', 'Hardstyle', 'Eurodance', 'Italo Disco', 'Synthwave', 'Electro', 'Future Bass'],
    'R&B & Soul': ['R&B / Soul', 'Neo Soul', 'Contemporary R&B', 'Motown', 'Funk', 'Disco'],
    'Dance & Club': ['Dance', 'EDM', 'Disco', 'Nu-Disco', 'Italo Disco', 'Tropical House', 'Afro House', 'Dancehall'],
    'Metal': ['Metal', 'Heavy Metal', 'Death Metal', 'Black Metal', 'Doom Metal', 'Thrash Metal', 'Metalcore', 'Nu Metal', 'Power Metal', 'Symphonic Metal'],
    'Jazz': ['Jazz', 'Smooth Jazz', 'Bebop', 'Jazz Fusion', 'Acid Jazz', 'Nu Jazz', 'Swing'],
    'Classical & Orchestral': ['Classical', 'Orchestral', 'Cinematic', 'Neoclassical', 'Baroque', 'Romantic', 'Chamber Music', 'Film Score', 'Epic Orchestral'],
    'Indie & Folk': ['Indie / Folk', 'Folk', 'Acoustic', 'Singer-Songwriter', 'Indie Folk', 'Americana', 'Bluegrass', 'Celtic'],
    'Latin': ['Latin', 'Reggaeton', 'Salsa', 'Bossa Nova', 'Latin Pop', 'Cumbia', 'Bachata', 'Merengue'],
    'Country & Americana': ['Country', 'Country Rock', 'Americana', 'Outlaw Country', 'Alt Country', 'Bluegrass', 'Honky Tonk'],
    'Chill & Ambient': ['Ambient', 'Lo-Fi', 'Chillout', 'Chillwave', 'Downtempo', 'New Age', 'Space Ambient', 'Vaporwave'],
    'Reggae & Caribbean': ['Reggae', 'Dub', 'Dancehall', 'Ska', 'Rocksteady', 'Soca', 'Calypso'],
    'African': ['Afrobeat', 'Afrobeats', 'Afro House', 'Amapiano', 'Highlife', 'Juju'],
    'Blues': ['Blues', 'Delta Blues', 'Chicago Blues', 'Blues Rock', 'Rhythm & Blues'],
    'World & Other': ['World Music', 'Middle Eastern', 'Indian', 'Asian', 'Flamenco', 'Polka', 'Experimental', 'Noise', 'Other']
  };

  // ── Genre dropdown builder ──
  function buildGenreDropdown() {
    var dropdown = document.getElementById('genreDropdown');
    if (!dropdown) return;
    var html = '';
    var groups = Object.keys(GENRES);
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var genres = GENRES[group];
      html += '<div class="genre-group-label">' + group + '</div>';
      for (var i = 0; i < genres.length; i++) {
        html += '<div class="genre-option" data-value="' + genres[i] + '">' + genres[i] + '</div>';
      }
    }
    html += '<div class="genre-no-match" id="genreNoMatch">No matching genre found</div>';
    html += '<div class="genre-custom-hint" id="genreCustomHint">Press Enter to use "<span id="genreCustomValue"></span>"</div>';
    dropdown.innerHTML = html;
  }

  // ── Genre combobox logic ──
  function initGenreCombo() {
    buildGenreDropdown();

    var input = document.getElementById('genreInput');
    var dropdown = document.getElementById('genreDropdown');
    var hiddenInput = document.getElementById('submitGenre');
    var tag = document.getElementById('genreTag');
    var tagText = document.getElementById('genreTagText');
    var clearBtn = document.getElementById('genreClear');
    var noMatch = document.getElementById('genreNoMatch');
    var customHint = document.getElementById('genreCustomHint');
    var customValue = document.getElementById('genreCustomValue');
    var highlightIdx = -1;

    if (!input || !dropdown || !hiddenInput) return;

    function selectGenre(value) {
      hiddenInput.value = value;
      tagText.textContent = value;
      tag.classList.add('show');
      input.value = '';
      input.style.display = 'none';
      dropdown.classList.remove('open');
    }

    function clearGenre() {
      hiddenInput.value = '';
      tag.classList.remove('show');
      input.style.display = '';
      input.value = '';
      input.focus();
    }

    function updateHighlight(visible) {
      var allOpts = dropdown.querySelectorAll('.genre-option');
      for (var i = 0; i < allOpts.length; i++) {
        allOpts[i].classList.remove('highlighted');
      }
      if (visible[highlightIdx]) {
        visible[highlightIdx].classList.add('highlighted');
        visible[highlightIdx].scrollIntoView({ block: 'nearest' });
      }
    }

    function filterGenres(q) {
      highlightIdx = -1;
      var anyVisible = false;
      var opts = dropdown.querySelectorAll('.genre-option');
      for (var i = 0; i < opts.length; i++) {
        var match = !q || opts[i].dataset.value.toLowerCase().indexOf(q) !== -1;
        opts[i].classList.toggle('hidden', !match);
        if (match) anyVisible = true;
      }
      // Show/hide group labels based on visible children
      var labels = dropdown.querySelectorAll('.genre-group-label');
      for (var j = 0; j < labels.length; j++) {
        var next = labels[j].nextElementSibling;
        var hasVisible = false;
        while (next && !next.classList.contains('genre-group-label')) {
          if (next.classList.contains('genre-option') && !next.classList.contains('hidden')) hasVisible = true;
          next = next.nextElementSibling;
        }
        labels[j].style.display = hasVisible ? '' : 'none';
      }
      if (!anyVisible && q) {
        noMatch.style.display = 'block';
        customHint.style.display = 'block';
        customValue.textContent = input.value.trim();
      } else {
        noMatch.style.display = 'none';
        customHint.style.display = 'none';
      }
    }

    // Clear button
    clearBtn.addEventListener('click', clearGenre);
    _cleanup.push(function () { clearBtn.removeEventListener('click', clearGenre); });

    // Focus opens dropdown
    function onInputFocus() {
      dropdown.classList.add('open');
      filterGenres('');
    }
    input.addEventListener('focus', onInputFocus);
    _cleanup.push(function () { input.removeEventListener('focus', onInputFocus); });

    // Input filters
    function onInputChange() {
      var q = input.value.trim().toLowerCase();
      filterGenres(q);
      dropdown.classList.add('open');
    }
    input.addEventListener('input', onInputChange);
    _cleanup.push(function () { input.removeEventListener('input', onInputChange); });

    // Keyboard navigation
    function onInputKeydown(e) {
      var visible = [];
      var allOpts = dropdown.querySelectorAll('.genre-option:not(.hidden)');
      for (var i = 0; i < allOpts.length; i++) visible.push(allOpts[i]);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightIdx = Math.min(highlightIdx + 1, visible.length - 1);
        updateHighlight(visible);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightIdx = Math.max(highlightIdx - 1, 0);
        updateHighlight(visible);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightIdx >= 0 && visible[highlightIdx]) {
          selectGenre(visible[highlightIdx].dataset.value);
        } else if (input.value.trim()) {
          selectGenre(input.value.trim());
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('open');
      }
    }
    input.addEventListener('keydown', onInputKeydown);
    _cleanup.push(function () { input.removeEventListener('keydown', onInputKeydown); });

    // Click to select option
    function onDropdownClick(e) {
      var opt = e.target.closest('.genre-option');
      if (opt) selectGenre(opt.dataset.value);
      if (e.target.closest('.genre-custom-hint')) {
        selectGenre(input.value.trim());
      }
    }
    dropdown.addEventListener('click', onDropdownClick);
    _cleanup.push(function () { dropdown.removeEventListener('click', onDropdownClick); });

    // Close on click outside
    function onDocClick(e) {
      if (!e.target.closest('.genre-combo')) {
        dropdown.classList.remove('open');
      }
    }
    document.addEventListener('click', onDocClick);
    _cleanup.push(function () { document.removeEventListener('click', onDocClick); });
  }

  // ── Auth check ──
  function initAuth() {
    if (VMA.currentUser) {
      document.getElementById('formContainer').style.display = 'block';
      document.getElementById('loginPrompt').style.display = 'none';
    } else {
      document.getElementById('formContainer').style.display = 'none';
      document.getElementById('loginPrompt').style.display = 'block';
    }
  }

  // ── Platform detection ──
  function parseTrackUrl(url) {
    var ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([^&\?\/\s]+)/);
    if (ytMatch) return { platform: 'youtube', id: ytMatch[1], url: url };

    if (url.indexOf('soundcloud.com/') !== -1 && url.split('/').length >= 4) {
      return { platform: 'soundcloud', id: url.split('?')[0], url: url };
    }

    var sunoLong = url.match(/suno\.com\/song\/([a-f0-9-]{36})/);
    if (sunoLong) return { platform: 'suno', id: sunoLong[1], url: url };

    var sunoShort = url.match(/suno\.com\/s\/([a-zA-Z0-9_-]+)/);
    if (sunoShort) return { platform: 'suno-short', id: sunoShort[1], url: url };

    if (url.indexOf('udio.com/songs/') !== -1) {
      var udioSlug = url.match(/udio\.com\/songs\/([a-zA-Z0-9_-]+)/);
      if (udioSlug) return { platform: 'udio-resolve', id: udioSlug[1], url: url };
    }

    return null;
  }

  // ── Preview rendering ──
  function showPreview(platform, id) {
    var container = document.getElementById('previewContainer');
    if (!container) return;

    if (platform === 'youtube') {
      container.innerHTML = '<div class="preview-yt"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(id) + '" allowfullscreen loading="lazy"></iframe></div>';
    } else if (platform === 'soundcloud') {
      container.innerHTML = '<iframe height="166" scrolling="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(id) + '&color=%23e8ff47&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false" loading="lazy"></iframe>';
    } else if (platform === 'suno') {
      container.innerHTML = '<iframe height="200" src="https://suno.com/embed/' + encodeURIComponent(id) + '" loading="lazy" style="border:none;width:100%;border-radius:8px;"></iframe>';
    } else if (platform === 'udio') {
      container.innerHTML = '<iframe height="200" src="https://www.udio.com/embed/' + encodeURIComponent(id) + '" scrolling="no" loading="lazy" style="border:none;width:100%;border-radius:8px;"></iframe>';
    }

    container.classList.add('show');
  }

  // ── Status message ──
  function showMessage(text, type) {
    var msg = document.getElementById('submitMessage');
    if (!msg) return;
    msg.className = 'message ' + type;
    msg.textContent = text;
    msg.style.display = 'block';
  }

  // ── URL input handler with debounce ──
  function handleUrlInput(e) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      var url = e.target.value.trim();
      var badge = document.getElementById('platformBadge');
      var preview = document.getElementById('previewContainer');

      if (!url) {
        badge.className = 'platform-badge';
        preview.classList.remove('show');
        detectedPlatform = null;
        detectedId = null;
        detectedUrl = null;
        return;
      }

      var result = parseTrackUrl(url);

      if (result) {
        // ── Suno short link — resolve via edge function ──
        if (result.platform === 'suno-short') {
          badge.textContent = '\u266a Resolving Suno link...';
          badge.className = 'platform-badge show suno';
          preview.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.85rem;">Resolving Suno link...</div>';
          preview.classList.add('show');

          fetch(VMA.SUPABASE_URL + '/functions/v1/resolve-suno', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': VMA.SUPABASE_KEY },
            body: JSON.stringify({ url: result.url })
          })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.uuid) {
              detectedPlatform = 'suno';
              detectedId = data.uuid;
              detectedUrl = 'https://suno.com/song/' + data.uuid;
              badge.textContent = '\u266a Suno detected';
              badge.className = 'platform-badge show suno';
              showPreview('suno', data.uuid);
            } else {
              detectedPlatform = null;
              detectedId = null;
              detectedUrl = null;
              badge.textContent = '\u2717 Could not resolve Suno link';
              badge.className = 'platform-badge show invalid';
              preview.classList.remove('show');
            }
          })
          .catch(function () {
            detectedPlatform = null;
            detectedId = null;
            detectedUrl = null;
            badge.textContent = '\u2717 Could not resolve Suno link';
            badge.className = 'platform-badge show invalid';
            preview.classList.remove('show');
          });
          return;
        }

        // ── Udio — resolve via edge function ──
        if (result.platform === 'udio-resolve') {
          badge.textContent = '\u266a Resolving Udio link...';
          badge.className = 'platform-badge show udio';
          preview.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.85rem;">Resolving Udio link...</div>';
          preview.classList.add('show');

          fetch(VMA.SUPABASE_URL + '/functions/v1/resolve-suno', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': VMA.SUPABASE_KEY },
            body: JSON.stringify({ url: result.url })
          })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.uuid) {
              detectedPlatform = 'udio';
              detectedId = data.uuid;
              detectedUrl = 'https://www.udio.com/songs/' + result.id;
              badge.textContent = '\u266a Udio detected';
              badge.className = 'platform-badge show udio';
              showPreview('udio', data.uuid);
            } else {
              detectedPlatform = 'udio';
              detectedId = result.id;
              detectedUrl = result.url;
              badge.textContent = '\u266a Udio detected';
              badge.className = 'platform-badge show udio';
              showPreview('udio', result.id);
            }
          })
          .catch(function () {
            detectedPlatform = 'udio';
            detectedId = result.id;
            detectedUrl = result.url;
            badge.textContent = '\u266a Udio detected';
            badge.className = 'platform-badge show udio';
            showPreview('udio', result.id);
          });
          return;
        }

        // ── Direct match (YouTube, SoundCloud, Suno long) ──
        detectedPlatform = result.platform;
        detectedId = result.id;
        detectedUrl = result.url;

        var labels = {
          youtube: '\u25b6 YouTube',
          soundcloud: '\u2601 SoundCloud',
          suno: '\u266a Suno',
          udio: '\u266a Udio'
        };
        badge.textContent = labels[result.platform] + ' detected';
        badge.className = 'platform-badge show ' + result.platform;
        showPreview(result.platform, result.id);
      } else {
        detectedPlatform = null;
        detectedId = null;
        detectedUrl = null;
        badge.textContent = '\u2717 Unsupported URL \u2014 use YouTube, SoundCloud, Suno or Udio';
        badge.className = 'platform-badge show invalid';
        preview.classList.remove('show');
      }
    }, 400);
  }

  // ── Character counter for artist note ──
  function handleNoteInput(e) {
    var counter = document.getElementById('noteCount');
    if (counter) counter.textContent = e.target.value.length;
  }

  // ── Form submit ──
  function handleFormSubmit(e) {
    e.preventDefault();

    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    var title = document.getElementById('submitTitle').value.trim();
    var tool = document.getElementById('submitTool').value;
    var genre = document.getElementById('submitGenre').value;
    var artistNote = document.getElementById('artistNote').value.trim() || null;
    var accessToken = localStorage.getItem('sb_token');

    if (!genre) {
      showMessage('Please select a genre', 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Track';
      return;
    }

    if (!detectedPlatform || !detectedId) {
      showMessage('Please enter a valid URL from YouTube, SoundCloud, Suno or Udio', 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Track';
      return;
    }

    // Fetch thumbnail, then submit
    var thumbnailUrl = null;
    btn.textContent = 'Fetching cover art...';

    fetch(VMA.SUPABASE_URL + '/functions/v1/fetch-thumbnail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + VMA.SUPABASE_KEY
      },
      body: JSON.stringify({ url: detectedUrl || ('https://www.youtube.com/watch?v=' + detectedId) })
    })
    .then(function (res) { return res.json(); })
    .then(function (thumbData) {
      if (thumbData.thumbnail_url) thumbnailUrl = thumbData.thumbnail_url;
    })
    .catch(function (err) {
      console.warn('Thumbnail fetch failed, continuing without:', err);
    })
    .then(function () {
      // Submit track
      btn.textContent = 'Submitting...';

      var trackData = {
        title: title,
        yt_id: detectedPlatform === 'youtube' ? detectedId : null,
        embed_url: detectedUrl || null,
        thumbnail_url: thumbnailUrl,
        tool: tool,
        genre: genre,
        artist_note: artistNote,
        votes: 0,
        user_id: VMA.currentUser.id
      };

      return fetch(VMA.SUPABASE_URL + '/rest/v1/tracks', {
        method: 'POST',
        headers: {
          'apikey': VMA.SUPABASE_KEY,
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(trackData)
      }).then(function (res) {
        if (res.ok) {
          showMessage('\u2705 Track submitted successfully!', 'success');

          // Analytics event
          if (typeof gtag === 'function') {
            gtag('event', 'track_submit', { tool: trackData.tool, genre: trackData.genre, platform: detectedPlatform });
          }

          // Reset form state
          document.getElementById('submitForm').reset();
          document.getElementById('platformBadge').className = 'platform-badge';
          document.getElementById('previewContainer').classList.remove('show');
          document.getElementById('genreTag').classList.remove('show');
          document.getElementById('genreInput').style.display = '';
          document.getElementById('submitGenre').value = '';
          detectedPlatform = null;
          detectedId = null;
          detectedUrl = null;

          // Navigate home after short delay
          setTimeout(function () {
            if (typeof VMARouter !== 'undefined') {
              VMARouter.navigate('/');
            } else {
              window.location.href = '/';
            }
          }, 2000);
        } else {
          res.text().then(function (err) { console.error('Submit error:', err); });
          showMessage('Failed to submit track. Please try again.', 'error');
        }
      });
    })
    .catch(function (err) {
      console.error('Network error:', err);
      showMessage('Network error. Please try again.', 'error');
    })
    .then(function () {
      btn.disabled = false;
      btn.textContent = 'Submit Track';
    });
  }

  // ── Init ──
  function init() {
    initAuth();
    initGenreCombo();

    // URL input with debounce
    var urlInput = document.getElementById('trackUrl');
    if (urlInput) {
      urlInput.addEventListener('input', handleUrlInput);
      _cleanup.push(function () { urlInput.removeEventListener('input', handleUrlInput); });
    }

    // Character counter
    var noteField = document.getElementById('artistNote');
    if (noteField) {
      noteField.addEventListener('input', handleNoteInput);
      _cleanup.push(function () { noteField.removeEventListener('input', handleNoteInput); });
    }

    // Form submit
    var form = document.getElementById('submitForm');
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
      _cleanup.push(function () { form.removeEventListener('submit', handleFormSubmit); });
    }
  }

  // ── Cleanup ──
  function cleanup() {
    clearTimeout(debounceTimer);
    detectedPlatform = null;
    detectedId = null;
    detectedUrl = null;
    _cleanup.forEach(function (fn) { fn(); });
    _cleanup = [];
  }

  VMA._pageCleanup = cleanup;
  init();
})();
