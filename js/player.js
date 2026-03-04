/* ═══════════════════════════════════════════════════════════════════
 *  VMAPlayer v28 — Platform-specific playback engine
 *
 *  YouTube    → visible inline iframe in track-row embed-area
 *  Suno       → hidden iframe on body (1px, opacity 0.01, autoplay)
 *               iOS: two-phase (full iframe → shrink + EQ)
 *  SoundCloud → popup overlay (fixed DOM element, NOT window.open)
 *               auto-minimize after 6s; iOS: two-phase in embed-area
 *  Udio       → popup overlay with /embed/ iframe (NOT /songs/)
 *               auto-minimize after 6s; iOS: two-phase in embed-area
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

  // ─── Udio popup state ───
  var udioContainer = null;
  var udioState = 'closed';

  // ─── SoundCloud popup state ───
  var scContainer = null;
  var scState = 'closed';

  // ─── iOS two-phase state ───
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

  function _eqOverlayHTML(platform) {
    var cls = platform === 'soundcloud' ? 'embed-eq sc' :
              platform === 'udio' ? 'embed-eq udio' : 'embed-eq';
    var label = platform === 'soundcloud' ? 'Playing on SoundCloud' :
                platform === 'udio' ? 'Playing on Udio' : 'Now Playing';
    return '<div class="' + cls + '"><span></span><span></span><span></span><span></span>' +
           '<span class="embed-eq-label">' + label + '</span></div>';
  }


  // ═══════════════════════════════════════════════════════════════
  //  UDIO POPUP SYSTEM (CSS-only toggle, iframe never moves)
  //  Fixed-position DOM overlay — NOT a browser window.open popup
  //  Uses /embed/ URL (NOT /songs/) for iframe embedding
  // ═══════════════════════════════════════════════════════════════

  function createUdioContainer() {
    if (udioContainer) return;
    udioContainer = document.createElement('div');
    udioContainer.id = 'udio-container';
    udioContainer.innerHTML =
      '<div id="udio-backdrop"></div>' +
      '<div id="udio-wrapper">' +
        '<div class="udio-hdr">' +
          '<div class="udio-hdr-badge"><span class="udio-hdr-dot"></span> UDIO</div>' +
          '<div class="udio-hdr-title"></div>' +
          '<div class="udio-hdr-btns">' +
            '<button class="udio-hdr-btn" id="udioMinBtn" title="Minimize \u2014 keep playing" aria-label="Minimize player">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>' +
            '</button>' +
            '<button class="udio-hdr-btn" id="udioCloseBtn" title="Stop &amp; close" aria-label="Stop and close player">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div id="udio-iframe-box"></div>' +
        '<div class="udio-hint">Press play, then minimize \u25BE to keep listening</div>' +
      '</div>';
    document.body.appendChild(udioContainer);
    document.getElementById('udioMinBtn').addEventListener('click', minimizeUdio);
    document.getElementById('udioCloseBtn').addEventListener('click', stopTrack);
    document.getElementById('udio-backdrop').addEventListener('click', minimizeUdio);
  }

  function openUdioPlayer(udioId, trackTitle) {
    createUdioContainer();
    udioContainer.style.display = '';

    // CRITICAL: use /embed/ URL — NOT /songs/ (which returns X-Frame-Options: DENY)
    var box = document.getElementById('udio-iframe-box');
    var newSrc = 'https://www.udio.com/embed/' + udioId;

    var existing = box.querySelector('iframe');
    if (!existing || existing.src !== newSrc) {
      box.innerHTML = '<iframe src="' + newSrc + '" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:none;"></iframe>';
    }

    udioContainer.querySelector('.udio-hdr-title').textContent = trackTitle || 'Udio Track';
    udioContainer.className = 'udio-popup';
    udioState = 'popup';

    // Auto-minimize: detect when user clicks play (focus goes to iframe)
    function onIframeClick() {
      if (udioState === 'popup') {
        clearTimeout(window._udioAutoMin);
        setTimeout(minimizeUdio, 500);
      }
      window.removeEventListener('blur', onIframeClick);
    }
    window.removeEventListener('blur', window._udioBlurHandler);
    window._udioBlurHandler = onIframeClick;
    window.addEventListener('blur', onIframeClick);

    // Also auto-minimize after 6s in case user already pressed play
    clearTimeout(window._udioAutoMin);
    window._udioAutoMin = setTimeout(function () {
      if (udioState === 'popup') minimizeUdio();
    }, 6000);
  }

  function minimizeUdio() {
    if (!udioContainer || udioState === 'minimized') return;
    udioContainer.className = 'udio-minimized';
    udioState = 'minimized';
  }

  function expandUdio() {
    if (!udioContainer || udioState !== 'minimized') return;
    udioContainer.className = 'udio-popup';
    udioState = 'popup';
  }

  function destroyUdioPlayer() {
    // Always query DOM directly — don't trust cached ref
    var el = udioContainer || document.getElementById('udio-container');
    if (el) {
      el.querySelectorAll('iframe').forEach(function (f) {
        try { f.src = 'about:blank'; } catch (e) {}
        f.remove();
      });
      var box = document.getElementById('udio-iframe-box');
      if (box) box.innerHTML = '';
      el.style.display = 'none';
      el.className = 'udio-closed';
      udioState = 'closed';
    }
    clearTimeout(window._udioAutoMin);
    window.removeEventListener('blur', window._udioBlurHandler);
  }


  // ═══════════════════════════════════════════════════════════════
  //  SOUNDCLOUD POPUP SYSTEM
  //  Fixed-position DOM overlay — NOT a browser window.open popup
  // ═══════════════════════════════════════════════════════════════

  function createScContainer() {
    if (scContainer) return;
    scContainer = document.createElement('div');
    scContainer.id = 'sc-container';
    scContainer.innerHTML =
      '<div id="sc-backdrop"></div>' +
      '<div id="sc-wrapper">' +
        '<div class="sc-hdr">' +
          '<div class="sc-hdr-badge"><span class="sc-hdr-dot"></span> SOUNDCLOUD</div>' +
          '<div class="sc-hdr-title"></div>' +
          '<div class="sc-hdr-btns">' +
            '<button class="sc-hdr-btn" id="scMinBtn" title="Minimize \u2014 keep playing" aria-label="Minimize">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>' +
            '</button>' +
            '<button class="sc-hdr-btn" id="scCloseBtn" title="Stop &amp; close" aria-label="Stop">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div id="sc-iframe-box"></div>' +
        '<div class="sc-hint">Press play, then minimize \u25BE to keep listening</div>' +
      '</div>';
    document.body.appendChild(scContainer);
    document.getElementById('scMinBtn').addEventListener('click', minimizeSc);
    document.getElementById('scCloseBtn').addEventListener('click', stopTrack);
    document.getElementById('sc-backdrop').addEventListener('click', minimizeSc);
  }

  function openSoundCloudPlayer(scUrl, trackTitle) {
    createScContainer();
    scContainer.style.display = '';
    var box = document.getElementById('sc-iframe-box');
    var embedSrc = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(scUrl) +
      '&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&show_user=true' +
      '&show_reposts=false&show_teaser=false&visual=true';
    box.innerHTML = '<iframe src="' + embedSrc + '" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:none;" scrolling="no"></iframe>';
    scContainer.querySelector('.sc-hdr-title').textContent = trackTitle || 'SoundCloud Track';
    scContainer.className = 'sc-popup';
    scState = 'popup';

    // Auto-minimize after 6s or blur
    clearTimeout(window._scAutoMin);
    window._scAutoMin = setTimeout(function () {
      if (scState === 'popup') minimizeSc();
    }, 6000);

    function onBlur() {
      if (scState === 'popup') {
        clearTimeout(window._scAutoMin);
        setTimeout(minimizeSc, 500);
      }
      window.removeEventListener('blur', onBlur);
    }
    window.removeEventListener('blur', window._scBlurHandler);
    window._scBlurHandler = onBlur;
    window.addEventListener('blur', onBlur);
  }

  function minimizeSc() {
    if (!scContainer || scState === 'minimized') return;
    scContainer.className = 'sc-minimized';
    scState = 'minimized';
  }

  function expandSc() {
    if (!scContainer || scState !== 'minimized') return;
    scContainer.className = 'sc-popup';
    scState = 'popup';
  }

  function destroySc() {
    // Always query DOM directly — don't trust cached ref
    var el = scContainer || document.getElementById('sc-container');
    if (el) {
      el.querySelectorAll('iframe').forEach(function (f) {
        try { f.src = 'about:blank'; } catch (e) {}
        f.remove();
      });
      var box = document.getElementById('sc-iframe-box');
      if (box) box.innerHTML = '';
      el.style.display = 'none';
      el.className = 'sc-closed';
      scState = 'closed';
    }
    clearTimeout(window._scAutoMin);
    window.removeEventListener('blur', window._scBlurHandler);
  }


  // ═══════════════════════════════════════════════════════════════
  //  iOS TWO-PHASE SYSTEM
  //  Phase 1: full-size iframe in embed-area — user taps play
  //  Phase 2: shrink iframe to 1px (NEVER move in DOM) + EQ overlay
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

    // Shrink iframe wrapper to 1px — stays in same DOM position
    var iframeWrap = embedArea.querySelector('.ios-embed-wrap');
    if (iframeWrap) {
      iframeWrap.style.height = '1px';
      iframeWrap.style.opacity = '0.01';
      iframeWrap.style.overflow = 'hidden';
      iframeWrap.style.pointerEvents = 'none';
    }

    // Hide hint and stop button
    var hint = embedArea.querySelector('[id^="ios-hint-"]');
    if (hint) hint.style.display = 'none';
    var stopBtn = embedArea.querySelector('.ios-stop-btn');
    if (stopBtn) stopBtn.style.display = 'none';

    // Add EQ overlay (after the hidden iframe, still in embed-area)
    var eqDiv = document.createElement('div');
    eqDiv.className = activePlatform === 'soundcloud' ? 'embed-eq sc' :
                      activePlatform === 'udio' ? 'embed-eq udio' : 'embed-eq';
    var label = activePlatform === 'soundcloud' ? 'Playing on SoundCloud' :
                activePlatform === 'udio' ? 'Playing on Udio' : 'Now Playing';
    eqDiv.innerHTML = '<span></span><span></span><span></span><span></span><span class="embed-eq-label">' + label + '</span>';
    embedArea.appendChild(eqDiv);

    // Show EQ bars in track row
    row.classList.add('eq-active');
  }

  function _startIosPhase1(trackId) {
    _iosBlurFn = function () {
      setTimeout(function () { _iosPhase2(trackId); }, 2500);
    };
    window.addEventListener('blur', _iosBlurFn);
    _iosTimer = setTimeout(function () { _iosPhase2(trackId); }, 10000);
  }

  function _playIos(track, info, row, embedArea) {
    if (!embedArea) return;

    var iframeSrc = '';
    var wrapClass = 'suno';

    if (info.platform === 'suno' && info.sunoId) {
      iframeSrc = 'https://suno.com/embed/' + info.sunoId;
      wrapClass = 'suno';
    } else if (info.platform === 'soundcloud') {
      var scUrl = info.url || track.embed_url || '';
      if (scUrl.includes('on.soundcloud.com')) {
        // Short link — can't embed
        embedArea.innerHTML =
          '<a href="' + sanitizeAttr(scUrl) + '" target="_blank" rel="noopener noreferrer" ' +
          'style="display:flex;align-items:center;justify-content:center;gap:8px;height:48px;' +
          'background:var(--surface-2);border-radius:8px;color:#ff5500;text-decoration:none;' +
          'font-weight:600;font-size:.82rem;">Listen on SoundCloud \u2197</a>';
        embedArea.style.display = 'block';
        return;
      }
      iframeSrc = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(scUrl) +
        '&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true' +
        '&show_reposts=false&show_teaser=false&visual=true';
      wrapClass = 'soundcloud';
    } else if (info.platform === 'udio' && info.udioId) {
      iframeSrc = 'https://www.udio.com/embed/' + info.udioId;
      wrapClass = 'udio';
    }

    if (!iframeSrc) return;

    var uid = activeTrackId;

    // Phase 1: full-size iframe in embed-area
    embedArea.innerHTML =
      '<div id="ios-live-player-' + uid + '" style="position:relative;">' +
        '<div class="ios-embed-wrap ' + wrapClass + '" id="ios-iframe-wrap-' + uid + '" ' +
          'style="position:relative;transition:height 0.4s ease,opacity 0.3s ease;">' +
          '<iframe src="' + iframeSrc + '" allow="autoplay; encrypted-media" ' +
            'style="width:100%;height:100%;border:none;" scrolling="no" playsinline></iframe>' +
        '</div>' +
        '<div style="position:absolute;bottom:0;left:0;right:0;padding:8px 12px;' +
          'background:linear-gradient(transparent,rgba(0,0,0,0.9));pointer-events:none;' +
          'text-align:center;" id="ios-hint-' + uid + '">' +
          '<span style="font-size:0.68rem;font-weight:700;color:rgba(255,255,255,0.85);' +
            'letter-spacing:0.5px;">\u25B6 TAP PLAY ABOVE</span>' +
        '</div>' +
        '<button class="ios-stop-btn" data-action="play" data-track-id="' + uid + '" aria-label="Stop">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
            '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>' +
          '</svg>' +
        '</button>' +
      '</div>';
    embedArea.style.display = 'block';

    // Show stop button in track row
    var btn = row.querySelector('.track-play');
    if (btn) {
      btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
      btn.setAttribute('aria-label', 'Stop');
    }

    _startIosPhase1(uid);
  }


  // ═══════════════════════════════════════════════════════════════
  //  STOP — kill all playback, clean up DOM
  // ═══════════════════════════════════════════════════════════════

  function stopTrack() {
    activeTrackId = null;
    activePlatform = null;

    // Clear iOS listeners
    _clearIos();

    // Destroy Udio popup iframe
    destroyUdioPlayer();

    // Destroy SoundCloud popup iframe
    destroySc();

    // Remove hidden-player divs (Suno hidden iframes on body)
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

    // Kill stray audio iframes anywhere on the page (skip page-frame iframe)
    document.querySelectorAll('iframe').forEach(function (f) {
      if (f.closest('.page-frame')) return;
      var src = f.src || '';
      if (src === '' || src === 'about:blank') return;
      if (src.includes('suno.com') || src.includes('youtube.com') ||
          src.includes('soundcloud.com') || src.includes('youtu.be') ||
          src.includes('udio.com')) {
        try { f.src = 'about:blank'; } catch (e) {}
      }
    });

    // Kill stray audio/video
    document.querySelectorAll('audio, video').forEach(function (el) {
      try { el.pause(); el.src = ''; } catch (e) {}
    });

    // Hide player bar + remove any duplicates
    document.querySelectorAll('.player-bar').forEach(function (bar) {
      bar.classList.remove('active', 'playing', 'udio-active', 'sc-active');
    });
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

    // Stop all current playback and clean up
    stopTrack();

    var track = _getTrack(trackId);
    if (!track) return;
    var row = document.querySelector('.track-row[data-track-id="' + trackId + '"]');
    if (!row) return;
    var info = _getTrackPlatform(track);

    activeTrackId = trackId;
    activePlatform = info.platform;
    row.classList.add('playing');

    var embedArea = row.querySelector('.track-embed-area');

    // ── iOS: two-phase for Suno, SoundCloud, Udio ──
    if (isIOS && info.platform !== 'youtube') {
      _playIos(track, info, row, embedArea);
      _activateBar(track, info);
      _updateNavTargets();
      if (typeof gtag === 'function') gtag('event', 'play', { track_id: trackId, platform: info.platform });
      return;
    }

    // ── YOUTUBE: visible inline iframe (all platforms) ──
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

    // ── SUNO: hidden iframe on body + EQ overlay in row ──
    } else if (info.platform === 'suno' && info.sunoId) {
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

    // ── SOUNDCLOUD: popup overlay + EQ overlay in row ──
    } else if (info.platform === 'soundcloud') {
      var scUrl = info.url || track.embed_url || '';
      if (scUrl.includes('on.soundcloud.com')) {
        // Short link — can't embed, show link
        if (embedArea) {
          embedArea.innerHTML =
            '<a href="' + sanitizeAttr(scUrl) + '" target="_blank" rel="noopener noreferrer" ' +
            'style="display:flex;align-items:center;justify-content:center;gap:8px;height:48px;' +
            'background:var(--surface-2);border-radius:8px;color:#ff5500;text-decoration:none;' +
            'font-weight:600;font-size:.82rem;">Listen on SoundCloud \u2197</a>';
          embedArea.style.display = 'block';
        }
      } else {
        row.classList.add('eq-active');
        openSoundCloudPlayer(scUrl, track.title);
        if (embedArea) {
          embedArea.innerHTML = _eqOverlayHTML('soundcloud');
          embedArea.style.display = 'block';
        }
      }

    // ── UDIO: popup overlay + EQ overlay in row ──
    } else if (info.platform === 'udio' && info.udioId) {
      row.classList.add('eq-active');
      openUdioPlayer(info.udioId, track.title);
      if (embedArea) {
        embedArea.innerHTML = _eqOverlayHTML('udio');
        embedArea.style.display = 'block';
      }

    // ── UNKNOWN: link out ──
    } else {
      var fallbackUrl = track.embed_url || (track.yt_id ? 'https://www.youtube.com/watch?v=' + track.yt_id : '');
      if (embedArea) {
        if (fallbackUrl) {
          embedArea.innerHTML =
            '<a href="' + sanitizeAttr(fallbackUrl) + '" target="_blank" rel="noopener noreferrer" ' +
            'style="display:flex;align-items:center;justify-content:center;gap:8px;height:48px;' +
            'background:var(--surface-2);border-radius:8px;color:var(--accent);text-decoration:none;' +
            'font-weight:600;font-size:.82rem;">Listen \u2197</a>';
        } else {
          embedArea.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:48px;' +
            'background:var(--surface-2);border-radius:8px;color:var(--muted);font-size:.82rem;">' +
            'No playback source available</div>';
        }
        embedArea.style.display = 'block';
      }
    }

    _activateBar(track, info);
    _updateNavTargets();
    if (typeof gtag === 'function') gtag('event', 'play', { track_id: trackId, platform: info.platform });
  }


  // ═══════════════════════════════════════════════════════════════
  //  PLAYER BAR
  // ═══════════════════════════════════════════════════════════════

  function _activateBar(track, info) {
    var genre = VMA && typeof VMA.resolveGenre === 'function' ? VMA.resolveGenre(track.genre) : (track.genre || '');
    var meta = [track.tool, genre].filter(Boolean).join(' \u00B7 ');

    playerTitle.textContent = track.title || 'Now Playing';
    playerBar.classList.remove('udio-active', 'sc-active');

    if (info.platform === 'udio') {
      playerMeta.textContent = meta ? meta + ' \u00B7 Udio' : 'Udio';
      playerBar.classList.add('active', 'playing', 'udio-active');
    } else if (info.platform === 'soundcloud') {
      playerMeta.textContent = meta ? meta + ' \u00B7 SoundCloud' : 'SoundCloud';
      playerBar.classList.add('active', 'playing', 'sc-active');
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
  //  RESTORE PLAYING ROW — after track list re-render
  // ═══════════════════════════════════════════════════════════════

  function restorePlayingRow() {
    if (activeTrackId === null) return;
    var row = document.querySelector('.track-row[data-track-id="' + activeTrackId + '"]');
    if (!row) return;

    if (activePlatform === 'suno') {
      var hidden = document.getElementById('hidden-player-' + activeTrackId);
      if (hidden) {
        row.classList.add('eq-active');
        var ea = row.querySelector('.track-embed-area');
        if (ea) { ea.innerHTML = _eqOverlayHTML('suno'); ea.style.display = 'block'; }
      }
    } else if (activePlatform === 'soundcloud') {
      if (scContainer && scState !== 'closed') {
        row.classList.add('eq-active');
        var ea2 = row.querySelector('.track-embed-area');
        if (ea2) { ea2.innerHTML = _eqOverlayHTML('soundcloud'); ea2.style.display = 'block'; }
      }
    } else if (activePlatform === 'udio') {
      if (udioContainer && udioState !== 'closed') {
        row.classList.add('eq-active');
        var ea3 = row.querySelector('.track-embed-area');
        if (ea3) { ea3.innerHTML = _eqOverlayHTML('udio'); ea3.style.display = 'block'; }
      }
    } else if (activePlatform === 'youtube') {
      var btn = row.querySelector('.track-play');
      if (btn) {
        btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
        btn.setAttribute('aria-label', 'Stop');
      }
      var t = _getTrack(activeTrackId);
      if (t) {
        var inf = _getTrackPlatform(t);
        if (inf.videoId) {
          var ea4 = row.querySelector('.track-embed-area');
          if (ea4) {
            ea4.innerHTML =
              '<div class="embed-yt"><iframe src="https://www.youtube.com/embed/' + inf.videoId +
              '?rel=0&autoplay=1&playsinline=1&enablejsapi=1&origin=' +
              encodeURIComponent(window.location.origin) +
              '" allow="autoplay; encrypted-media" allowfullscreen playsinline></iframe></div>';
            ea4.style.display = 'block';
          }
        }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  NAV TARGETS — replaced by page-frame system (no-op)
  // ═══════════════════════════════════════════════════════════════

  function _updateNavTargets() {
    // Page-frame link interceptor in index.html handles navigation
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

    // Udio expand button in player bar
    var udioExp = document.getElementById('udioExpandBtn');
    if (udioExp) udioExp.addEventListener('click', expandUdio);

    // SoundCloud expand button in player bar
    var scExp = document.getElementById('scExpandBtn');
    if (scExp) scExp.addEventListener('click', expandSc);
  }


  // ═══════════════════════════════════════════════════════════════
  //  KILL ALL PLAYBACK — nuclear option for list re-renders
  // ═══════════════════════════════════════════════════════════════

  function killAllPlayback() {
    stopTrack();
    destroyUdioPlayer();
    destroySc();
    document.querySelectorAll('[id^="hidden-player-"]').forEach(function (el) { el.remove(); });
    document.querySelectorAll('iframe').forEach(function (f) {
      if (f.closest('.page-frame')) return;
      var src = f.src || '';
      if (src.includes('suno') || src.includes('udio') || src.includes('youtube') || src.includes('soundcloud')) {
        try { f.src = 'about:blank'; } catch (e) {}
      }
    });
    if (playerBar) playerBar.classList.remove('active', 'playing', 'udio-active', 'sc-active');
    document.body.classList.remove('player-active');
    var thumbEl = document.getElementById('playerThumb');
    if (thumbEl) thumbEl.style.display = 'none';
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
    killAllPlayback: killAllPlayback,
    closePlayer: stopTrack,
    locateTrack: locateTrack,
    restorePlayingRow: restorePlayingRow,
    expandUdio: expandUdio,
    expandSc: expandSc,
    init: init
  };
})();
