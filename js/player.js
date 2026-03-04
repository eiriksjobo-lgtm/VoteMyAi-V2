/* ═══════════════════════════════════════════════════════════════════
 *  VMAPlayer — Unified persistent player module for VoteMyAI SPA
 *
 *  Lives OUTSIDE #spa-content so playback survives navigation.
 *  Handles: browse-card play, playlist-row play, Udio popup,
 *           SoundCloud popup, page-frame overlay, nav survival.
 * ═══════════════════════════════════════════════════════════════════ */

window.VMAPlayer = (function () {
  'use strict';

  const VMA = window.VMA; // shared namespace from app.js

  // ─── iOS detection ───
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ─── Sanitisation helpers ───
  const _sanitizeEl = document.createElement('div');
  function sanitize(str) {
    if (!str) return '';
    _sanitizeEl.textContent = str;
    return _sanitizeEl.innerHTML;
  }
  function sanitizeAttr(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ─── DOM refs (set in init()) ───
  let playerBar = null;
  let playerTitle = null;
  let playerMeta = null;

  // ─── Player state ───
  let activePlayerTrackId = null;
  let activePlayerPlatform = null;
  let activeBrowseUid = null;
  let activeBrowseTrackId = null;
  let activeTrackId = null; // playlist page list-play

  // ─── Udio state ───
  let udioState = 'closed'; // closed | popup | minimized
  let udioContainer = null;

  // ─── SoundCloud state ───
  let scState = 'closed';
  let scContainer = null;

  // ─── Expand buttons (created in init) ───
  let udioExpandBtn = null;
  let scExpandBtn = null;


  // ═══════════════════════════════════════════════════════════════
  //  1. PLAYER BAR
  // ═══════════════════════════════════════════════════════════════

  /**
   * Show the persistent player bar.
   * @param {string|number} trackId
   * @param {string} title   — track title
   * @param {string} meta    — e.g. "Suno · Pop"
   * @param {string} platform
   */
  function activatePlayerBar(trackId, title, meta, platform) {
    activePlayerTrackId = trackId;
    activePlayerPlatform = platform;
    playerTitle.textContent = title || 'Now Playing';

    // Clear platform-specific classes first
    playerBar.classList.remove('udio-active', 'sc-active', 'udio-waiting');

    if (platform === 'udio') {
      playerMeta.textContent = (meta ? meta + ' \u00B7 ' : '') + 'Playing in embed \u25B2';
      playerBar.classList.add('active', 'udio-active');
      playerBar.classList.remove('playing'); // No EQ for Udio — can't detect playback state
    } else {
      playerMeta.textContent = meta || '';
      playerBar.classList.add('active', 'playing');
      if (platform === 'soundcloud') playerBar.classList.add('sc-active');
    }
    document.body.classList.add('player-active');

    // Set thumbnail
    var track = _getTrack(trackId);
    var thumbUrl = _getThumb(track);
    var thumbEl = document.getElementById('playerThumb');
    if (thumbEl) {
      if (thumbUrl) {
        thumbEl.src = thumbUrl;
        thumbEl.style.display = '';
      } else {
        thumbEl.style.display = 'none';
      }
    }

    if (typeof gtag === 'function') {
      gtag('event', 'play_bar', { track_id: trackId, platform: platform });
    }

    _updateNavTargets();
  }

  /**
   * Nuclear stop — kill ALL playback everywhere.
   * Single source of truth. Called before starting any new playback.
   * Does NOT hide the player bar (caller does that or re-activates it).
   */
  function _stopAllPlayback() {
    // 1. Browse card (restore thumbnail if card still in DOM)
    if (activeBrowseUid) browseStop(activeBrowseUid);
    activeBrowseUid = null;
    activeBrowseTrackId = null;

    // 2. Kill Udio popup (always — don't gate on state)
    destroyUdioPlayer();

    // 3. Kill SoundCloud popup (always)
    destroySc();

    // 4. Playlist inline track — clean up rows + iframes
    activeTrackId = null;
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
          try { f.src = 'about:blank'; } catch (e) { /* ignore */ }
        });
        embedArea.innerHTML = '';
        embedArea.style.display = 'none';
        embedArea.style.height = '';
        embedArea.style.overflow = '';
        embedArea.style.padding = '';
        embedArea.style.transition = '';
      }
    });

    // 5. Hidden players (Suno, etc.)
    document.querySelectorAll('[id^="hidden-player-"]').forEach(function (el) {
      el.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
      el.remove();
    });

    // 6. Preserved players from navigation
    document.querySelectorAll('[id^="preserved-"]').forEach(function (el) {
      el.querySelectorAll('iframe').forEach(function (f) {
        try { f.src = 'about:blank'; } catch (e) { /* ignore */ }
      });
      el.remove();
    });

    // 7. iOS players
    document.querySelectorAll('[id^="ios-live-player-"], [id^="ios-mini-player"], #iosPlayerEmbed, .ios-embed-wrap').forEach(function (el) {
      el.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
      if (el.id) el.remove();
    });

    // 8. Persistent-media container — nuke everything
    var pm = document.getElementById('persistent-media');
    if (pm) {
      pm.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
      pm.innerHTML = '';
    }

    // 9. SCORCHED EARTH — kill any remaining audio iframes anywhere in the document
    //    Only spare the page-frame overlay iframe (iOS navigation).
    document.querySelectorAll('iframe').forEach(function (f) {
      if (f.closest('#pageFrame')) return;
      var src = f.src || '';
      if (src === '' || src === 'about:blank') return;
      // Kill any iframe with audio/embed content
      if (src.includes('suno.com') || src.includes('udio.com') ||
          src.includes('soundcloud.com') || src.includes('youtube.com') ||
          src.includes('youtu.be')) {
        try { f.src = 'about:blank'; } catch (e) { /* ignore */ }
      }
    });

    // 10. Kill any stray <audio> or <video> elements
    document.querySelectorAll('audio, video').forEach(function (el) {
      try { el.pause(); el.src = ''; } catch (e) { /* ignore */ }
    });

    // 11. Clear navigation saved state
    _savedState = null;

    // 12. Clear player embed area + Udio timers
    var pEmbed = document.getElementById('playerEmbed');
    if (pEmbed) { pEmbed.innerHTML = ''; }
    playerBar.classList.remove('has-embed');
    clearTimeout(window._udioCollapseTimer);
    window.removeEventListener('blur', window._udioBlurHandler);

    // 13. Reset bar platform classes (NOT visibility — caller handles that)
    playerBar.classList.remove('udio-active', 'sc-active', 'udio-waiting');
  }

  /**
   * Stop everything and hide the player bar.
   */
  function closePlayer() {
    _stopAllPlayback();
    playerBar.classList.remove('active', 'playing', 'udio-waiting', 'has-embed', 'udio-active', 'sc-active');
    document.body.classList.remove('player-active');
    activePlayerTrackId = null;
    activePlayerPlatform = null;
    // Hide thumbnail
    var thumbEl = document.getElementById('playerThumb');
    if (thumbEl) { thumbEl.style.display = 'none'; }
    _updateNavTargets();
    closePageFrame();
  }

  /**
   * Scroll to the currently-playing browse card (home) or track row (playlist).
   */
  function scrollToActiveCard() {
    if (activeBrowseUid) {
      var activeCard = document.getElementById(activeBrowseUid);
      if (!activeCard) return;
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var row = activeCard.closest('.browse-row-scroll');
      if (row) {
        var cardLeft = activeCard.offsetLeft;
        var rowWidth = row.clientWidth;
        row.scrollTo({
          left: cardLeft - rowWidth / 2 + activeCard.clientWidth / 2,
          behavior: 'smooth'
        });
      }
      // Flash highlight
      activeCard.style.transition = 'box-shadow 0.3s';
      activeCard.style.boxShadow =
        '0 0 0 3px var(--accent), 0 0 30px rgba(232,255,71,0.3)';
      setTimeout(function () {
        activeCard.style.boxShadow = '';
        setTimeout(function () { activeCard.style.transition = ''; }, 300);
      }, 2000);
      return;
    }
    // Playlist page — scroll to active track row
    if (activeTrackId !== null) {
      var trackRow = document.querySelector(
        '.track-row[data-track-id="' + activeTrackId + '"]'
      );
      if (trackRow) {
        trackRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        trackRow.style.boxShadow =
          '0 0 0 2px var(--accent), 0 8px 32px rgba(232,255,71,0.15)';
        setTimeout(function () { trackRow.style.boxShadow = ''; }, 2000);
      }
    }
  }

  /**
   * Locate the active track in whichever page is currently showing.
   * On the playlist page this may expand displayCount to reveal hidden rows.
   */
  function locateTrack() {
    var frame = document.getElementById('pageFrame');
    if (frame && frame.classList.contains('active')) {
      closePageFrame();
      return;
    }

    // Delegate to main page module (handles genre switching + scroll)
    if (VMA && VMA.mainPage && typeof VMA.mainPage.locateTrack === 'function') {
      VMA.mainPage.locateTrack();
      return;
    }

    // Fallback: direct scroll
    if (activeTrackId !== null) {
      var trackRow = document.querySelector(
        '.track-row[data-track-id="' + activeTrackId + '"]'
      );
      if (trackRow) {
        trackRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        trackRow.style.boxShadow =
          '0 0 0 2px var(--accent), 0 8px 32px rgba(232,255,71,0.15)';
        setTimeout(function () { trackRow.style.boxShadow = ''; }, 2000);
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  //  2. BROWSE CARD PLAY (home page)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Helper — resolve a track object by ID.
   * Delegates to VMA.getTrack or VMA.findTrackById depending on context.
   */
  function _getTrack(id) {
    if (VMA && typeof VMA.getTrack === 'function') return VMA.getTrack(id);
    if (VMA && typeof VMA.findTrackById === 'function') return VMA.findTrackById(id);
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

  /**
   * Helper — get embed info for a track (index/home page version).
   */
  function _getEmbedHtml(track) {
    if (VMA && typeof VMA.getEmbedHtml === 'function') return VMA.getEmbedHtml(track);
    return { platform: 'unknown', embedHtml: '' };
  }

  /**
   * Helper — get platform info for a track (playlist page version).
   * Returns { platform, videoId?, sunoId?, udioId?, url?, isShort? }
   */
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
        result = sunoMatch
          ? { platform: 'suno', sunoId: sunoMatch[1], url: url }
          : { platform: 'suno', url: url };
      }
      else if (url.includes('udio.com')) {
        var udioUuid = url.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
        if (udioUuid) { result = { platform: 'udio', udioId: udioUuid[0], url: url }; }
        else {
          var udioSlug = url.match(/udio\.com\/(?:songs|embed)\/([a-zA-Z0-9_-]+)/);
          result = udioSlug
            ? { platform: 'udio', udioId: udioSlug[1], url: url }
            : { platform: 'udio', url: url };
        }
      }
    }
    if (!result && track.yt_id) result = { platform: 'youtube', videoId: track.yt_id };
    if (!result) result = { platform: 'unknown', url: url };
    console.log('[VMAPlayer] platform:', result.platform, '| id:', track.id, '| url:', url || '(none)');
    if (result.platform === 'unknown') {
      console.warn('[VMAPlayer] UNKNOWN PLATFORM — track:', track.id, 'embed_url:', url, 'yt_id:', track.yt_id, 'tool:', track.tool);
    }
    return result;
  }

  /**
   * Play a track from a browse card on the home page.
   */
  function browsePlay(uid, trackId) {
    // Toggle: if already playing this uid, stop everything
    if (activeBrowseUid === uid) {
      closePlayer();
      return;
    }

    var track = _getTrack(trackId);
    if (!track) {
      console.warn('[VMAPlayer] browsePlay: track not found for id=' + trackId);
      return;
    }

    // ── STOP ALL PLAYBACK first (single source of truth) ──
    _stopAllPlayback();

    var card = document.getElementById(uid);
    if (!card) {
      console.warn('[VMAPlayer] browsePlay: card not found for uid=' + uid);
      return;
    }
    var thumbContainer = card.querySelector('.browse-card-thumb');
    if (!thumbContainer) return;

    var embed = _getEmbedHtml(track);
    var embedHtml = embed.embedHtml;

    // ══════════════════════════════════════════════════════
    // iOS/iPadOS — TWO-PHASE PLAY SYSTEM
    // Safari kills audio when an iframe is moved in the DOM.
    // Phase 1: Show embed full size for user to tap play.
    // Phase 2: Shrink to 1px, overlay EQ "Now Playing".
    // ══════════════════════════════════════════════════════
    if (isIOS) {
      thumbContainer.dataset.originalHtml = thumbContainer.innerHTML;

      var iframeSrc = '';
      var eqColorClass = 'accent';
      var platformLabel = track.tool || '';
      var wrapClass = 'suno';

      if (embed.platform === 'soundcloud') {
        var scUrl = track.embed_url || '';
        iframeSrc =
          'https://w.soundcloud.com/player/?url=' +
          encodeURIComponent(scUrl) +
          '&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true';
        eqColorClass = 'soundcloud';
        platformLabel = 'SoundCloud';
        wrapClass = 'soundcloud';
      } else if (embed.platform === 'udio') {
        var udioId = embed.udioId;
        if (udioId) iframeSrc = 'https://www.udio.com/songs/' + udioId;
        eqColorClass = 'udio';
        platformLabel = 'Udio';
        wrapClass = 'udio';
      } else if (embed.platform === 'youtube') {
        var ytMatch =
          (track.embed_url || '').match(
            /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([^&?\/#]+)/
          ) || [null, track.yt_id];
        if (ytMatch[1])
          iframeSrc =
            'https://www.youtube.com/embed/' +
            ytMatch[1] +
            '?rel=0&playsinline=1';
        platformLabel = 'YouTube';
        wrapClass = 'youtube';
      } else if (embed.platform === 'suno') {
        var sunoMatch = (track.embed_url || '').match(
          /suno\.com\/(?:song|embed)\/([a-f0-9-]{36})/
        );
        if (sunoMatch) iframeSrc = 'https://suno.com/embed/' + sunoMatch[1];
        platformLabel = track.tool || 'Suno';
        wrapClass = 'suno';
      }

      if (!iframeSrc) return;

      // ── PHASE 1: Show embed full size in the card ──
      thumbContainer.style.aspectRatio = 'auto';
      thumbContainer.style.overflow = 'visible';

      var eqSpinColor = eqColorClass === 'soundcloud' ? '#ff5500' : eqColorClass === 'udio' ? '#818cf8' : 'var(--accent)';

      thumbContainer.innerHTML =
        '<div id="ios-live-player-' + uid + '" style="position:relative;">' +
          '<div class="ios-embed-wrap ' + wrapClass + '" id="ios-iframe-wrap-' + uid + '" style="position:relative;transition:height 0.4s ease,opacity 0.3s ease;">' +
            '<iframe src="' + iframeSrc + '" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:none;" scrolling="no" playsinline></iframe>' +
          '</div>' +
          '<div class="embed-loading" id="ios-loading-' + uid + '" style="border-radius:0;">' +
            '<div style="text-align:center;">' +
              '<div class="embed-loading-spinner" style="border-top-color:' + eqSpinColor + ';"></div>' +
              '<div style="font-size:0.72rem;color:rgba(255,255,255,0.6);">Loading...</div>' +
            '</div>' +
          '</div>' +
          '<div style="position:absolute;bottom:0;left:0;right:0;padding:8px 12px;background:linear-gradient(transparent,rgba(0,0,0,0.9));pointer-events:none;text-align:center;display:none;" id="ios-hint-' + uid + '">' +
            '<span style="font-size:0.68rem;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:0.5px;">\u25B6 TAP PLAY ABOVE</span>' +
          '</div>' +
          '<button class="ios-stop-btn" data-action="browse-stop" data-uid="' + uid + '" data-track-id="' + trackId + '" aria-label="Stop">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' +
          '</button>' +
        '</div>';
      thumbContainer.removeAttribute('data-action');

      // Show hint + remove loading spinner when iframe is ready
      (function () {
        var iosIframe = thumbContainer.querySelector('iframe');
        var iosLoading = document.getElementById('ios-loading-' + uid);
        var iosHint = document.getElementById('ios-hint-' + uid);
        var _iosReady = false;
        function onIosReady() {
          if (_iosReady) return;
          _iosReady = true;
          if (iosLoading) iosLoading.remove();
          if (iosHint) iosHint.style.display = '';
        }
        if (iosIframe) iosIframe.addEventListener('load', onIosReady);
        setTimeout(onIosReady, 4000);
      })();

      card.classList.add('is-playing');
      activeBrowseUid = uid;
      activeBrowseTrackId = String(trackId);

      var metaStr =
        (embed.platform === 'soundcloud'
          ? 'SoundCloud'
          : embed.platform === 'udio'
          ? 'Udio'
          : platformLabel) +
        ' \u00B7 ' +
        (track.genre || '');
      activatePlayerBar(trackId, track.title || 'Now Playing', metaStr, embed.platform);

      // ── Transition to PHASE 2 (audio platforms only) ──
      // YouTube stays in Phase 1 — user watches video.
      // Udio stays in Phase 1 — iframe must stay visible or audio stops.
      if (embed.platform === 'youtube' || embed.platform === 'udio') return;

      var _iosPhase2Done = false;

      function iosPhase2() {
        if (_iosPhase2Done) return;
        _iosPhase2Done = true;
        clearTimeout(_iosPhase2Timer);
        window.removeEventListener('blur', _iosBlurToPhase2);

        var iframeWrap = document.getElementById('ios-iframe-wrap-' + uid);
        var livePlayer = document.getElementById('ios-live-player-' + uid);
        var hint = document.getElementById('ios-hint-' + uid);
        if (!iframeWrap || !livePlayer) return;

        iframeWrap.style.height = '1px';
        iframeWrap.style.opacity = '0.01';
        iframeWrap.style.overflow = 'hidden';
        iframeWrap.style.pointerEvents = 'none';

        if (hint) hint.style.display = 'none';

        var stopBtn = livePlayer.querySelector('.ios-stop-btn');
        if (stopBtn) stopBtn.style.display = 'none';

        var eqColor =
          eqColorClass === 'soundcloud'
            ? '#ff5500'
            : eqColorClass === 'udio'
            ? '#818cf8'
            : 'var(--accent)';
        var eqOverlay = document.createElement('div');
        eqOverlay.className = 'browse-now-playing';
        eqOverlay.setAttribute('data-action', 'browse-stop');
        eqOverlay.setAttribute('data-uid', uid);
        eqOverlay.setAttribute('data-track-id', trackId);
        eqOverlay.innerHTML =
          '<div class="bnp-bg"' +
          (embed.platform === 'soundcloud'
            ? ' style="background:linear-gradient(135deg, rgba(255,85,0,0.15) 0%, rgba(7,7,11,0.95) 60%);"'
            : embed.platform === 'udio'
            ? ' style="background:linear-gradient(135deg, rgba(129,140,248,0.15) 0%, rgba(7,7,11,0.95) 60%);"'
            : '') +
          '></div>' +
          '<div class="bnp-content">' +
            '<div class="bnp-eq"><span style="background:' + eqColor + ';"></span><span style="background:' + eqColor + ';"></span><span style="background:' + eqColor + ';"></span><span style="background:' + eqColor + ';"></span><span style="background:' + eqColor + ';"></span></div>' +
            '<div class="bnp-title" style="color:' + eqColor + ';">Now Playing</div>' +
            '<div class="bnp-track">' + sanitize(track.title) + '</div>' +
            '<div class="bnp-stop">Tap to stop</div>' +
          '</div>';

        livePlayer.style.position = 'relative';
        livePlayer.style.aspectRatio = '16/10';
        livePlayer.style.overflow = 'hidden';
        livePlayer.appendChild(eqOverlay);

        thumbContainer.style.aspectRatio = '16/10';
        thumbContainer.style.overflow = 'hidden';
      }

      function _iosBlurToPhase2() {
        setTimeout(iosPhase2, 2500);
      }
      window.addEventListener('blur', _iosBlurToPhase2);

      var _iosPhase2Timer = setTimeout(iosPhase2, 10000);
      return;
    }

    // ══════════════════════════════════════════════════════
    // Non-iOS: Original behaviour (hidden iframes, popups)
    // ══════════════════════════════════════════════════════

    // SoundCloud: inline iframe player (no new tabs, no popups)
    if (embed.platform === 'soundcloud') {
      var scUrl2 = track.embed_url || '';

      thumbContainer.dataset.originalHtml = thumbContainer.innerHTML;

      // Show loading state on card first
      thumbContainer.innerHTML =
        '<div class="browse-now-playing" data-action="browse-stop" data-uid="' + uid + '" data-track-id="' + trackId + '">' +
          '<div class="bnp-bg" style="background:linear-gradient(135deg, rgba(255,85,0,0.15) 0%, rgba(7,7,11,0.95) 60%);"></div>' +
          '<div class="bnp-content">' +
            '<div class="embed-loading-spinner" style="border-top-color:#ff5500;"></div>' +
            '<div class="bnp-title" style="color:#ff5500;">Loading...</div>' +
            '<div class="bnp-stop">Click to cancel</div>' +
          '</div>' +
        '</div>';
      thumbContainer.removeAttribute('data-action');

      // Open popup — transition card to "Now Playing" when iframe is ready
      openSoundCloudPlayer(scUrl2, track.title, function () {
        if (activeBrowseUid !== uid) return;
        var currentCard = document.getElementById(uid);
        if (!currentCard) return;
        var tc = currentCard.querySelector('.browse-card-thumb');
        if (!tc) return;
        tc.innerHTML =
          '<div class="browse-now-playing" data-action="browse-stop" data-uid="' + uid + '" data-track-id="' + trackId + '">' +
            '<div class="bnp-bg" style="background:linear-gradient(135deg, rgba(255,85,0,0.15) 0%, rgba(7,7,11,0.95) 60%);"></div>' +
            '<div class="bnp-content">' +
              '<div class="bnp-eq"><span style="background:#ff5500;"></span><span style="background:#ff5500;"></span><span style="background:#ff5500;"></span><span style="background:#ff5500;"></span><span style="background:#ff5500;"></span></div>' +
              '<div class="bnp-title" style="color:#ff5500;">Now Playing</div>' +
              '<div class="bnp-track">' + sanitize(track.title) + '</div>' +
              '<div class="bnp-stop">Click to stop</div>' +
            '</div>' +
          '</div>';
      });

      activeBrowseUid = uid;
      activeBrowseTrackId = String(trackId);
      card.classList.add('is-playing');
      activatePlayerBar(trackId, track.title || 'Now Playing', 'SoundCloud \u00B7 ' + (track.genre || ''), 'soundcloud');
      return;
    }

    // Udio: inline visible iframe (no popup, no hidden embed — Udio has no embed API)
    if (embed.platform === 'udio') {
      var udioIdVal = embed.udioId;
      if (udioIdVal) {
        thumbContainer.dataset.originalHtml = thumbContainer.innerHTML;
        var udioSrc = 'https://www.udio.com/songs/' + udioIdVal;
        thumbContainer.style.aspectRatio = 'auto';
        thumbContainer.innerHTML =
          '<div style="position:relative;">' +
            '<iframe src="' + udioSrc + '" ' +
            'style="width:100%;height:300px;border:none;border-radius:8px;" ' +
            'allow="autoplay; encrypted-media" playsinline></iframe>' +
            '<button class="ios-stop-btn" data-action="browse-stop" data-uid="' + uid + '" data-track-id="' + trackId + '" aria-label="Stop">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' +
            '</button>' +
          '</div>';
        thumbContainer.removeAttribute('data-action');

        activeBrowseUid = uid;
        activeBrowseTrackId = String(trackId);
        card.classList.add('is-playing');
        activatePlayerBar(trackId, track.title || 'Now Playing', 'Udio \u00B7 ' + (track.genre || ''), 'udio');
      }
      return;
    }

    // YouTube / Suno / other: autoplay embed
    if (embed.platform === 'youtube') {
      embedHtml = embedHtml.replace(/src="([^"]+)"/, function (m, src) {
        return 'src="' + src + (src.includes('?') ? '&' : '?') + 'autoplay=1"';
      });
    } else if (embed.platform === 'suno') {
      embedHtml = embedHtml.replace(/src="([^"]+)"/, function (m, src) {
        return 'src="' + src + (src.includes('?') ? '&' : '?') + 'autoplay=true"';
      });
    } else if (embed.platform === 'soundcloud') {
      embedHtml = embedHtml.replace('auto_play=false', 'auto_play=true');
    }
    embedHtml = embedHtml.replace(/<iframe /, '<iframe allow="autoplay" ');

    thumbContainer.dataset.originalHtml = thumbContainer.innerHTML;

    // ALL platforms: iframe in hidden container on document.body (survives
    // SPA navigation without any DOM moves). EQ overlay shown on the card.
    // Strip loading="lazy" — hidden iframes must load immediately
    embedHtml = embedHtml.replace(/\s*loading="lazy"/g, '');
    embedHtml = embedHtml.replace(
      /<iframe /,
      '<iframe style="width:100%;height:100%;border:none;" '
    );
    var hiddenPlayer = document.createElement('div');
    hiddenPlayer.id = 'hidden-player-' + uid;
    hiddenPlayer.style.cssText =
      'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;';
    hiddenPlayer.innerHTML = embedHtml;
    document.body.appendChild(hiddenPlayer);

    thumbContainer.innerHTML =
      '<div class="browse-now-playing" data-action="browse-stop" data-uid="' + uid + '" data-track-id="' + trackId + '">' +
        '<div class="bnp-bg"></div>' +
        '<div class="bnp-content">' +
          '<div class="bnp-eq"><span></span><span></span><span></span><span></span><span></span></div>' +
          '<div class="bnp-title">Now Playing</div>' +
          '<div class="bnp-track">' + sanitize(track.title) + '</div>' +
          '<div class="bnp-stop">Click to stop</div>' +
        '</div>' +
      '</div>';
    thumbContainer.removeAttribute('data-action');

    card.classList.add('is-playing');
    activeBrowseUid = uid;
    activeBrowseTrackId = String(trackId);
    activatePlayerBar(trackId, track.title || 'Now Playing', (track.tool || '') + ' \u00B7 ' + (track.genre || ''), embed.platform);
  }

  /**
   * Stop a browse card's playback and restore its thumbnail.
   */
  function browseStop(uid) {
    var card = document.getElementById(uid);
    if (card) {
      var thumbContainer = card.querySelector('.browse-card-thumb');
      if (thumbContainer) {
        // Remove hidden player — kill iframe src first
        var hiddenPlayer = document.getElementById('hidden-player-' + uid);
        if (hiddenPlayer) {
          hiddenPlayer.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
          hiddenPlayer.remove();
        }

        // iOS live player in card
        var iosLive = document.getElementById('ios-live-player-' + uid);
        if (iosLive) {
          iosLive.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
        }

        // iOS inline embeds
        var iosWrap = thumbContainer.querySelector('.ios-embed-wrap');
        if (iosWrap) {
          iosWrap.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
        }

        // Kill any iframe inside the card thumb (YouTube + iOS inline)
        thumbContainer.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });

        // Restore original thumbnail
        if (thumbContainer.dataset.originalHtml) {
          thumbContainer.innerHTML = thumbContainer.dataset.originalHtml;
          delete thumbContainer.dataset.originalHtml;
          thumbContainer.setAttribute('data-action', 'load-embed');
          thumbContainer.style.aspectRatio = '16/10';
          thumbContainer.style.minHeight = '';
          thumbContainer.style.overflow = 'hidden';
        }
      }
      card.classList.remove('is-playing');
    }
    // ALWAYS reset browse state, even if card element not found (navigated away)
    activeBrowseUid = null;
    activeBrowseTrackId = null;
  }


  // ═══════════════════════════════════════════════════════════════
  //  3. PLAYLIST TRACK PLAY (playlist page)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Play from a track list row on the playlist page.
   */
  function playTrack(trackId) {
    // Toggle: same track => stop everything
    if (activeTrackId !== null && String(activeTrackId) === String(trackId)) {
      closePlayer();
      return;
    }

    // ── STOP ALL PLAYBACK first (single source of truth) ──
    _stopAllPlayback();

    var track = _getTrack(trackId);
    if (!track) return;

    var row = document.querySelector('.track-row[data-track-id="' + trackId + '"]');
    if (!row) return;

    var info = _getTrackPlatform(track);

    // Mark as playing
    activeTrackId = trackId;
    row.classList.add('playing');

    // YouTube: show stop icon. Others: show equalizer via eq-active class.
    var btn = row.querySelector('.track-play');
    if (info.platform === 'youtube') {
      if (btn) {
        btn.innerHTML =
          '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
        btn.setAttribute('aria-label', 'Stop');
      }
    } else if (info.platform !== 'udio') {
      // Suno, SoundCloud, unknown: show equalizer immediately (autoplay works)
      row.classList.add('eq-active');
    }
    // Udio: no eq-active — can't detect playback state, iframe stays visible

    if (info.platform === 'udio' && info.udioId) {
      // Udio: NO official embed API. Show /songs/ page in VISIBLE inline iframe.
      // Iframe MUST stay visible — hiding it kills audio.
      var udioSrc = (info.url && info.url.includes('/songs/'))
        ? info.url
        : 'https://www.udio.com/songs/' + info.udioId;
      var trackEmbed = document.getElementById('embed-' + trackId);
      if (trackEmbed) {
        trackEmbed.innerHTML =
          '<iframe src="' + sanitizeAttr(udioSrc) + '" ' +
          'style="width:100%;height:300px;border:none;border-radius:8px;" ' +
          'allow="autoplay; encrypted-media" playsinline></iframe>';
        trackEmbed.style.display = 'block';
      }
      // NO collapse timer — iframe stays visible for the entire duration
    } else {
      // Non-Udio: iframe in #persistent-media (hidden, autoplay works)
      try {
        var pm = document.getElementById('persistent-media');
        if (pm) {
          var embedWrap = document.createElement('div');
          embedWrap.id = 'pm-list-embed';
          pm.appendChild(embedWrap);
          populateEmbed(track, info, embedWrap);
        }
      } catch (err) {
        console.warn('[VMAPlayer] populateEmbed error:', err);
      }
    }

    // Activate player bar
    var genre = '';
    if (VMA && typeof VMA.resolveGenre === 'function') {
      genre = VMA.resolveGenre(track.genre);
    } else {
      genre = track.genre || '';
    }
    activatePlayerBar(
      trackId,
      track.title || 'Now Playing',
      [track.tool, genre].filter(Boolean).join(' \u00B7 '),
      info.platform
    );
  }

  /**
   * Fill an embed area in a track row with the appropriate player.
   */
  function populateEmbed(track, info, embedArea) {
    var isMobile = window.innerWidth <= 640;
    if (info.platform === 'youtube') {
      embedArea.innerHTML =
        '<div class="embed-yt"><iframe src="https://www.youtube.com/embed/' +
        info.videoId +
        '?rel=0&autoplay=1&playsinline=1&enablejsapi=1&origin=' +
        encodeURIComponent(window.location.origin) +
        '" allow="autoplay; encrypted-media" allowfullscreen playsinline></iframe></div>';
      embedArea.style.display = 'block';
    } else if (info.platform === 'suno' && info.sunoId) {
      var sunoH = isMobile ? '120px' : '160px';
      embedArea.innerHTML =
        '<div class="embed-suno"><iframe src="https://suno.com/embed/' +
        info.sunoId +
        '?autoplay=true" allow="autoplay" style="height:' +
        sunoH +
        '" playsinline></iframe></div>';
      embedArea.style.display = 'block';
    } else if (info.platform === 'soundcloud') {
      // ALL SoundCloud links (including short on.soundcloud.com) go through the widget player
      var scUrl = info.url || track.embed_url || '';
      var scH = isMobile ? '120px' : '166px';
      embedArea.innerHTML =
        '<div style="position:relative;height:' + scH + ';">' +
          '<div class="embed-loading">' +
            '<div style="text-align:center;">' +
              '<div class="embed-loading-spinner" style="border-top-color:#ff5500;"></div>' +
              '<div style="font-size:0.7rem;color:rgba(255,255,255,0.5);">Loading...</div>' +
            '</div>' +
          '</div>' +
          '<iframe src="https://w.soundcloud.com/player/?url=' +
          encodeURIComponent(scUrl) +
          '&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true" ' +
          'allow="autoplay" style="width:100%;height:100%;border:none;border-radius:8px" playsinline></iframe>' +
        '</div>';
      embedArea.style.display = 'block';
      var _scIframe = embedArea.querySelector('iframe');
      var _scLoading = embedArea.querySelector('.embed-loading');
      if (_scIframe && _scLoading) {
        _scIframe.addEventListener('load', function () { _scLoading.remove(); });
        setTimeout(function () { if (_scLoading.parentNode) _scLoading.remove(); }, 4000);
      }
    } else if (info.platform === 'udio') {
      // Udio: NO official embed API. Use /songs/ page in visible iframe.
      var embedId = info.udioId;
      if (!embedId && track.embed_url) {
        var fallbackMatch = track.embed_url.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/) ||
                            track.embed_url.match(/udio\.com\/songs\/([a-zA-Z0-9_-]+)/);
        if (fallbackMatch) embedId = fallbackMatch[1] || fallbackMatch[0];
      }
      if (embedId) {
        var udioSrc2 = (info.url && info.url.includes('/songs/'))
          ? info.url
          : 'https://www.udio.com/songs/' + embedId;
        embedArea.innerHTML =
          '<iframe src="' + sanitizeAttr(udioSrc2) + '" ' +
          'style="width:100%;height:300px;border:none;border-radius:8px;" ' +
          'allow="autoplay; encrypted-media" playsinline></iframe>';
        embedArea.style.display = 'block';
      } else {
        console.warn('[VMAPlayer] Udio track without embedId:', track.id, track.embed_url);
        embedArea.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:48px;background:var(--surface-2);border-radius:8px;color:#818cf8;font-size:.82rem;">' +
          'Udio track \u2014 embed unavailable</div>';
        embedArea.style.display = 'block';
      }
    } else {
      // Unknown platform — try generic iframe embed, NEVER open new window
      var fallbackUrl = track.embed_url || (track.yt_id ? 'https://www.youtube.com/embed/' + track.yt_id : null);
      if (fallbackUrl) {
        console.warn('[VMAPlayer] Embedding unknown platform as iframe:', fallbackUrl);
        embedArea.innerHTML =
          '<iframe src="' + sanitizeAttr(fallbackUrl) + '" allow="autoplay; encrypted-media" ' +
          'style="width:100%;height:160px;border:none;border-radius:8px;" playsinline></iframe>';
        embedArea.style.display = 'block';
      } else {
        embedArea.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:48px;background:var(--surface-2);border-radius:8px;color:var(--muted);font-size:.82rem;">No playback source available</div>';
        embedArea.style.display = 'block';
      }
    }
  }

  /**
   * Stop all playback and hide the player bar.
   * Public API — called by playlist-page.js and player bar close button.
   */
  function stopTrack() {
    closePlayer();
  }


  // ═══════════════════════════════════════════════════════════════
  //  4. UDIO PLAYER (popup system)
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
            '<button class="udio-hdr-btn" id="udioCloseBtn" title="Stop & close" aria-label="Stop and close player">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div id="udio-iframe-box"></div>' +
        '<div class="udio-hint">Press play, then minimize \u25BE to keep listening</div>' +
      '</div>';
    document.body.appendChild(udioContainer);
    document.getElementById('udioMinBtn').addEventListener('click', minimizeUdio);
    document.getElementById('udioCloseBtn').addEventListener('click', stopUdioFull);
    document.getElementById('udio-backdrop').addEventListener('click', minimizeUdio);
  }

  function openUdioPlayer(udioId, trackTitle, onReady) {
    createUdioContainer();

    var box = document.getElementById('udio-iframe-box');
    var newSrc = 'https://www.udio.com/songs/' + udioId;

    // Udio has no embed API — load songs page directly
    box.innerHTML =
      '<iframe src="' + newSrc + '" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:none;"></iframe>';

    udioContainer.querySelector('.udio-hdr-title').textContent =
      trackTitle || 'Udio Track';

    udioContainer.className = 'udio-popup';
    udioState = 'popup';

    // Fire onReady callback immediately — popup is visible
    if (typeof onReady === 'function') onReady();

    // Auto-minimize when user clicks play (focus goes to iframe)
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

    // Auto-minimize after 6s in case user already pressed play
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
    if (udioContainer) {
      var iframes = udioContainer.querySelectorAll('iframe');
      iframes.forEach(function (f) { f.src = 'about:blank'; f.remove(); });
      var box = document.getElementById('udio-iframe-box');
      if (box) box.innerHTML = '';
      udioContainer.className = 'udio-closed';
      udioState = 'closed';
    }
    clearTimeout(window._udioAutoMin);
    window.removeEventListener('blur', window._udioBlurHandler);
  }

  function stopUdioFull() {
    closePlayer();
  }


  // ═══════════════════════════════════════════════════════════════
  //  5. SOUNDCLOUD PLAYER (popup system)
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
            '<button class="sc-hdr-btn" id="scMinBtn" title="Minimize \u2014 keep playing">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>' +
            '</button>' +
            '<button class="sc-hdr-btn" id="scCloseBtn" title="Stop & close">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div id="sc-iframe-box"></div>' +
        '<div class="sc-hint">Press play, then minimize \u25BE to keep listening</div>' +
      '</div>';
    document.body.appendChild(scContainer);
    document.getElementById('scMinBtn').addEventListener('click', minimizeSc);
    document.getElementById('scCloseBtn').addEventListener('click', stopScFull);
    document.getElementById('sc-backdrop').addEventListener('click', minimizeSc);
  }

  function openSoundCloudPlayer(scUrl, trackTitle, onReady) {
    createScContainer();
    var box = document.getElementById('sc-iframe-box');
    var embedSrc =
      'https://w.soundcloud.com/player/?url=' +
      encodeURIComponent(scUrl) +
      '&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true';

    // Simple iframe load — matches original behavior (no loading spinner)
    box.innerHTML =
      '<iframe src="' + embedSrc + '" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:none;" scrolling="no"></iframe>';

    scContainer.querySelector('.sc-hdr-title').textContent =
      trackTitle || 'SoundCloud Track';
    scContainer.className = 'sc-popup';
    scState = 'popup';

    // Fire onReady callback immediately — popup is visible
    if (typeof onReady === 'function') onReady();

    // Auto-minimize when user clicks play (focus goes to iframe)
    function onScBlur() {
      if (scState === 'popup') {
        clearTimeout(window._scAutoMin);
        setTimeout(minimizeSc, 500);
      }
      window.removeEventListener('blur', onScBlur);
    }
    window.removeEventListener('blur', window._scBlurHandler);
    window._scBlurHandler = onScBlur;
    window.addEventListener('blur', onScBlur);

    clearTimeout(window._scAutoMin);
    window._scAutoMin = setTimeout(function () {
      if (scState === 'popup') minimizeSc();
    }, 6000);
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
    if (scContainer) {
      var iframes = scContainer.querySelectorAll('iframe');
      iframes.forEach(function (f) { f.src = 'about:blank'; f.remove(); });
      var box = document.getElementById('sc-iframe-box');
      if (box) box.innerHTML = '';
      scContainer.className = 'sc-closed';
      scState = 'closed';
    }
    clearTimeout(window._scAutoMin);
    window.removeEventListener('blur', window._scBlurHandler);
  }

  function stopScFull() {
    closePlayer();
  }


  // ═══════════════════════════════════════════════════════════════
  //  6. PAGE FRAME (iOS navigation while playing)
  // ═══════════════════════════════════════════════════════════════

  function navigateToPage(url) {
    if (!activePlayerTrackId) {
      window.location.href = url;
      return;
    }
    var frame = document.getElementById('pageFrame');
    if (!frame) return;
    var iframe = frame.querySelector('iframe');
    if (iframe) iframe.src = url;
    frame.classList.add('active');
  }

  function closePageFrame() {
    var frame = document.getElementById('pageFrame');
    if (!frame) return;
    frame.classList.remove('active');
    var iframe = frame.querySelector('iframe');
    if (iframe) iframe.src = '';
  }


  // ═══════════════════════════════════════════════════════════════
  //  7. NAVIGATION SURVIVAL
  // ═══════════════════════════════════════════════════════════════

  // Saved state for cross-navigation persistence
  var _savedState = null;

  /**
   * Called by the SPA router BEFORE #spa-content is replaced.
   * Moves iframes that would be destroyed into #persistent-media.
   */
  function preserveForNav() {
    if (!activePlayerTrackId) return;

    _savedState = {
      trackId: activePlayerTrackId,
      platform: activePlayerPlatform,
      browseUid: activeBrowseUid,
      browseTrackId: activeBrowseTrackId,
      listTrackId: activeTrackId
    };

    // ── ZERO iframe moves ──
    // All playing iframes live on document.body (hidden-player-*, Udio/SC
    // popups). They are OUTSIDE #spa-content and survive container.innerHTML
    // naturally. Moving iframes with appendChild causes Chrome/Safari to
    // reload them (restarting the song). So we move NOTHING — only save state.
  }

  /**
   * Called by the SPA router AFTER new page content is rendered.
   * Restores visual state (overlays, row highlights) based on what's playing.
   */
  function restoreAfterNav() {
    if (!_savedState) return;
    var saved = _savedState;
    // _savedState is kept alive so future navigations can re-save

    // ── If we're on the HOME page and a browse card exists for the playing track ──
    if (saved.browseUid) {
      var card = document.getElementById(saved.browseUid);
      if (card) {
        var thumbContainer = card.querySelector('.browse-card-thumb');
        if (thumbContainer) {
          // Restore "Now Playing" / embed overlay
          card.classList.add('is-playing');

          // Iframes stay in #persistent-media — NEVER moved back during navigation.
          // Only visual "Now Playing" overlay is restored on the card.
          if (saved.platform !== 'udio' && saved.platform !== 'soundcloud') {
            var track = _getTrack(saved.browseTrackId);
            if (track) {
              thumbContainer.dataset.originalHtml = thumbContainer.innerHTML;
              thumbContainer.innerHTML =
                '<div class="browse-now-playing" data-action="browse-stop" data-uid="' + saved.browseUid + '" data-track-id="' + saved.browseTrackId + '">' +
                  '<div class="bnp-bg"></div>' +
                  '<div class="bnp-content">' +
                    '<div class="bnp-eq"><span></span><span></span><span></span><span></span><span></span></div>' +
                    '<div class="bnp-title">Now Playing</div>' +
                    '<div class="bnp-track">' + sanitize(track.title) + '</div>' +
                    '<div class="bnp-stop">Click to stop</div>' +
                  '</div>' +
                '</div>';
              thumbContainer.removeAttribute('data-action');
            }
          }
          // Udio/SC: show EQ overlay (popup is still alive outside spa-content)
          else if (saved.platform === 'udio' || saved.platform === 'soundcloud') {
            var trackForOverlay = _getTrack(saved.browseTrackId);
            if (trackForOverlay) {
              var eqColor = saved.platform === 'soundcloud' ? '#ff5500' : '#818cf8';
              var bgStyle = saved.platform === 'soundcloud'
                ? ' style="background:linear-gradient(135deg, rgba(255,85,0,0.15) 0%, rgba(7,7,11,0.95) 60%);"'
                : saved.platform === 'udio'
                ? ''
                : '';
              thumbContainer.dataset.originalHtml = thumbContainer.innerHTML;
              thumbContainer.innerHTML =
                '<div class="browse-now-playing" data-action="browse-stop" data-uid="' + saved.browseUid + '" data-track-id="' + saved.browseTrackId + '">' +
                  '<div class="bnp-bg"' + bgStyle + '></div>' +
                  '<div class="bnp-content">' +
                    '<div class="bnp-eq"><span style="background:' + eqColor + ';"></span><span style="background:' + eqColor + ';"></span><span style="background:' + eqColor + ';"></span><span style="background:' + eqColor + ';"></span><span style="background:' + eqColor + ';"></span></div>' +
                    '<div class="bnp-title" style="color:' + eqColor + ';">Now Playing</div>' +
                    '<div class="bnp-track">' + sanitize(trackForOverlay.title) + '</div>' +
                    '<div class="bnp-stop">Click to stop</div>' +
                  '</div>' +
                '</div>';
              thumbContainer.removeAttribute('data-action');
            }
          }

          // iOS: live player stays in #persistent-media — never moved back
        }
      }
    }

    // ── If we're on the PLAYLIST page and a track row exists for the playing track ──
    if (saved.listTrackId !== null) {
      var listRow = document.querySelector(
        '.track-row[data-track-id="' + saved.listTrackId + '"]'
      );
      if (listRow) {
        listRow.classList.add('playing');
        var playBtn = listRow.querySelector('.track-play');
        if (playBtn) {
          playBtn.innerHTML =
            '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
          playBtn.setAttribute('aria-label', 'Stop');
        }
        // Iframe stays in #persistent-media — never moved back during navigation
      }
    }

    // Player bar stays active throughout — it lives outside #spa-content.
  }


  // ═══════════════════════════════════════════════════════════════
  //  8. NAV TARGET MANAGEMENT (REGEL 3)
  //  When music is playing, internal nav links open in new tab
  //  so playback is never interrupted by page navigation.
  // ═══════════════════════════════════════════════════════════════

  function _updateNavTargets() {
    var isPlaying = !!(activePlayerTrackId);
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
  //  9. EXPAND BUTTONS IN PLAYER BAR
  // ═══════════════════════════════════════════════════════════════

  function _createExpandButtons() {
    var controlsDiv = document.querySelector('.player-controls');
    if (!controlsDiv) return;
    var closeBtn = document.getElementById('btnClose');

    // Udio expand button
    udioExpandBtn = document.createElement('button');
    udioExpandBtn.className = 'udio-expand-btn player-ctrl';
    udioExpandBtn.title = 'Show Udio player';
    udioExpandBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8l-6 6h12z"/></svg>';
    udioExpandBtn.style.display = 'none';
    udioExpandBtn.addEventListener('click', expandUdio);
    controlsDiv.insertBefore(udioExpandBtn, closeBtn);

    // SoundCloud expand button
    scExpandBtn = document.createElement('button');
    scExpandBtn.className = 'sc-expand-btn player-ctrl';
    scExpandBtn.title = 'Show SoundCloud player';
    scExpandBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8l-6 6h12z"/></svg>';
    scExpandBtn.style.display = 'none';
    scExpandBtn.addEventListener('click', expandSc);
    controlsDiv.insertBefore(scExpandBtn, closeBtn);
  }

  function _updateExpandButtons() {
    if (udioExpandBtn) {
      // Only show expand button if popup is actually open (minimized)
      udioExpandBtn.style.display = (playerBar.classList.contains('udio-active') && udioState !== 'closed')
        ? 'flex'
        : 'none';
    }
    if (scExpandBtn) {
      scExpandBtn.style.display = playerBar.classList.contains('sc-active')
        ? 'flex'
        : 'none';
    }
  }




  // ═══════════════════════════════════════════════════════════════
  //  INIT — called once when the app shell loads
  // ═══════════════════════════════════════════════════════════════

  function init() {
    // Cache DOM refs
    playerBar = document.getElementById('playerBar');
    playerTitle = document.getElementById('playerTitle');
    playerMeta = document.getElementById('playerMeta');

    if (!playerBar) {
      console.warn('[VMAPlayer] #playerBar not found — init aborted.');
      return;
    }

    // Bind player bar button handlers
    var btnClose = document.getElementById('btnClose');
    if (btnClose) btnClose.addEventListener('click', closePlayer);

    var btnLocate = document.getElementById('btnLocate');
    if (btnLocate) btnLocate.addEventListener('click', locateTrack);

    // Click player bar info area
    var playerInfo = document.getElementById('playerInfo');
    if (playerInfo) {
      playerInfo.addEventListener('click', function () {
        var frame = document.getElementById('pageFrame');
        if (frame && frame.classList.contains('active')) {
          closePageFrame();
        } else {
          scrollToActiveCard();
        }
      });
    }

    // Page frame close button
    var pfClose = document.getElementById('pfClose');
    if (pfClose) pfClose.addEventListener('click', closePageFrame);

    // Create expand buttons
    _createExpandButtons();

    // MutationObserver: show/hide expand buttons when playerBar class changes
    new MutationObserver(_updateExpandButtons).observe(playerBar, {
      attributes: true,
      attributeFilter: ['class']
    });
    _updateExpandButtons();
  }


  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  return {
    // State (read-only getters)
    get activeTrackId() { return activePlayerTrackId; },
    get activePlatform() { return activePlayerPlatform; },
    get activeBrowseUid() { return activeBrowseUid; },
    get activeBrowseTrackId() { return activeBrowseTrackId; },
    get listTrackId() { return activeTrackId; },

    // Player bar
    activatePlayerBar: activatePlayerBar,
    closePlayer: closePlayer,
    locateTrack: locateTrack,

    // Browse card play (home page)
    browsePlay: browsePlay,
    browseStop: browseStop,

    // List play (playlist page)
    playTrack: playTrack,
    stopTrack: stopTrack,

    // Udio
    openUdioPlayer: openUdioPlayer,
    minimizeUdio: minimizeUdio,
    expandUdio: expandUdio,
    destroyUdioPlayer: destroyUdioPlayer,
    stopUdioFull: stopUdioFull,

    // SoundCloud
    openSoundCloudPlayer: openSoundCloudPlayer,
    minimizeSc: minimizeSc,
    expandSc: expandSc,
    destroySc: destroySc,
    stopScFull: stopScFull,

    // Page frame
    navigateToPage: navigateToPage,
    closePageFrame: closePageFrame,

    // Navigation survival
    preserveForNav: preserveForNav,
    restoreAfterNav: restoreAfterNav,

    // Init (called once on shell load)
    init: init
  };
})();
