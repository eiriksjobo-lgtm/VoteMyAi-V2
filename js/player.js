/* ═══════════════════════════════════════════════════════════════════
 *  VMAPlayer — Simple inline player for VoteMyAI
 *
 *  Pre-SPA architecture restored: embeds live INLINE in track rows.
 *  No popup systems, no hidden containers, no phase transitions.
 * ═══════════════════════════════════════════════════════════════════ */

window.VMAPlayer = (function () {
  'use strict';

  var VMA = window.VMA;

  // ─── Sanitisation ───
  var _sanitizeEl = document.createElement('div');
  function sanitize(str) {
    if (!str) return '';
    _sanitizeEl.textContent = str;
    return _sanitizeEl.innerHTML;
  }
  function sanitizeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── DOM refs ───
  var playerBar = null;
  var playerTitle = null;
  var playerMeta = null;

  // ─── State ───
  var activeTrackId = null;
  var activePlatform = null;


  // ═══════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════

  function _getTrack(id) {
    if (VMA && typeof VMA.getTrack === 'function') return VMA.getTrack(id);
    return null;
  }

  function _getThumb(track) {
    if (!track) return '';
    if (track.thumbnail_url) return track.thumbnail_url;
    if (track.embed_url) {
      var m = track.embed_url.match(/\/([a-f0-9-]{36})/);
      if (m && (track.embed_url.includes('suno.com') || track.embed_url.includes('suno.ai'))) {
        return 'https://cdn2.suno.ai/image_' + m[1] + '.jpeg';
      }
    }
    if (track.yt_id) return 'https://img.youtube.com/vi/' + track.yt_id + '/default.jpg';
    return '';
  }

  function _getTrackPlatform(track) {
    if (!track) return { platform: 'unknown' };
    var url = track.embed_url;
    var result;
    if (url) {
      var ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([^&?\/#]+)/);
      if (ytMatch) { result = { platform: 'youtube', videoId: ytMatch[1] }; }
      else if (url.includes('soundcloud.com')) {
        result = { platform: 'soundcloud', url: url, isShort: url.includes('on.soundcloud.com') };
      }
      else if (url.includes('suno.com') || url.includes('suno.ai')) {
        var sunoMatch = url.match(/\/([a-f0-9-]{36})/);
        result = sunoMatch ? { platform: 'suno', sunoId: sunoMatch[1], url: url } : { platform: 'suno', url: url };
      }
      else if (url.includes('udio.com')) {
        var udioUuid = url.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
        if (udioUuid) { result = { platform: 'udio', udioId: udioUuid[0], url: url }; }
        else {
          var udioSlug = url.match(/udio\.com\/(?:songs|embed)\/([a-zA-Z0-9_-]+)/);
          result = udioSlug ? { platform: 'udio', udioId: udioSlug[1], url: url } : { platform: 'udio', url: url };
        }
      }
    }
    if (!result && track.yt_id) result = { platform: 'youtube', videoId: track.yt_id };
    if (!result) result = { platform: 'unknown', url: url };
    return result;
  }


  // ═══════════════════════════════════════════════════════════════
  //  STOP — kill all playback, clean up DOM
  // ═══════════════════════════════════════════════════════════════

  function stopTrack() {
    if (activeTrackId === null) return;
    activeTrackId = null;
    activePlatform = null;

    // Clean up all playing rows
    document.querySelectorAll('.track-row.playing, .track-row.eq-active').forEach(function (row) {
      row.classList.remove('playing', 'eq-active');
      var btn = row.querySelector('.track-play');
      if (btn) {
        btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>';
        btn.setAttribute('aria-label', 'Play');
      }
      var embedArea = row.querySelector('.track-embed-area');
      if (embedArea) {
        embedArea.querySelectorAll('iframe').forEach(function (f) {
          try { f.src = 'about:blank'; } catch (e) {}
        });
        embedArea.innerHTML = '';
        embedArea.style.display = 'none';
      }
    });

    // Kill any stray audio iframes on the page
    document.querySelectorAll('iframe').forEach(function (f) {
      var src = f.src || '';
      if (src === '' || src === 'about:blank') return;
      if (src.includes('suno.com') || src.includes('youtube.com') ||
          src.includes('soundcloud.com') || src.includes('youtu.be')) {
        try { f.src = 'about:blank'; } catch (e) {}
      }
    });

    // Kill stray audio/video
    document.querySelectorAll('audio, video').forEach(function (el) {
      try { el.pause(); el.src = ''; } catch (e) {}
    });

    // Hide player bar
    playerBar.classList.remove('active', 'playing', 'udio-active');
    document.body.classList.remove('player-active');
    var thumbEl = document.getElementById('playerThumb');
    if (thumbEl) thumbEl.style.display = 'none';

    _updateNavTargets();
  }


  // ═══════════════════════════════════════════════════════════════
  //  PLAY — inline embed in track row
  // ═══════════════════════════════════════════════════════════════

  function playTrack(trackId) {
    // Toggle: same track => stop
    if (activeTrackId !== null && String(activeTrackId) === String(trackId)) {
      stopTrack();
      return;
    }

    // Stop current
    stopTrack();

    var track = _getTrack(trackId);
    if (!track) return;

    var row = document.querySelector('.track-row[data-track-id="' + trackId + '"]');
    if (!row) return;

    var info = _getTrackPlatform(track);

    // Mark as playing
    activeTrackId = trackId;
    activePlatform = info.platform;
    row.classList.add('playing');

    // Play icon: YouTube shows stop square, Udio shows nothing special, others show EQ
    var btn = row.querySelector('.track-play');
    if (info.platform === 'youtube') {
      if (btn) {
        btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
        btn.setAttribute('aria-label', 'Stop');
      }
    } else if (info.platform !== 'udio') {
      // Suno, SoundCloud: show equalizer
      row.classList.add('eq-active');
    }

    // Populate embed area INLINE in the track row
    var embedArea = row.querySelector('.track-embed-area');
    if (embedArea) {
      populateEmbed(track, info, embedArea);
    }

    // Activate player bar
    var genre = VMA && typeof VMA.resolveGenre === 'function' ? VMA.resolveGenre(track.genre) : (track.genre || '');
    var meta = [track.tool, genre].filter(Boolean).join(' \u00B7 ');

    playerTitle.textContent = track.title || 'Now Playing';
    playerBar.classList.remove('udio-active');

    if (info.platform === 'udio') {
      playerMeta.textContent = meta ? meta + ' \u00B7 Playing on Udio' : 'Playing on Udio';
      playerBar.classList.add('active', 'udio-active');
    } else {
      playerMeta.textContent = meta;
      playerBar.classList.add('active', 'playing');
    }
    document.body.classList.add('player-active');

    // Thumbnail
    var thumbUrl = _getThumb(track);
    var thumbEl = document.getElementById('playerThumb');
    if (thumbEl) {
      if (thumbUrl) { thumbEl.src = thumbUrl; thumbEl.style.display = ''; }
      else { thumbEl.style.display = 'none'; }
    }

    _updateNavTargets();

    if (typeof gtag === 'function') {
      gtag('event', 'play', { track_id: trackId, platform: info.platform });
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  POPULATE EMBED — fills embed area inline in track row
  // ═══════════════════════════════════════════════════════════════

  function populateEmbed(track, info, embedArea) {
    var isMobile = window.innerWidth <= 640;

    if (info.platform === 'youtube') {
      embedArea.innerHTML =
        '<div class="embed-yt"><iframe src="https://www.youtube.com/embed/' + info.videoId +
        '?rel=0&autoplay=1&playsinline=1&enablejsapi=1&origin=' +
        encodeURIComponent(window.location.origin) +
        '" allow="autoplay; encrypted-media" allowfullscreen playsinline></iframe></div>';
      embedArea.style.display = 'block';

    } else if (info.platform === 'suno' && info.sunoId) {
      var sunoH = isMobile ? '120px' : '160px';
      embedArea.innerHTML =
        '<div class="embed-suno"><iframe src="https://suno.com/embed/' + info.sunoId +
        '?autoplay=true" allow="autoplay" style="height:' + sunoH + '" playsinline></iframe></div>';
      embedArea.style.display = 'block';

    } else if (info.platform === 'soundcloud') {
      var scUrl = info.url || track.embed_url || '';
      var scH = isMobile ? '120px' : '166px';
      embedArea.innerHTML =
        '<iframe src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(scUrl) +
        '&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&show_user=true' +
        '&show_reposts=false&show_teaser=false&visual=true" allow="autoplay" ' +
        'style="width:100%;height:' + scH + ';border:none;border-radius:8px" playsinline></iframe>';
      embedArea.style.display = 'block';

    } else if (info.platform === 'udio') {
      // Udio blocks iframes (X-Frame-Options). Link out instead.
      var udioUrl = info.url || ('https://www.udio.com/songs/' + (info.udioId || ''));
      embedArea.innerHTML =
        '<a href="' + sanitizeAttr(udioUrl) + '" target="_blank" rel="noopener noreferrer" ' +
        'style="display:flex;align-items:center;justify-content:center;gap:8px;height:48px;' +
        'background:var(--surface-2);border-radius:8px;color:#818cf8;text-decoration:none;' +
        'font-weight:600;font-size:.82rem;transition:background 0.2s;">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="#818cf8">' +
        '<polygon points="6 3 20 12 6 21 6 3"/></svg>Listen on Udio \u2197</a>';
      embedArea.style.display = 'block';

    } else {
      // Unknown platform — link out
      var fallbackUrl = track.embed_url || (track.yt_id ? 'https://www.youtube.com/watch?v=' + track.yt_id : '');
      if (fallbackUrl) {
        embedArea.innerHTML =
          '<a href="' + sanitizeAttr(fallbackUrl) + '" target="_blank" rel="noopener noreferrer" ' +
          'style="display:flex;align-items:center;justify-content:center;gap:8px;height:48px;' +
          'background:var(--surface-2);border-radius:8px;color:var(--accent);text-decoration:none;' +
          'font-weight:600;font-size:.82rem;">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">' +
          '<polygon points="6 3 20 12 6 21 6 3"/></svg>Listen \u2197</a>';
      } else {
        embedArea.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:48px;' +
          'background:var(--surface-2);border-radius:8px;color:var(--muted);font-size:.82rem;">' +
          'No playback source available</div>';
      }
      embedArea.style.display = 'block';
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  NAV TARGETS — open in new tab when music is playing
  // ═══════════════════════════════════════════════════════════════

  function _updateNavTargets() {
    var isPlaying = !!(activeTrackId);
    var sel = 'nav a[href^="/"], .nav-links-mobile a[href^="/"], footer a[href^="/"], a.hero-cta[href^="/"]';
    document.querySelectorAll(sel).forEach(function (a) {
      if (a.classList.contains('logo')) return;
      if (isPlaying) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      } else {
        a.removeAttribute('target');
        a.removeAttribute('rel');
      }
    });
  }


  // ═══════════════════════════════════════════════════════════════
  //  LOCATE — scroll to the playing track
  // ═══════════════════════════════════════════════════════════════

  function locateTrack() {
    if (activeTrackId === null) return;

    // Delegate to main page module (handles genre switching + display expansion)
    if (VMA && VMA.mainPage && typeof VMA.mainPage.locateTrack === 'function') {
      VMA.mainPage.locateTrack();
      return;
    }

    // Fallback: direct scroll
    var row = document.querySelector('.track-row[data-track-id="' + activeTrackId + '"]');
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.boxShadow = '0 0 0 2px var(--accent), 0 8px 32px rgba(232,255,71,0.15)';
      setTimeout(function () { row.style.boxShadow = ''; }, 2000);
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════

  function init() {
    playerBar = document.getElementById('playerBar');
    playerTitle = document.getElementById('playerTitle');
    playerMeta = document.getElementById('playerMeta');
    if (!playerBar) return;

    var btnClose = document.getElementById('btnClose');
    if (btnClose) btnClose.addEventListener('click', stopTrack);

    var btnLocate = document.getElementById('btnLocate');
    if (btnLocate) btnLocate.addEventListener('click', locateTrack);

    var playerInfo = document.getElementById('playerInfo');
    if (playerInfo) playerInfo.addEventListener('click', locateTrack);
  }


  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  return {
    get activeTrackId() { return activeTrackId; },
    get activePlatform() { return activePlatform; },
    get listTrackId() { return activeTrackId; },

    playTrack: playTrack,
    stopTrack: stopTrack,
    closePlayer: stopTrack,
    locateTrack: locateTrack,
    init: init
  };
})();
