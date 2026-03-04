/**
 * VoteMyAI — Main Page Module
 *
 * Unified track browsing and playback page. Relies on VMA (app.js) for
 * shared logic and VMAPlayer (player.js) for all playback management.
 *
 * Runs as an IIFE with cleanup pattern.
 */
(function () {
  'use strict';

  var VMA    = window.VMA;
  var Player = window.VMAPlayer;
  var _cleanup = [];

  // ─── Constants ───────────────────────────────────────────────────────
  var DISPLAY_CHUNK = 50;

  // ─── State ───────────────────────────────────────────────────────────
  var filteredTracks   = [];
  var sortedTracks     = [];
  var displayCount     = DISPLAY_CHUNK;
  var currentSort      = 'top';
  var currentGenreSlug = null;
  var currentSubgenre  = null;
  var searchQuery      = '';
  var searchTimeout    = null;

  // ─── Comment & Note state ────────────────────────────────────────────
  var _openCommentPanel = null;
  var _openNoteEl       = null;
  var _noteScrollStart  = null;


  // ═══════════════════════════════════════════════════════════════════════
  // 1. Helpers — thumbnail, stars
  // ═══════════════════════════════════════════════════════════════════════

  function getThumb(track) {
    if (track.thumbnail_url) return track.thumbnail_url;
    if (track.embed_url) {
      var sunoMatch = track.embed_url.match(/\/([a-f0-9-]{36})/);
      if (sunoMatch && (track.embed_url.includes('suno.com') || track.embed_url.includes('suno.ai'))) {
        return 'https://cdn2.suno.ai/image_' + sunoMatch[1] + '.jpeg';
      }
    }
    if (track.yt_id) return 'https://img.youtube.com/vi/' + track.yt_id + '/default.jpg';
    return '';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Top 3 rank helpers
  // ═══════════════════════════════════════════════════════════════════════

  var _topThreeIds = {};

  function computeTopThree() {
    _topThreeIds = {};
    var ranked = VMA.allTracks.slice().sort(function (a, b) {
      return VMA.wilsonScore(b.avg_rating || 0, b.rating_count || 0) - VMA.wilsonScore(a.avg_rating || 0, a.rating_count || 0);
    });
    for (var i = 0; i < Math.min(3, ranked.length); i++) {
      _topThreeIds[String(ranked[i].id)] = i + 1;
    }
  }

  function interactiveStarsHTML(track) {
    var trackId = track.id;
    var userScore = VMA.userRatings[trackId];
    var avg = track.avg_rating ? Math.round(parseFloat(track.avg_rating) * 2) / 2 : 0;
    var isRated = userScore !== undefined && userScore > 0;
    var html = '';
    for (var i = 1; i <= 5; i++) {
      var cls = 'bstar';
      if (isRated) {
        cls += i <= userScore ? ' filled' : '';
      } else if (avg > 0) {
        cls += i <= Math.floor(avg) ? ' ghost' : '';
      }
      html += '<span class="' + cls + '" data-track="' + trackId + '" data-score="' + i + '">' + VMA.starSVG + '</span>';
    }
    return '<div class="track-stars' + (isRated ? ' rated' : '') + '" data-track="' + trackId + '">' + html + '</div>';
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 2. Skeleton
  // ═══════════════════════════════════════════════════════════════════════

  function showSkeleton() {
    var list = document.getElementById('trackList');
    if (!list) return;
    var html = '';
    for (var i = 0; i < 12; i++) {
      html += '<div class="skeleton-row"><div class="skel skel-thumb"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="skel skel-text w60"></div><div class="skel skel-text w30"></div></div><div class="skel skel-btn"></div></div>';
    }
    list.innerHTML = html;
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 3. Genre Pills
  // ═══════════════════════════════════════════════════════════════════════

  function renderGenrePills() {
    var container = document.getElementById('genrePills');
    if (!container) return;

    var html = '<a class="genre-pill' + (!currentGenreSlug ? ' active' : '') + '" href="/" data-genre="">All Genres</a>';
    var parents = VMA.GENRE_PARENT_LIST;
    var slugs = VMA.GENRE_SLUGS;
    var emojis = VMA.GENRE_PARENT_EMOJIS;

    parents.forEach(function (g) {
      var slug = slugs[g];
      var emoji = emojis[g] || '';
      var active = currentGenreSlug === slug ? ' active' : '';
      html += '<a class="genre-pill' + active + '" href="/?genre=' + slug + '" data-genre="' + slug + '">' + emoji + ' ' + g + '</a>';
    });
    container.innerHTML = html;

    // Scroll active pill into view
    requestAnimationFrame(function () {
      var activePill = container.querySelector('.genre-pill.active');
      if (activePill) activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      updateGenreArrows();
    });

    // Render subgenres for active parent
    renderSubgenrePills();
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 4. Subgenre Pills
  // ═══════════════════════════════════════════════════════════════════════

  function renderSubgenrePills() {
    var wrap = document.getElementById('subgenreWrap');
    var container = document.getElementById('subgenrePills');
    if (!wrap || !container) return;

    var genreName = currentGenreSlug ? VMA.SLUG_TO_GENRE[currentGenreSlug] : null;
    if (!genreName) { wrap.style.display = 'none'; currentSubgenre = null; return; }

    // Collect subgenres that actually have tracks
    var parentSubs = VMA.SUBGENRES_BY_PARENT[genreName] || [];
    if (parentSubs.length === 0) { wrap.style.display = 'none'; currentSubgenre = null; return; }

    var tracks = VMA.allTracks;
    var subCounts = {};
    tracks.forEach(function (t) {
      if (VMA.resolveGenre(t.genre) !== genreName) return;
      var g = (t.genre || '').trim();
      if (g && g !== genreName) {
        subCounts[g] = (subCounts[g] || 0) + 1;
      }
    });

    // Sort by count descending
    var subs = Object.entries(subCounts).sort(function (a, b) { return b[1] - a[1]; });
    if (subs.length === 0) { wrap.style.display = 'none'; currentSubgenre = null; return; }

    var html = '<span class="subgenre-pill' + (!currentSubgenre ? ' active' : '') + '" data-sub="">All ' + VMA.sanitize(genreName) + '</span>';
    subs.forEach(function (entry) {
      var sub = entry[0];
      var count = entry[1];
      var active = currentSubgenre && currentSubgenre.toLowerCase() === sub.toLowerCase() ? ' active' : '';
      html += '<span class="subgenre-pill' + active + '" data-sub="' + VMA.sanitizeAttr(sub) + '">' + VMA.sanitize(sub) + ' <span style="opacity:.5">' + count + '</span></span>';
    });
    container.innerHTML = html;
    wrap.style.display = '';
    requestAnimationFrame(updateSubArrows);
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 5. Arrow helpers
  // ═══════════════════════════════════════════════════════════════════════

  function updateArrows(scrollEl, arrowL, arrowR) {
    if (!scrollEl || !arrowL || !arrowR) return;
    arrowL.classList.toggle('show', scrollEl.scrollLeft > 10);
    arrowR.classList.toggle('show', scrollEl.scrollLeft < scrollEl.scrollWidth - scrollEl.clientWidth - 10);
  }

  function updateGenreArrows() {
    updateArrows(
      document.getElementById('genrePills'),
      document.getElementById('genreArrowL'),
      document.getElementById('genreArrowR')
    );
  }

  function updateSubArrows() {
    updateArrows(
      document.getElementById('subgenrePills'),
      document.getElementById('subArrowL'),
      document.getElementById('subArrowR')
    );
  }

  function initArrows(scrollEl, arrowL, arrowR) {
    if (!scrollEl || !arrowL || !arrowR) return;
    var update = function () { updateArrows(scrollEl, arrowL, arrowR); };
    arrowL.addEventListener('click', function () { scrollEl.scrollBy({ left: -200, behavior: 'smooth' }); });
    arrowR.addEventListener('click', function () { scrollEl.scrollBy({ left: 200, behavior: 'smooth' }); });
    scrollEl.addEventListener('scroll', update, { passive: true });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 6. Genre Nav Sticky Behavior
  // ═══════════════════════════════════════════════════════════════════════

  function initSticky() {
    var genreNav = document.getElementById('genreNav');
    var sentinel = document.getElementById('howInline') || document.getElementById('hero');
    if (!genreNav || !sentinel) return;

    var observer = new IntersectionObserver(function (entries) {
      genreNav.classList.toggle('sticky', !entries[0].isIntersecting);
    }, { threshold: 0 });
    observer.observe(sentinel);

    _cleanup.push(function () { observer.disconnect(); });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 7. Filtering & Sorting
  // ═══════════════════════════════════════════════════════════════════════

  function applyFilters() {
    var genreName = currentGenreSlug ? VMA.SLUG_TO_GENRE[currentGenreSlug] : null;

    // Genre filter
    filteredTracks = genreName
      ? VMA.allTracks.filter(function (t) { return VMA.resolveGenre(t.genre) === genreName; })
      : VMA.allTracks.slice();

    // Subgenre filter
    if (currentSubgenre && genreName) {
      var sub = currentSubgenre.toLowerCase();
      filteredTracks = filteredTracks.filter(function (t) {
        var g = (t.genre || '').toLowerCase().trim();
        return g === sub || g.includes(sub);
      });
    }

    // Search filter
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      filteredTracks = filteredTracks.filter(function (t) {
        return (t.title && t.title.toLowerCase().includes(q)) ||
               (t.genre && t.genre.toLowerCase().includes(q)) ||
               (t.tool && t.tool.toLowerCase().includes(q));
      });
    }

    sortTracks();
    updateTrackCount();
    displayCount = DISPLAY_CHUNK;
    renderList();
  }

  function sortTracks() {
    sortedTracks = filteredTracks.slice();
    if (currentSort === 'top') {
      sortedTracks.sort(function (a, b) {
        return VMA.wilsonScore(b.avg_rating || 0, b.rating_count || 0) - VMA.wilsonScore(a.avg_rating || 0, a.rating_count || 0);
      });
    } else if (currentSort === 'newest') {
      sortedTracks.sort(function (a, b) {
        return new Date(b.created_at) - new Date(a.created_at);
      });
    } else if (currentSort === 'most') {
      sortedTracks.sort(function (a, b) {
        return (b.rating_count || 0) - (a.rating_count || 0);
      });
    }
  }

  function updateTrackCount() {
    var el = document.getElementById('trackCount');
    if (el) el.textContent = filteredTracks.length + ' tracks';
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 8. Track List (compact rows)
  // ═══════════════════════════════════════════════════════════════════════

  function renderList() {
    var list = document.getElementById('trackList');
    if (!list) return;

    // Sync active track state with Player module
    var activeTrackId = Player ? Player.listTrackId : null;

    var visible = sortedTracks.slice(0, displayCount);

    if (visible.length === 0) {
      var emptyMsg = searchQuery ? 'No tracks match "' + VMA.sanitize(searchQuery) + '"' : 'No tracks found for this filter.';
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDD0D</div><p>' + emptyMsg + '</p><p style="font-size:0.78rem;color:var(--muted);margin-top:6px">Try a different genre or clear your search.</p></div>';
      var wrap = document.getElementById('loadMoreWrap');
      if (wrap) wrap.style.display = 'none';
      return;
    }

    // Playing iframes live in #persistent-media (outside trackList),
    // so innerHTML rebuild is safe — audio never gets destroyed.
    list.innerHTML = visible.map(function (t) { return buildTrackRow(t, activeTrackId); }).join('');

    // Load more button
    var loadWrap = document.getElementById('loadMoreWrap');
    if (loadWrap) {
      if (displayCount < sortedTracks.length) {
        loadWrap.style.display = '';
        var loadBtn = document.getElementById('loadMoreBtn');
        if (loadBtn) loadBtn.textContent = 'Load More (' + (sortedTracks.length - displayCount) + ' remaining)';
      } else {
        loadWrap.style.display = 'none';
      }
    }
  }

  function buildTrackRow(t, activeTrackId) {
    var thumb = getThumb(t);
    var rank = _topThreeIds[String(t.id)] || 0;
    var isTop3 = rank >= 1 && rank <= 3 && currentSort === 'top' && !currentGenreSlug && !searchQuery;
    var rankBadges = ['', '\uD83C\uDFC6 #1', '#2', '#3'];
    var thumbCls = 'track-thumb' + (isTop3 ? ' track-thumb-lg' : '');
    var thumbHTML = thumb
      ? '<img class="' + thumbCls + '" src="' + thumb + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
      : '<div class="' + thumbCls + '" style="display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:var(--muted)">\uD83C\uDFB5</div>';
    var avg = t.avg_rating ? parseFloat(t.avg_rating).toFixed(1) : '\u2014';
    var count = t.rating_count || 0;
    var genre = VMA.resolveGenre(t.genre);
    var tool = t.tool || '';
    var isPlaying = activeTrackId !== null && String(t.id) === String(activeTrackId);
    var playIcon = isPlaying
      ? '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>';
    var noteToggle = t.artist_note
      ? '<span class="track-note-toggle" data-action="toggle-note" data-track="' + t.id + '">Artist Note</span>'
      : '';
    var user = VMA.currentUser;
    var commentFormHTML = user
      ? '<div class="comment-form"><input class="comment-input" placeholder="Add a comment..." maxlength="500"><button class="comment-submit" data-action="post-comment" data-track="' + t.id + '">Post</button></div>'
      : '<div style="font-size:.72rem;color:var(--muted);margin-top:8px;"><a href="/login.html" style="color:var(--accent);">Log in</a> to comment</div>';
    var rankHTML = isTop3 ? '<span class="track-rank rank-' + rank + '">' + rankBadges[rank] + '</span>' : '';

    return '<div class="track-row' + (isPlaying ? ' playing' : '') + (isTop3 ? ' top-' + rank : '') + '" data-track-id="' + t.id + '" data-title="' + VMA.sanitizeAttr(t.title || 'Untitled') + '" data-tool="' + VMA.sanitizeAttr(tool) + '" data-genre="' + VMA.sanitizeAttr(genre) + '">' +
      rankHTML +
      thumbHTML +
      '<div class="track-info">' +
        '<div class="track-title" title="' + VMA.sanitizeAttr(t.title || '') + '">' + VMA.sanitize(t.title || 'Untitled') + '</div>' +
        '<div class="track-badges">' +
          (tool ? '<span class="track-badge tool">' + VMA.sanitize(tool) + '</span>' : '') +
          '<span class="track-badge genre">' + VMA.sanitize(genre) + '</span>' +
          noteToggle +
        '</div>' +
      '</div>' +
      '<div class="track-rating">' +
        '<span class="track-rating-num">' + avg + '</span>' +
        interactiveStarsHTML(t) +
        '<span class="track-rating-count">(' + count + ')</span>' +
      '</div>' +
      '<div class="track-actions">' +
        '<button class="track-action-btn" data-action="comments" data-track="' + t.id + '" title="Comments" aria-label="Comments"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>' +
        '<button class="track-action-btn" data-action="share" data-track="' + t.id + '" data-title="' + VMA.sanitizeAttr(t.title || 'Untitled') + '" title="Share" aria-label="Share"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></button>' +
      '</div>' +
      '<button class="track-play" aria-label="' + (isPlaying ? 'Stop' : 'Play') + '" data-action="play" data-track-id="' + t.id + '">' +
        playIcon +
      '</button>' +
      (t.artist_note ? '<div class="track-note-text" id="note-' + t.id + '">' + VMA.sanitize(t.artist_note) + '</div>' : '') +
      '<div class="comments-panel" id="comments-' + t.id + '">' +
        '<div class="comments-inner" id="cc-' + t.id + '" data-track-id="' + t.id + '" data-comment-limit="30"></div>' +
        commentFormHTML +
      '</div>' +
      '<div class="track-embed-area" id="embed-' + t.id + '"></div>' +
    '</div>';
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 9. Playback delegation
  // ═══════════════════════════════════════════════════════════════════════

  function playTrack(trackId) {
    if (Player && typeof Player.playTrack === 'function') {
      Player.playTrack(trackId);
      if (typeof gtag === 'function') {
        gtag('event', 'playlist_play', { track_id: trackId });
      }
    }
  }

  function locateTrack() {
    var activeId = Player ? Player.listTrackId : null;
    if (activeId === null) return;

    // Find track data to determine its genre
    var track = VMA.getTrack(activeId);
    if (!track) return;

    // Check if track is in the current filtered+sorted view
    var inView = false;
    for (var i = 0; i < sortedTracks.length; i++) {
      if (String(sortedTracks[i].id) === String(activeId)) { inView = true; break; }
    }

    // If not in current view, switch to "All Genres" and clear search
    if (!inView) {
      currentGenreSlug = null;
      currentSubgenre = null;
      searchQuery = '';
      var searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      var searchClear = document.getElementById('searchClear');
      if (searchClear) searchClear.classList.remove('show');
      window.history.pushState({}, '', '/');
      renderGenrePills();
      applyFilters();
    }

    // Expand displayCount if track is beyond current page
    var idx = -1;
    for (var j = 0; j < sortedTracks.length; j++) {
      if (String(sortedTracks[j].id) === String(activeId)) { idx = j; break; }
    }
    if (idx >= 0 && idx >= displayCount) {
      displayCount = idx + DISPLAY_CHUNK;
      renderList();
    }

    // Scroll to row and flash highlight
    var row = document.querySelector('.track-row[data-track-id="' + activeId + '"]');
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.boxShadow = '0 0 0 2px var(--accent), 0 8px 32px rgba(232,255,71,0.15)';
      setTimeout(function () { row.style.boxShadow = ''; }, 2000);
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 10. Star hover/click delegation
  // ═══════════════════════════════════════════════════════════════════════

  function onStarMouseOver(e) {
    var star = e.target.closest('.bstar');
    if (!star) return;
    var container = star.closest('.track-stars');
    if (!container || container.classList.contains('rated')) return;
    var score = parseInt(star.dataset.score);
    container.querySelectorAll('.bstar').forEach(function (s) {
      s.classList.toggle('hover-fill', parseInt(s.dataset.score) <= score);
      s.classList.remove('ghost');
    });
  }

  function onStarMouseOut(e) {
    var star = e.target.closest('.bstar');
    if (!star) return;
    var container = star.closest('.track-stars');
    if (!container || container.classList.contains('rated')) return;
    container.querySelectorAll('.bstar').forEach(function (s) {
      s.classList.remove('hover-fill');
    });
  }

  function onStarClick(e) {
    var star = e.target.closest('.bstar');
    if (!star) return;
    var container = star.closest('.track-stars');
    if (!container || container.classList.contains('rated')) return;
    var trackId = star.dataset.track;
    var score = parseInt(star.dataset.score);
    VMA.rateStar(trackId, score, container);
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 11. Artist Note toggle
  // ═══════════════════════════════════════════════════════════════════════

  function onNoteToggleClick(el) {
    var trackId = el.dataset.track;
    if (!trackId) return;
    var noteText = document.getElementById('note-' + trackId);
    if (noteText) {
      var wasOpen = noteText.classList.contains('open');
      if (_openNoteEl && _openNoteEl !== noteText) _openNoteEl.classList.remove('open');
      noteText.classList.toggle('open');
      _openNoteEl = wasOpen ? null : noteText;
      _noteScrollStart = null;
    }
  }

  function onNoteScroll() {
    if (!_openNoteEl) return;
    if (_noteScrollStart === null) { _noteScrollStart = window.scrollY; return; }
    if (Math.abs(window.scrollY - _noteScrollStart) > 150) {
      _openNoteEl.classList.remove('open');
      _openNoteEl = null;
      _noteScrollStart = null;
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 12. Show more comments
  // ═══════════════════════════════════════════════════════════════════════

  function onShowMoreComments(btn) {
    var trackId = btn.dataset.trackId;
    var newLimit = btn.dataset.newLimit;
    var contentEl = btn.parentElement;
    if (contentEl) contentEl.dataset.commentLimit = newLimit;
    var panel = btn.closest('.comments-panel');
    VMA.loadComments(trackId, panel);
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 13. Event Delegation (single click handler)
  // ═══════════════════════════════════════════════════════════════════════

  function onDocClick(e) {
    // Genre pill clicks
    var pill = e.target.closest('.genre-pill');
    if (pill && pill.closest('#genrePills')) {
      e.preventDefault();
      var newSlug = pill.dataset.genre || null;
      if (newSlug === '') newSlug = null;
      if (newSlug === currentGenreSlug) return;
      currentGenreSlug = newSlug;
      currentSubgenre = null;
      var href = newSlug ? '/?genre=' + newSlug : '/';
      window.history.pushState({}, '', href);
      if (typeof gtag === 'function') gtag('event', 'genre_switch', { genre: currentGenreSlug || 'all' });
      renderGenrePills();
      applyFilters();
      return;
    }

    // Subgenre pill clicks
    var subPill = e.target.closest('.subgenre-pill');
    if (subPill && subPill.closest('#subgenrePills')) {
      var sub = subPill.dataset.sub || null;
      if ((sub || null) === (currentSubgenre || null)) return;
      currentSubgenre = sub || null;
      renderSubgenrePills();
      applyFilters();
      if (typeof gtag === 'function') gtag('event', 'subgenre_switch', { subgenre: currentSubgenre || 'all' });
      return;
    }

    // Sort button clicks
    var sortBtn = e.target.closest('.genre-sort-btn');
    if (sortBtn && sortBtn.closest('#toolbar')) {
      var sort = sortBtn.dataset.sort;
      if (sort === currentSort) return;
      currentSort = sort;
      document.querySelectorAll('#toolbar .genre-sort-btn').forEach(function (b) { b.classList.remove('active'); });
      sortBtn.classList.add('active');
      if (typeof gtag === 'function') gtag('event', 'sort_change', { sort_mode: sort });
      sortTracks();
      displayCount = DISPLAY_CHUNK;
      renderList();
      return;
    }

    // Track row play button
    var playBtn = e.target.closest('[data-action="play"]');
    if (playBtn) {
      e.preventDefault();
      e.stopPropagation();
      playTrack(playBtn.dataset.trackId);
      return;
    }

    // Artist note toggle
    var noteToggle = e.target.closest('[data-action="toggle-note"]');
    if (noteToggle) {
      onNoteToggleClick(noteToggle);
      return;
    }

    // Comments button
    var commentsBtn = e.target.closest('[data-action="comments"]');
    if (commentsBtn) {
      VMA.toggleComments(commentsBtn.dataset.track, commentsBtn);
      return;
    }

    // Share button
    var shareBtn = e.target.closest('[data-action="share"]');
    if (shareBtn) {
      VMA.shareTrack(shareBtn.dataset.track, shareBtn.dataset.title, shareBtn);
      return;
    }

    // Post comment
    var postBtn = e.target.closest('[data-action="post-comment"]');
    if (postBtn) {
      VMA.addComment(postBtn.dataset.track, postBtn);
      return;
    }

    // Load more button
    var loadMore = e.target.closest('#loadMoreBtn');
    if (loadMore) {
      displayCount += DISPLAY_CHUNK;
      renderList();
      return;
    }

    // Show more comments
    var showMore = e.target.closest('.comments-show-more');
    if (showMore) {
      onShowMoreComments(showMore);
      return;
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 14. Search (300ms debounce)
  // ═══════════════════════════════════════════════════════════════════════

  function initSearch() {
    var searchInput = document.getElementById('searchInput');
    var searchClear = document.getElementById('searchClear');

    if (searchInput) {
      var onSearchInput = function () {
        clearTimeout(searchTimeout);
        var val = searchInput.value.trim();
        if (searchClear) searchClear.classList.toggle('show', val.length > 0);
        searchTimeout = setTimeout(function () {
          searchQuery = val;
          applyFilters();
        }, 300);
      };
      searchInput.addEventListener('input', onSearchInput);
      _cleanup.push(function () { searchInput.removeEventListener('input', onSearchInput); });
    }

    if (searchClear) {
      var onSearchClear = function () {
        if (searchInput) searchInput.value = '';
        searchClear.classList.remove('show');
        searchQuery = '';
        applyFilters();
      };
      searchClear.addEventListener('click', onSearchClear);
      _cleanup.push(function () { searchClear.removeEventListener('click', onSearchClear); });
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 15. Deep Link Handling
  // ═══════════════════════════════════════════════════════════════════════

  function handleDeepLink() {
    var params = new URLSearchParams(window.location.search);
    var trackParam = params.get('track');
    if (!trackParam) return;

    var track = VMA.getTrack(trackParam);
    if (!track) return;

    // Update page title and meta for this specific track
    document.title = track.title + ' \u2014 VoteMyAI';
    var ogTitle = document.querySelector('meta[property="og:title"]');
    var ogDesc  = document.querySelector('meta[property="og:description"]');
    var twTitle = document.querySelector('meta[name="twitter:title"]');
    var twDesc  = document.querySelector('meta[name="twitter:description"]');
    if (ogTitle) ogTitle.content = track.title + ' \u2014 Rate this AI track on VoteMyAI';
    if (ogDesc)  ogDesc.content  = 'Made with ' + track.tool + (track.genre ? ' \u00B7 ' + track.genre : '') + '. Listen and rate on VoteMyAI.';
    if (twTitle) twTitle.content = track.title + ' \u2014 Rate this AI track on VoteMyAI';
    if (twDesc)  twDesc.content  = 'Made with ' + track.tool + (track.genre ? ' \u00B7 ' + track.genre : '') + '. Listen and rate on VoteMyAI.';

    // Try to find track in the list and scroll to it
    requestAnimationFrame(function () {
      var targetRow = document.querySelector('.track-row[data-track-id="' + trackParam + '"]');

      // If not visible in the list, expand display count
      if (!targetRow) {
        var idx = -1;
        for (var i = 0; i < sortedTracks.length; i++) {
          if (String(sortedTracks[i].id) === String(trackParam)) { idx = i; break; }
        }
        if (idx >= 0 && idx >= displayCount) {
          displayCount = idx + DISPLAY_CHUNK;
          renderList();
          targetRow = document.querySelector('.track-row[data-track-id="' + trackParam + '"]');
        }
      }

      // Show a play overlay
      var overlay = document.createElement('div');
      overlay.id = 'deeplink-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(7,7,11,0.8);display:flex;align-items:center;justify-content:center;cursor:pointer;';
      overlay.innerHTML = '<div style="text-align:center;"><div style="width:80px;height:80px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 0 40px rgba(232,255,71,0.4);animation:deepPulse 1.5s ease-in-out infinite;cursor:pointer;"><svg width="36" height="36" viewBox="0 0 24 24" fill="#07070b"><polygon points="6 3 20 12 6 21"/></svg></div><div style="color:var(--text);font-weight:700;font-size:1rem;margin-bottom:4px;">Tap to play</div><div style="color:var(--muted);font-size:0.8rem;">' + VMA.sanitize(track.title || '') + '</div></div>';

      var style = document.createElement('style');
      style.textContent = '@keyframes deepPulse{0%,100%{transform:scale(1);box-shadow:0 0 40px rgba(232,255,71,0.4)}50%{transform:scale(1.08);box-shadow:0 0 60px rgba(232,255,71,0.6)}}';
      document.head.appendChild(style);

      overlay.addEventListener('click', function () {
        overlay.remove();
        style.remove();
        if (targetRow) {
          playTrack(trackParam);
        }
      }, { once: true });

      document.body.appendChild(overlay);

      // Scroll to the track
      if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetRow.style.boxShadow = '0 0 0 2px var(--accent), 0 12px 40px rgba(232,255,71,0.15)';
        setTimeout(function () { targetRow.style.boxShadow = ''; }, 4000);
      }

      window.history.replaceState(null, '', currentGenreSlug ? '/?genre=' + currentGenreSlug : '/');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 16. Nav Intercept — open in new tab when music is playing
  // ═══════════════════════════════════════════════════════════════════════

  function initNavIntercept() {
    var handler = function (e) {
      if (!Player || !Player.activeTrackId) return;

      // Handle btn-submit (uses onclick, so intercept in capture phase)
      var submitBtn = e.target.closest('.btn-submit');
      if (submitBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.open('/submit.html', '_blank');
        return;
      }

      var link = e.target.closest('a[href]');
      if (!link) return;

      var href = link.getAttribute('href');
      if (!href || href === '/' || href === '' || href.startsWith('#') || href.startsWith('javascript:')) return;
      if (link.target === '_blank') return;

      // Only intercept internal page links that would navigate away
      if (href.startsWith('/') && href !== '/') {
        e.preventDefault();
        window.open(href, '_blank');
      }
    };
    // Capture phase to intercept before onclick handlers
    document.addEventListener('click', handler, true);
    _cleanup.push(function () { document.removeEventListener('click', handler, true); });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 17. Drag-to-scroll for horizontal containers
  // ═══════════════════════════════════════════════════════════════════════

  function initDragScroll() {
    ['genrePills', 'subgenrePills'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        var mouseHandler = function (e) { VMA.onDragStart(e, el); };
        var touchHandler = function (e) { VMA.onDragStart(e, el); };
        el.addEventListener('mousedown', mouseHandler);
        el.addEventListener('touchstart', touchHandler, { passive: true });
        _cleanup.push(function () {
          el.removeEventListener('mousedown', mouseHandler);
          el.removeEventListener('touchstart', touchHandler);
        });
      }
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 18. PopState handler (browser back/forward)
  // ═══════════════════════════════════════════════════════════════════════

  function onPopState() {
    var params = new URLSearchParams(window.location.search);
    currentGenreSlug = params.get('genre') || null;
    currentSubgenre = null;
    renderGenrePills();
    applyFilters();
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 19. Track Data Events
  // ═══════════════════════════════════════════════════════════════════════

  function onTracksReady() {
    computeTopThree();
    renderGenrePills();
    applyFilters();
    handleDeepLink();
  }

  function onTracksUpdated() {
    computeTopThree();
    applyFilters();
  }

  function onTracksError() {
    var list = document.getElementById('trackList');
    if (list) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">\u26A0\uFE0F</div><p>Could not load tracks. Please refresh the page.</p><button class="load-more-btn" onclick="location.reload()" style="margin-top:12px">Retry</button></div>';
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 20. Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  function cleanup() {
    // Clear pending search debounce
    clearTimeout(searchTimeout);

    // Close open panels
    if (_openCommentPanel) { _openCommentPanel.classList.remove('open'); _openCommentPanel = null; }
    if (_openNoteEl) { _openNoteEl.classList.remove('open'); _openNoteEl = null; }

    // Run all registered cleanup callbacks
    _cleanup.forEach(function (fn) { fn(); });
    _cleanup = [];
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 21. Init
  // ═══════════════════════════════════════════════════════════════════════

  function init() {
    // Scroll restoration
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    // Parse genre from URL
    var params = new URLSearchParams(window.location.search);
    var genreParam = params.get('genre');
    if (genreParam) currentGenreSlug = genreParam;

    // Render genre pills and skeleton
    renderGenrePills();
    showSkeleton();

    // Init sticky genre nav
    initSticky();

    // Init search
    initSearch();

    // Init drag-to-scroll
    initDragScroll();

    // Init nav intercept (open in new tab when music plays)
    initNavIntercept();

    // Init scroll arrows
    var genrePillsEl = document.getElementById('genrePills');
    var subPillsEl = document.getElementById('subgenrePills');
    if (genrePillsEl) {
      initArrows(genrePillsEl, document.getElementById('genreArrowL'), document.getElementById('genreArrowR'));
    }
    if (subPillsEl) {
      initArrows(subPillsEl, document.getElementById('subArrowL'), document.getElementById('subArrowR'));
    }

    // Document-level event listeners
    document.addEventListener('click', onDocClick);
    document.addEventListener('mouseover', onStarMouseOver);
    document.addEventListener('mouseout', onStarMouseOut);
    document.addEventListener('click', onStarClick);
    window.addEventListener('scroll', onNoteScroll, { passive: true });
    window.addEventListener('popstate', onPopState);

    _cleanup.push(function () {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('mouseover', onStarMouseOver);
      document.removeEventListener('mouseout', onStarMouseOut);
      document.removeEventListener('click', onStarClick);
      window.removeEventListener('scroll', onNoteScroll);
      window.removeEventListener('popstate', onPopState);
    });

    // Track data events
    document.addEventListener('vma:tracks-loaded', onTracksReady);
    document.addEventListener('vma:tracks-updated', onTracksUpdated);
    document.addEventListener('vma:tracks-error', onTracksError);
    _cleanup.push(function () {
      document.removeEventListener('vma:tracks-loaded', onTracksReady);
      document.removeEventListener('vma:tracks-updated', onTracksUpdated);
      document.removeEventListener('vma:tracks-error', onTracksError);
    });

    // If tracks are already loaded, render immediately
    if (VMA.allTracks.length > 0) {
      onTracksReady();
    }

    if (typeof gtag === 'function') {
      gtag('event', 'page_view', { page: 'main', genre: currentGenreSlug || 'all' });
    }
  }

  // Register cleanup and page API on VMA
  if (VMA) {
    VMA._pageCleanup = cleanup;
    VMA.mainPage = {
      expandToTrack: function (trackId) {
        var idx = -1;
        for (var i = 0; i < sortedTracks.length; i++) {
          if (String(sortedTracks[i].id) === String(trackId)) { idx = i; break; }
        }
        if (idx >= 0 && idx >= displayCount) {
          displayCount = idx + DISPLAY_CHUNK;
          renderList();
        }
      },
      locateTrack: locateTrack
    };
    _cleanup.push(function () { VMA.mainPage = null; });
  }

  init();
})();
