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
    playerMeta.textContent = meta || '';
    playerBar.classList.add('active', 'playing');
    document.body.classList.add('player-active');
    if (typeof gtag === 'function') {
      gtag('event', 'play_bar', { track_id: trackId, platform: platform });
    }
  }

  /**
   * Stop everything and hide the player bar.
   */
  function closePlayer() {
    // 1. Stop browse card
    if (activeBrowseUid) browseStop(activeBrowseUid);
    // 2. Kill Udio iframe completely
    destroyUdioPlayer();
    // 3. Kill SoundCloud iframe completely
    destroySc();
    // 4. Stop playlist-page inline track
    if (activeTrackId !== null) stopTrack();
    // 5. Remove any stray hidden players + legacy iOS embeds
    if (activeBrowseUid) {
      var hp = document.getElementById('hidden-player-' + activeBrowseUid);
      if (hp) hp.remove();
    }
    var iosArea = document.getElementById('iosPlayerEmbed');
    if (iosArea) {
      iosArea.querySelectorAll('iframe').forEach(function (i) { i.src = 'about:blank'; });
      iosArea.remove();
    }
    var iosMini = document.getElementById('ios-mini-player');
    if (iosMini) {
      iosMini.querySelectorAll('iframe').forEach(function (i) { i.src = 'about:blank'; });
      iosMini.remove();
    }
    // Kill all iOS inline card embeds
    document.querySelectorAll('[id^="ios-live-player-"] iframe, .ios-embed-wrap iframe').forEach(function (f) {
      f.src = 'about:blank';
    });
    // 6. Kill anything in #persistent-media
    var pm = document.getElementById('persistent-media');
    if (pm) {
      pm.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
      pm.innerHTML = '';
    }
    // 7. Reset all player state
    playerBar.classList.remove('active', 'playing', 'udio-active', 'sc-active');
    document.body.classList.remove('player-active');
    activePlayerTrackId = null;
    activePlayerPlatform = null;
    activeBrowseUid = null;
    activeBrowseTrackId = null;
    activeTrackId = null;
    // 8. Close page frame
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

    // If browse-card is active, scroll to it
    if (activeBrowseUid) {
      scrollToActiveCard();
      return;
    }

    // Playlist-page locate (may need to expand list)
    if (activeTrackId !== null) {
      var trackRow = document.querySelector(
        '.track-row[data-track-id="' + activeTrackId + '"]'
      );
      if (!trackRow) {
        // Track might be beyond displayCount — try to expand via page module
        if (VMA && VMA.playlist && typeof VMA.playlist.expandToTrack === 'function') {
          VMA.playlist.expandToTrack(activeTrackId);
          trackRow = document.querySelector(
            '.track-row[data-track-id="' + activeTrackId + '"]'
          );
        }
      }
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

  /**
   * Helper — get embed info for a track (index/home page version).
   */
  function _getEmbedHtml(track) {
    if (VMA && typeof VMA.getEmbedHtml === 'function') return VMA.getEmbedHtml(track);
    return { platform: 'unknown', embedHtml: '' };
  }

  /**
   * Helper — get platform info for a track (playlist page version).
   */
  function _getTrackPlatform(track) {
    if (VMA && typeof VMA.getTrackPlatform === 'function') return VMA.getTrackPlatform(track);
    return { platform: 'unknown' };
  }

  /**
   * Play a track from a browse card on the home page.
   */
  function browsePlay(uid, trackId) {
    // Toggle: if already playing this uid, stop it
    if (activeBrowseUid === uid) {
      browseStop(uid);
      destroyUdioPlayer();
      destroySc();
      playerBar.classList.remove('active', 'playing', 'udio-active', 'sc-active');
      document.body.classList.remove('player-active');
      activePlayerTrackId = null;
      activePlayerPlatform = null;
      return;
    }

    var track = _getTrack(trackId);
    if (!track) return;

    // ── STOP EVERYTHING first ──
    if (activeBrowseUid) browseStop(activeBrowseUid);
    destroyUdioPlayer();
    destroySc();
    if (activeTrackId !== null) stopTrack();
    if (activeBrowseUid) {
      var hp = document.getElementById('hidden-player-' + activeBrowseUid);
      if (hp) hp.remove();
    }
    playerBar.classList.remove('udio-active', 'sc-active');
    activeBrowseUid = null;
    activeBrowseTrackId = null;

    var card = document.getElementById(uid);
    if (!card) return;
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
        if (scUrl.includes('on.soundcloud.com')) {
          window.open(scUrl, '_blank');
          return;
        }
        iframeSrc =
          'https://w.soundcloud.com/player/?url=' +
          encodeURIComponent(scUrl) +
          '&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true';
        eqColorClass = 'soundcloud';
        platformLabel = 'SoundCloud';
        wrapClass = 'soundcloud';
      } else if (embed.platform === 'udio') {
        var udioId = embed.udioId;
        if (udioId) iframeSrc = 'https://www.udio.com/embed/' + udioId;
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

      thumbContainer.innerHTML =
        '<div id="ios-live-player-' + uid + '" style="position:relative;">' +
          '<div class="ios-embed-wrap ' + wrapClass + '" id="ios-iframe-wrap-' + uid + '" style="position:relative;transition:height 0.4s ease,opacity 0.3s ease;">' +
            '<iframe src="' + iframeSrc + '" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:none;" scrolling="no" playsinline></iframe>' +
          '</div>' +
          '<div style="position:absolute;bottom:0;left:0;right:0;padding:8px 12px;background:linear-gradient(transparent,rgba(0,0,0,0.9));pointer-events:none;text-align:center;" id="ios-hint-' + uid + '">' +
            '<span style="font-size:0.68rem;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:0.5px;">\u25B6 TAP PLAY ABOVE</span>' +
          '</div>' +
          '<button class="ios-stop-btn" data-action="browse-stop" data-uid="' + uid + '" data-track-id="' + trackId + '" aria-label="Stop">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' +
          '</button>' +
        '</div>';
      thumbContainer.removeAttribute('data-action');

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
      playerTitle.textContent = track.title || 'Now Playing';
      playerMeta.textContent = metaStr;
      playerBar.classList.add('active', 'playing');
      if (embed.platform === 'udio') playerBar.classList.add('udio-active');
      if (embed.platform === 'soundcloud') playerBar.classList.add('sc-active');
      document.body.classList.add('player-active');
      activePlayerTrackId = trackId;
      activePlayerPlatform = embed.platform;

      // ── Transition to PHASE 2 (audio platforms only) ──
      // YouTube stays in Phase 1 — user watches video.
      if (embed.platform === 'youtube') {
        if (typeof gtag === 'function') {
          gtag('event', 'play_bar', { track_id: trackId, platform: embed.platform });
        }
        return;
      }

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

      if (typeof gtag === 'function') {
        gtag('event', 'play_bar', { track_id: trackId, platform: embed.platform });
      }
      return;
    }

    // ══════════════════════════════════════════════════════
    // Non-iOS: Original behaviour (hidden iframes, popups)
    // ══════════════════════════════════════════════════════

    // SoundCloud: popup for full URLs, new tab for short links
    if (embed.platform === 'soundcloud') {
      var scUrl2 = track.embed_url || '';
      if (scUrl2.includes('on.soundcloud.com')) {
        window.open(scUrl2, '_blank');
        return;
      }
      openSoundCloudPlayer(scUrl2, track.title);

      thumbContainer.dataset.originalHtml = thumbContainer.innerHTML;
      thumbContainer.innerHTML =
        '<div class="browse-now-playing" data-action="browse-stop" data-uid="' + uid + '" data-track-id="' + trackId + '">' +
          '<div class="bnp-bg" style="background:linear-gradient(135deg, rgba(255,85,0,0.15) 0%, rgba(7,7,11,0.95) 60%);"></div>' +
          '<div class="bnp-content">' +
            '<div class="bnp-eq"><span style="background:#ff5500;"></span><span style="background:#ff5500;"></span><span style="background:#ff5500;"></span><span style="background:#ff5500;"></span><span style="background:#ff5500;"></span></div>' +
            '<div class="bnp-title" style="color:#ff5500;">Now Playing</div>' +
            '<div class="bnp-track">' + sanitize(track.title) + '</div>' +
            '<div class="bnp-stop">Click to stop</div>' +
          '</div>' +
        '</div>';
      thumbContainer.removeAttribute('data-action');

      playerTitle.textContent = track.title || 'Now Playing';
      playerMeta.textContent = 'SoundCloud \u00B7 ' + (track.genre || '');
      playerBar.classList.add('active', 'playing', 'sc-active');
      document.body.classList.add('player-active');
      activePlayerTrackId = trackId;
      activePlayerPlatform = 'soundcloud';
      activeBrowseUid = uid;
      activeBrowseTrackId = String(trackId);
      card.classList.add('is-playing');
      if (typeof gtag === 'function') {
        gtag('event', 'play_bar', { track_id: trackId, platform: 'soundcloud' });
      }
      return;
    }

    // Udio: use popup player
    if (embed.platform === 'udio') {
      var udioIdVal = embed.udioId;
      if (udioIdVal) {
        openUdioPlayer(udioIdVal, track.title);

        thumbContainer.dataset.originalHtml = thumbContainer.innerHTML;
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

        playerTitle.textContent = track.title || 'Now Playing';
        playerMeta.textContent = 'Udio \u00B7 ' + (track.genre || '');
        playerBar.classList.add('active', 'playing', 'udio-active');
        document.body.classList.add('player-active');
        activePlayerTrackId = trackId;
        activePlayerPlatform = 'udio';
        activeBrowseUid = uid;
        activeBrowseTrackId = String(trackId);
        card.classList.add('is-playing');
        if (typeof gtag === 'function') {
          gtag('event', 'play_bar', { track_id: trackId, platform: 'udio' });
        }
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

    // YouTube: show video in card. Others: play hidden, show EQ overlay.
    if (embed.platform === 'youtube') {
      embedHtml = embedHtml.replace(
        /<iframe /,
        '<iframe style="width:100%;height:100%;border:none;position:absolute;top:0;left:0;" '
      );
      thumbContainer.style.aspectRatio = '16/9';
      thumbContainer.style.position = 'relative';
      thumbContainer.innerHTML =
        embedHtml +
        '<div class="browse-stop-overlay" data-action="browse-stop" data-uid="' + uid + '" data-track-id="' + trackId + '">' +
          '<div class="browse-stop-btn">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' +
          '</div>' +
        '</div>';
    } else {
      // Audio platforms: hide iframe, show EQ overlay
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
    }
    thumbContainer.removeAttribute('data-action');

    card.classList.add('is-playing');
    activeBrowseUid = uid;
    activeBrowseTrackId = String(trackId);

    playerTitle.textContent = track.title || 'Now Playing';
    playerMeta.textContent = (track.tool || '') + ' \u00B7 ' + (track.genre || '');
    playerBar.classList.add('active', 'playing');
    document.body.classList.add('player-active');
    activePlayerTrackId = trackId;
    activePlayerPlatform = embed.platform;
    if (typeof gtag === 'function') {
      gtag('event', 'play_bar', { track_id: trackId, platform: embed.platform });
    }
  }

  /**
   * Stop a browse card's playback and restore its thumbnail.
   */
  function browseStop(uid) {
    var card = document.getElementById(uid);
    if (!card) return;
    var thumbContainer = card.querySelector('.browse-card-thumb');
    if (!thumbContainer) return;

    // Remove hidden player — kill iframe src first
    var hiddenPlayer = document.getElementById('hidden-player-' + uid);
    if (hiddenPlayer) {
      hiddenPlayer.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
      hiddenPlayer.remove();
    }

    // Legacy iOS cleanup
    var iosArea = document.getElementById('iosPlayerEmbed');
    if (iosArea) {
      iosArea.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
      iosArea.remove();
    }
    var iosMini = document.getElementById('ios-mini-player');
    if (iosMini) {
      iosMini.querySelectorAll('iframe').forEach(function (f) { f.src = 'about:blank'; });
      iosMini.remove();
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
    card.classList.remove('is-playing');
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
    // Toggle: same track => stop
    if (activeTrackId !== null && String(activeTrackId) === String(trackId)) {
      stopTrack();
      return;
    }
    // Stop current if any
    if (activeTrackId !== null) stopTrack();
    // Also stop browse-card play if active
    if (activeBrowseUid) {
      browseStop(activeBrowseUid);
      destroyUdioPlayer();
      destroySc();
      playerBar.classList.remove('udio-active', 'sc-active');
    }

    var track = _getTrack(trackId);
    if (!track) return;

    var row = document.querySelector('.track-row[data-track-id="' + trackId + '"]');
    if (!row) return;

    var info = _getTrackPlatform(track);

    // Mark as playing
    activeTrackId = trackId;
    row.classList.add('playing');

    // Change play icon to stop icon
    var btn = row.querySelector('.track-play');
    if (btn) {
      btn.innerHTML =
        '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
      btn.setAttribute('aria-label', 'Stop');
    }

    // Embed area is always in DOM
    var embedArea = row.querySelector('.track-embed-area');
    populateEmbed(track, info, embedArea);

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
      if (info.isShort) {
        embedArea.innerHTML =
          '<a href="' + sanitizeAttr(track.embed_url) + '" target="_blank" rel="noopener" ' +
          'style="display:flex;align-items:center;justify-content:center;height:48px;background:var(--surface-2);border-radius:8px;color:#ff5500;text-decoration:none;gap:8px;font-weight:600;font-size:.82rem;">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="#ff5500"><polygon points="6 3 20 12 6 21 6 3"/></svg>Play on SoundCloud</a>';
        embedArea.style.display = 'block';
      } else {
        var scH = isMobile ? '120px' : '166px';
        embedArea.innerHTML =
          '<iframe src="https://w.soundcloud.com/player/?url=' +
          encodeURIComponent(info.url) +
          '&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true" ' +
          'allow="autoplay" style="width:100%;height:' + scH + ';border:none;border-radius:8px" playsinline></iframe>';
        embedArea.style.display = 'block';
      }
    } else if (info.platform === 'udio') {
      var embedId = info.udioId;
      if (embedId) {
        var udioH = isMobile ? '140px' : '180px';
        embedArea.innerHTML =
          '<iframe src="https://www.udio.com/embed/' + embedId + '" allow="autoplay" ' +
          'style="width:100%;height:' + udioH + ';border:none;border-radius:8px" playsinline></iframe>';
        embedArea.style.display = 'block';
      } else {
        embedArea.innerHTML =
          '<a href="' + sanitizeAttr(track.embed_url) + '" target="_blank" rel="noopener" ' +
          'style="display:flex;align-items:center;justify-content:center;height:48px;background:var(--surface-2);border-radius:8px;color:#818cf8;text-decoration:none;gap:8px;font-weight:600;font-size:.82rem;">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="#818cf8"><polygon points="6 3 20 12 6 21 6 3"/></svg>Play on Udio</a>';
        embedArea.style.display = 'block';
      }
    } else {
      // Unknown platform — open in new tab
      var url =
        track.embed_url ||
        (track.yt_id ? 'https://www.youtube.com/watch?v=' + track.yt_id : null);
      if (url) window.open(url, '_blank');
      stopTrack();
    }
  }

  /**
   * Stop playlist playback — clean up all playing rows.
   */
  function stopTrack() {
    if (activeTrackId === null) return;
    activeTrackId = null;

    document.querySelectorAll('.track-row.playing').forEach(function (row) {
      row.classList.remove('playing');
      var btn = row.querySelector('.track-play');
      if (btn) {
        btn.innerHTML =
          '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>';
        btn.setAttribute('aria-label', 'Play');
      }
      var embedArea = row.querySelector('.track-embed-area');
      if (embedArea) {
        embedArea.querySelectorAll('iframe').forEach(function (f) {
          try { f.src = 'about:blank'; } catch (e) { /* ignore */ }
        });
        embedArea.innerHTML = '';
        embedArea.style.display = 'none';
      }
    });

    playerBar.classList.remove('active', 'playing');
    document.body.classList.remove('player-active');
    activePlayerTrackId = null;
    activePlayerPlatform = null;
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

  function openUdioPlayer(udioId, trackTitle) {
    createUdioContainer();

    var box = document.getElementById('udio-iframe-box');
    var existingIframe = box.querySelector('iframe');
    var newSrc = 'https://www.udio.com/embed/' + udioId;

    if (!existingIframe || existingIframe.src !== newSrc) {
      box.innerHTML =
        '<iframe src="' + newSrc + '" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:none;"></iframe>';
    }

    udioContainer.querySelector('.udio-hdr-title').textContent =
      trackTitle || 'Udio Track';

    udioContainer.className = 'udio-popup';
    udioState = 'popup';

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

    // Also auto-minimize after 6s
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
    destroyUdioPlayer();
    if (activeBrowseUid) browseStop(activeBrowseUid);
    playerBar.classList.remove('active', 'playing', 'udio-active', 'sc-active');
    document.body.classList.remove('player-active');
    activePlayerTrackId = null;
    activePlayerPlatform = null;
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

  function openSoundCloudPlayer(scUrl, trackTitle) {
    createScContainer();
    var box = document.getElementById('sc-iframe-box');
    var embedSrc =
      'https://w.soundcloud.com/player/?url=' +
      encodeURIComponent(scUrl) +
      '&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true';
    box.innerHTML =
      '<iframe src="' + embedSrc + '" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:none;" scrolling="no"></iframe>';
    scContainer.querySelector('.sc-hdr-title').textContent =
      trackTitle || 'SoundCloud Track';
    scContainer.className = 'sc-popup';
    scState = 'popup';

    // Auto-minimize after user likely pressed play
    clearTimeout(window._scAutoMin);
    window._scAutoMin = setTimeout(function () {
      if (scState === 'popup') minimizeSc();
    }, 5000);

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
    destroySc();
    if (activeBrowseUid) browseStop(activeBrowseUid);
    playerBar.classList.remove('active', 'playing', 'sc-active');
    document.body.classList.remove('player-active');
    activePlayerTrackId = null;
    activePlayerPlatform = null;
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

    var pm = document.getElementById('persistent-media');
    if (!pm) return;

    _savedState = {
      trackId: activePlayerTrackId,
      platform: activePlayerPlatform,
      browseUid: activeBrowseUid,
      browseTrackId: activeBrowseTrackId,
      listTrackId: activeTrackId
    };

    // Udio/SC popups already live outside #spa-content — no action needed.

    // YouTube playing in a browse card: move iframe to #persistent-media
    if (activeBrowseUid && activePlayerPlatform === 'youtube') {
      var card = document.getElementById(activeBrowseUid);
      if (card) {
        var thumbContainer = card.querySelector('.browse-card-thumb');
        if (thumbContainer) {
          var ytIframe = thumbContainer.querySelector('iframe');
          if (ytIframe) {
            // Wrap in a container so we can identify it later
            var wrap = document.createElement('div');
            wrap.id = 'preserved-yt-' + activeBrowseUid;
            wrap.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;';
            wrap.appendChild(ytIframe);
            pm.appendChild(wrap);
          }
        }
      }
    }

    // Hidden player (Suno, etc.) for browse card — move to #persistent-media
    if (activeBrowseUid) {
      var hiddenPlayer = document.getElementById('hidden-player-' + activeBrowseUid);
      if (hiddenPlayer) {
        pm.appendChild(hiddenPlayer);
      }
    }

    // iOS live player in browse card — move entire wrapper to #persistent-media
    if (activeBrowseUid && isIOS) {
      var iosLive = document.getElementById('ios-live-player-' + activeBrowseUid);
      if (iosLive) {
        var iosWrap = document.createElement('div');
        iosWrap.id = 'preserved-ios-' + activeBrowseUid;
        iosWrap.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;';
        iosWrap.appendChild(iosLive);
        pm.appendChild(iosWrap);
      }
    }

    // Playlist inline embeds — move active embed iframe to #persistent-media
    if (activeTrackId !== null) {
      var row = document.querySelector('.track-row[data-track-id="' + activeTrackId + '"]');
      if (row) {
        var embedArea = row.querySelector('.track-embed-area');
        if (embedArea) {
          var listIframe = embedArea.querySelector('iframe');
          if (listIframe) {
            var listWrap = document.createElement('div');
            listWrap.id = 'preserved-list-' + activeTrackId;
            listWrap.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;';
            listWrap.appendChild(listIframe);
            pm.appendChild(listWrap);
          }
        }
      }
    }
  }

  /**
   * Called by the SPA router AFTER new page content is rendered.
   * Restores visual state (overlays, row highlights) based on what's playing.
   */
  function restoreAfterNav() {
    if (!_savedState) return;
    var saved = _savedState;
    // _savedState is kept alive so future navigations can re-save

    var pm = document.getElementById('persistent-media');

    // ── If we're on the HOME page and a browse card exists for the playing track ──
    if (saved.browseUid) {
      var card = document.getElementById(saved.browseUid);
      if (card) {
        var thumbContainer = card.querySelector('.browse-card-thumb');
        if (thumbContainer) {
          // Restore "Now Playing" / embed overlay
          card.classList.add('is-playing');

          // YouTube: try to restore the live iframe back into the card
          if (saved.platform === 'youtube' && pm) {
            var preservedYt = document.getElementById('preserved-yt-' + saved.browseUid);
            if (preservedYt) {
              var ytIframe = preservedYt.querySelector('iframe');
              if (ytIframe) {
                ytIframe.style.cssText = 'width:100%;height:100%;border:none;position:absolute;top:0;left:0;';
                thumbContainer.dataset.originalHtml = thumbContainer.innerHTML;
                thumbContainer.style.aspectRatio = '16/9';
                thumbContainer.style.position = 'relative';
                thumbContainer.innerHTML = '';
                thumbContainer.appendChild(ytIframe);
                // Add stop overlay
                var stopOverlay = document.createElement('div');
                stopOverlay.className = 'browse-stop-overlay';
                stopOverlay.setAttribute('data-action', 'browse-stop');
                stopOverlay.setAttribute('data-uid', saved.browseUid);
                stopOverlay.setAttribute('data-track-id', saved.browseTrackId);
                stopOverlay.innerHTML =
                  '<div class="browse-stop-btn">' +
                    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' +
                  '</div>';
                thumbContainer.appendChild(stopOverlay);
                thumbContainer.removeAttribute('data-action');
              }
              preservedYt.remove();
            }
          }
          // Audio platforms (Suno, etc.) with hidden player — restore EQ overlay
          else if (saved.platform !== 'youtube' && saved.platform !== 'udio' && saved.platform !== 'soundcloud') {
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

          // iOS: restore live player back into card
          if (isIOS && pm) {
            var preservedIos = document.getElementById('preserved-ios-' + saved.browseUid);
            if (preservedIos) {
              var iosLive = preservedIos.querySelector('[id^="ios-live-player-"]');
              if (iosLive && thumbContainer) {
                thumbContainer.innerHTML = '';
                thumbContainer.appendChild(iosLive);
              }
              preservedIos.remove();
            }
          }
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
        // Restore iframe from persistent-media into the embed area
        if (pm) {
          var preservedList = document.getElementById('preserved-list-' + saved.listTrackId);
          if (preservedList) {
            var embedArea = listRow.querySelector('.track-embed-area');
            if (embedArea) {
              var listIframe = preservedList.querySelector('iframe');
              if (listIframe) {
                embedArea.innerHTML = '';
                embedArea.appendChild(listIframe);
                embedArea.style.display = 'block';
              }
            }
            preservedList.remove();
          }
        }
      }
    }

    // Player bar stays active throughout — it lives outside #spa-content.
  }


  // ═══════════════════════════════════════════════════════════════
  //  8. EXPAND BUTTONS IN PLAYER BAR
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
      udioExpandBtn.style.display = playerBar.classList.contains('udio-active')
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
