/* ═══════════════════════════════════════════════════════════════════
 *  VMAPlayer v24 — Platform-specific playback engine for VoteMyAI
 *
 *  YouTube    → visible inline iframe in track-row embed-area
 *  Suno       → HIDDEN iframe on document.body + EQ overlay in row
 *               (iOS: two-phase — full iframe → shrink + EQ)
 *  SoundCloud → HIDDEN iframe on document.body + EQ overlay in row
 *               (iOS: two-phase — full iframe → shrink + EQ)
 *  Udio       → <a> link (X-Frame-Options: DENY blocks iframes)
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

  // ─── iOS detection ───
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ─── Hidden iframe CSS — position:fixed NOT display:none (kills audio) ───
  var HIDDEN_CSS = 'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;';

  // ─── DOM refs ───
  var playerBar = null;
  var playerTitle = null;
  var playerMeta = null;

  // ─── State ───
  var activeTrackId = null;
  var activePlatform = null;
  var _iosTimer = null;
  var _iosBlurFn = null;


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
  //  iOS TWO-PHASE (Suno / SoundCloud only)
  //
  //  Phase 1: full-size iframe in embed-area — user taps play
  //  Phase 2: shrink iframe to 1px via CSS (NEVER move in DOM —
  //           Safari kills audio on appendChild/insertBefore)
  //           + show EQ overlay in embed-area
  // ═══════════════════════════════════════════════════════════════

  function _clearIos() {
    if (_iosTimer) { clearTimeout(_iosTimer); _iosTimer = null; }
    if (_iosBlurFn) { window.removeEventListener('blur', _iosBlurFn); _iosBlurFn = null; }
  }

  function _iosPhase2(trackId) {
    _clearIos();
    if (String(activeTrackId) !== String(trackId)) return;

    var row = document.querySelector('.track-row[data-track-id="' + trackId + '"]');
    if (!row) return;
    var embedArea = row.querySelector('.track-embed-area');
    if (!embedArea) return;

    // Shrink iframe to 1px — stays in same DOM position
    var iframe = embedArea.querySelector('iframe');
    if (iframe) {
      iframe.style.cssText = 'width:1px;height:1px;opacity:0.01;pointer-events:none;position:absolute;left:0;bottom:0;';
    }
    // Also shrink the wrapper div (.embed-suno or parent)
    var wrapper = iframe ? iframe.parentElement : null;
    if (wrapper && wrapper !== embedArea) {
      wrapper.style.cssText = 'position:relative;width:1px;height:1px;overflow:hidden;';
    }

    // Insert EQ overlay (after the hidden iframe, still in embed-area)
    var eqClass = activePlatform === 'soundcloud' ? 'embed-eq sc' : 'embed-eq';
    var label = activePlatform === 'soundcloud' ? 'Playing on SoundCloud' : 'Now Playing';
    var eqDiv = document.createElement('div');
    eqDiv.className = eqClass;
    eqDiv.innerHTML = '<span></span><span></span><span></span><span></span><span class="embed-eq-label">' + label + '</span>';
    embedArea.appendChild(eqDiv);

    // Activate EQ bars in track row
    row.classList.add('eq-active');
  }

  function _startIosPhase1(trackId) {
    // window.blur = user tapped play inside the iframe
    _iosBlurFn = function () {
      setTimeout(function () { _iosPhase2(trackId); }, 2500);
    };
    window.addEventListener('blur', _iosBlurFn);
    // Fallback timeout
    _iosTimer = setTimeout(function () { _iosPhase2(trackId); }, 10000);
  }


  // ═══════════════════════════════════════════════════════════════
  //  EQ OVERLAY HTML — shown in embed-area for hidden-iframe tracks
  // ═══════════════════════════════════════════════════════════════

  function _eqOverlayHTML(platform) {
    var cls = platform === 'soundcloud' ? 'embed-eq sc' : 'embed-eq';
    var label = platform === 'soundcloud' ? 'Playing on SoundCloud' : 'Now Playing';
    return '<div class="' + cls + '"><span></span><span></span><span></span><span></span>' +
           '<span class="embed-eq-label">' + label + '</span></div>';
  }


  // ═══════════════════════════════════════════════════════════════
  //  STOP — kill all playback, clean up DOM
  // ═══════════════════════════════════════════════════════════════

  function stopTrack() {
    if (activeTrackId === null) return;
    activeTrackId = null;
    activePlatform = null;

    // Clear iOS listeners
    _clearIos();

    // Remove hidden-player divs from document.body
    document.querySelectorAll('[id^="hidden-player-"]').forEach(function (el) {
      var f = el.querySelector('iframe');
      if (f) { try { f.src = 'about:blank'; } catch (e) {} }
      el.remove();
    });

    // Clean up all playing/eq-active rows
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

    // Kill stray audio iframes anywhere on the page
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
  //  PLAY — orchestrates platform-specific strategies
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

    var embedArea = row.querySelector('.track-embed-area');

    // ─── YOUTUBE: visible inline iframe (all platforms) ───
    if (info.platform === 'youtube') {
      var btn = row.querySelector('.track-play');
      if (btn) {
        btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
        btn.setAttribute('aria-label', 'Stop');
      }
      if (embedArea) {
        embedArea.innerHTML =
          '<div class="embed-yt"><iframe src="https://www.youtube.com/embed/' + info.videoId +
          '?rel=0&autoplay=1&playsinline=1&enablejsapi=1&origin=' +
          encodeURIComponent(window.location.origin) +
          '" allow="autoplay; encrypted-media" allowfullscreen playsinline></iframe></div>';
        embedArea.style.display = 'block';
      }

    // ─── SUNO: hidden iframe + EQ overlay (iOS: two-phase) ───
    } else if (info.platform === 'suno' && info.sunoId) {
      if (isIOS) {
        // Phase 1: full-size iframe for user to tap play
        var btn2 = row.querySelector('.track-play');
        if (btn2) {
          btn2.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
          btn2.setAttribute('aria-label', 'Stop');
        }
        if (embedArea) {
          embedArea.innerHTML =
            '<div class="embed-suno"><iframe src="https://suno.com/embed/' + info.sunoId +
            '" allow="autoplay" playsinline></iframe></div>';
          embedArea.style.display = 'block';
        }
        _startIosPhase1(trackId);
      } else {
        // Non-iOS: hidden iframe on body, EQ overlay in row
        row.classList.add('eq-active');
        var hDiv = document.createElement('div');
        hDiv.id = 'hidden-player-' + trackId;
        hDiv.style.cssText = HIDDEN_CSS;
        hDiv.innerHTML = '<iframe src="https://suno.com/embed/' + info.sunoId +
          '?autoplay=true" allow="autoplay" playsinline style="width:100%;height:160px;border:none;"></iframe>';
        document.body.appendChild(hDiv);
        if (embedArea) {
          embedArea.innerHTML = _eqOverlayHTML('suno');
          embedArea.style.display = 'block';
        }
      }

    // ─── SOUNDCLOUD: hidden iframe + EQ overlay (iOS: two-phase) ───
    } else if (info.platform === 'soundcloud') {
      var scUrl = info.url || track.embed_url || '';
      if (isIOS) {
        // Phase 1: full-size iframe for user to tap play
        var btn3 = row.querySelector('.track-play');
        if (btn3) {
          btn3.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
          btn3.setAttribute('aria-label', 'Stop');
        }
        if (embedArea) {
          embedArea.innerHTML =
            '<iframe src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(scUrl) +
            '&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true' +
            '&show_reposts=false&show_teaser=false&visual=true" allow="autoplay" ' +
            'style="width:100%;height:166px;border:none;border-radius:8px" playsinline></iframe>';
          embedArea.style.display = 'block';
        }
        _startIosPhase1(trackId);
      } else {
        // Non-iOS: hidden iframe on body, EQ overlay in row
        row.classList.add('eq-active');
        var scHidden = document.createElement('div');
        scHidden.id = 'hidden-player-' + trackId;
        scHidden.style.cssText = HIDDEN_CSS;
        scHidden.innerHTML =
          '<iframe src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(scUrl) +
          '&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&show_user=true' +
          '&show_reposts=false&show_teaser=false&visual=true" allow="autoplay" ' +
          'style="width:100%;height:166px;border:none;" playsinline></iframe>';
        document.body.appendChild(scHidden);
        if (embedArea) {
          embedArea.innerHTML = _eqOverlayHTML('soundcloud');
          embedArea.style.display = 'block';
        }
      }

    // ─── UDIO: link only (X-Frame-Options: DENY) ───
    } else if (info.platform === 'udio') {
      var udioUrl = info.url || ('https://www.udio.com/songs/' + (info.udioId || ''));
      if (embedArea) {
        embedArea.innerHTML =
          '<a href="' + sanitizeAttr(udioUrl) + '" target="_blank" rel="noopener noreferrer" ' +
          'style="display:flex;align-items:center;justify-content:center;gap:8px;height:48px;' +
          'background:var(--surface-2);border-radius:8px;color:#818cf8;text-decoration:none;' +
          'font-weight:600;font-size:.82rem;transition:background 0.2s;">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="#818cf8">' +
          '<polygon points="6 3 20 12 6 21 6 3"/></svg>Listen on Udio \u2197</a>';
        embedArea.style.display = 'block';
      }

    // ─── UNKNOWN: link out ───
    } else {
      var fallbackUrl = track.embed_url || (track.yt_id ? 'https://www.youtube.com/watch?v=' + track.yt_id : '');
      if (embedArea) {
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

    // ─── Activate player bar ───
    _activateBar(track, info);
    _updateNavTargets();

    if (typeof gtag === 'function') {
      gtag('event', 'play', { track_id: trackId, platform: info.platform });
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  PLAYER BAR — show track info + EQ
  // ═══════════════════════════════════════════════════════════════

  function _activateBar(track, info) {
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

    var thumbUrl = _getThumb(track);
    var thumbEl = document.getElementById('playerThumb');
    if (thumbEl) {
      if (thumbUrl) { thumbEl.src = thumbUrl; thumbEl.style.display = ''; }
      else { thumbEl.style.display = 'none'; }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  RESTORE PLAYING ROW — called after track list re-render
  //  (hidden iframes on body survive re-render; visual state
  //   in the track row needs restoring)
  // ═══════════════════════════════════════════════════════════════

  function restorePlayingRow() {
    if (activeTrackId === null) return;

    var row = document.querySelector('.track-row[data-track-id="' + activeTrackId + '"]');
    if (!row) return;

    // Row already has .playing from buildTrackRow — add platform-specific state
    if (activePlatform === 'suno' || activePlatform === 'soundcloud') {
      // Hidden iframe on body still playing — restore EQ overlay
      var hiddenEl = document.getElementById('hidden-player-' + activeTrackId);
      if (hiddenEl) {
        // Non-iOS path: hidden iframe exists, show EQ
        row.classList.add('eq-active');
        var embedArea = row.querySelector('.track-embed-area');
        if (embedArea) {
          embedArea.innerHTML = _eqOverlayHTML(activePlatform);
          embedArea.style.display = 'block';
        }
      }
      // iOS path: iframe was in embed-area and got destroyed by re-render
      // Audio is lost — user needs to click play again

    } else if (activePlatform === 'youtube') {
      // YouTube iframe was inline and got destroyed — show stop button
      var btn = row.querySelector('.track-play');
      if (btn) {
        btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
        btn.setAttribute('aria-label', 'Stop');
      }
      // Re-populate the YouTube embed
      var track = _getTrack(activeTrackId);
      if (track) {
        var info = _getTrackPlatform(track);
        if (info.platform === 'youtube' && info.videoId) {
          var embedArea = row.querySelector('.track-embed-area');
          if (embedArea) {
            embedArea.innerHTML =
              '<div class="embed-yt"><iframe src="https://www.youtube.com/embed/' + info.videoId +
              '?rel=0&autoplay=1&playsinline=1&enablejsapi=1&origin=' +
              encodeURIComponent(window.location.origin) +
              '" allow="autoplay; encrypted-media" allowfullscreen playsinline></iframe></div>';
            embedArea.style.display = 'block';
          }
        }
      }

    } else if (activePlatform === 'udio') {
      // Re-populate Udio link
      var track2 = _getTrack(activeTrackId);
      if (track2) {
        var info2 = _getTrackPlatform(track2);
        var udioUrl = info2.url || ('https://www.udio.com/songs/' + (info2.udioId || ''));
        var embedArea2 = row.querySelector('.track-embed-area');
        if (embedArea2) {
          embedArea2.innerHTML =
            '<a href="' + sanitizeAttr(udioUrl) + '" target="_blank" rel="noopener noreferrer" ' +
            'style="display:flex;align-items:center;justify-content:center;gap:8px;height:48px;' +
            'background:var(--surface-2);border-radius:8px;color:#818cf8;text-decoration:none;' +
            'font-weight:600;font-size:.82rem;transition:background 0.2s;">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="#818cf8">' +
            '<polygon points="6 3 20 12 6 21 6 3"/></svg>Listen on Udio \u2197</a>';
          embedArea2.style.display = 'block';
        }
      }
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

    if (VMA && VMA.mainPage && typeof VMA.mainPage.locateTrack === 'function') {
      VMA.mainPage.locateTrack();
      return;
    }

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
    restorePlayingRow: restorePlayingRow,
    init: init
  };
})();
