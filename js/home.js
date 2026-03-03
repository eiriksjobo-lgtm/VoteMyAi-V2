/**
 * VoteMyAI — Home Page Module
 *
 * Contains all home-page-specific logic: browse system (Netflix-style genre
 * rows), search, leaderboard, deep-link handling, and event wiring.
 *
 * Runs as an IIFE whenever the home content fragment is loaded into
 * #spa-content by the router. Exposes a cleanup function via VMA._pageCleanup.
 */
(function () {
  'use strict';

  const VMA    = window.VMA;
  const Player = window.VMAPlayer;

  // Shorthand references to shared helpers / state exposed by app.js
  const sanitize     = VMA.sanitize;
  const sanitizeAttr = VMA.sanitizeAttr;
  const starSVG      = VMA.starSVG;
  const getEmbedHtml = VMA.getEmbedHtml;
  const wilsonScore  = VMA.wilsonScore;
  const getTrack     = VMA.getTrack;

  let _cleanup = [];

  // =========================================================================
  // Scroll restoration
  // =========================================================================
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  // =========================================================================
  // Browse System — Netflix-style genre rows
  // =========================================================================

  let browseView    = 'discover';
  let searchQuery   = '';
  let browseCardUid = 0;
  let _sortCache    = { view: null, len: 0, result: null };
  let _trackIndex   = null;

  // --- Genre constants ---

  const GENRE_EMOJIS = {
    'Pop': '\uD83C\uDFB5', 'Synth-Pop': '\uD83C\uDFB5', 'Indie Pop': '\uD83C\uDFB5', 'Electropop': '\uD83C\uDFB5', 'Dream Pop': '\uD83C\uDFB5', 'K-Pop': '\u2728', 'J-Pop': '\u2728', 'Art Pop': '\uD83C\uDFB5', 'Dance Pop': '\uD83C\uDFB5',
    'Rock': '\uD83C\uDFB8', 'Indie Rock': '\uD83C\uDFB8', 'Alt Rock': '\uD83C\uDFB8', 'Punk Rock': '\uD83C\uDFB8', 'Post-Punk': '\uD83C\uDFB8', 'Garage Rock': '\uD83C\uDFB8', 'Psychedelic Rock': '\uD83C\uDFB8', 'Prog Rock': '\uD83C\uDFB8', 'Shoegaze': '\uD83C\uDFB8', 'Grunge': '\uD83C\uDFB8', 'Britpop': '\uD83C\uDFB8',
    'Hip-Hop': '\uD83C\uDFA4', 'Trap': '\uD83C\uDFA4', 'Boom Bap': '\uD83C\uDFA4', 'Lo-Fi Hip-Hop': '\uD83C\uDFA4', 'Drill': '\uD83C\uDFA4', 'Conscious Rap': '\uD83C\uDFA4', 'Old School Hip-Hop': '\uD83C\uDFA4', 'Cloud Rap': '\uD83C\uDFA4',
    'Electronic': '\u26A1', 'House': '\u26A1', 'Deep House': '\u26A1', 'Tech House': '\u26A1', 'Techno': '\u26A1', 'Trance': '\u26A1', 'Dubstep': '\u26A1', 'Drum & Bass': '\uD83E\uDD41', 'IDM': '\u26A1', 'Breakbeat': '\u26A1', 'Garage': '\u26A1', 'Hardstyle': '\u26A1', 'Eurodance': '\u26A1', 'Italo Disco': '\u26A1', 'Synthwave': '\u26A1', 'Electro': '\u26A1', 'Future Bass': '\u26A1',
    'R&B / Soul': '\uD83D\uDC9C', 'Neo Soul': '\uD83D\uDC9C', 'Contemporary R&B': '\uD83D\uDC9C', 'Motown': '\uD83D\uDC9C', 'Funk': '\uD83D\uDD7A', 'Disco': '\uD83D\uDD7A',
    'Dance': '\uD83D\uDC83', 'EDM': '\uD83D\uDC83', 'Nu-Disco': '\uD83D\uDC83', 'Tropical House': '\uD83D\uDC83', 'Afro House': '\uD83D\uDC83', 'Dancehall': '\uD83D\uDC83',
    'Metal': '\uD83E\uDD18', 'Heavy Metal': '\uD83E\uDD18', 'Death Metal': '\uD83E\uDD18', 'Black Metal': '\uD83E\uDD18', 'Doom Metal': '\uD83E\uDD18', 'Thrash Metal': '\uD83E\uDD18', 'Metalcore': '\uD83E\uDD18', 'Nu Metal': '\uD83E\uDD18', 'Power Metal': '\uD83E\uDD18', 'Symphonic Metal': '\uD83E\uDD18',
    'Jazz': '\uD83C\uDFB7', 'Smooth Jazz': '\uD83C\uDFB7', 'Bebop': '\uD83C\uDFB7', 'Jazz Fusion': '\uD83C\uDFB7', 'Acid Jazz': '\uD83C\uDFB7', 'Nu Jazz': '\uD83C\uDFB7', 'Swing': '\uD83C\uDFB7',
    'Classical': '\uD83C\uDFBB', 'Orchestral': '\uD83C\uDFBB', 'Cinematic': '\uD83C\uDFAC', 'Neoclassical': '\uD83C\uDFBB', 'Baroque': '\uD83C\uDFBB', 'Romantic': '\uD83C\uDFBB', 'Chamber Music': '\uD83C\uDFBB', 'Film Score': '\uD83C\uDFAC', 'Epic Orchestral': '\uD83C\uDFAC',
    'Indie / Folk': '\uD83C\uDF42', 'Folk': '\uD83C\uDF42', 'Acoustic': '\uD83C\uDF42', 'Singer-Songwriter': '\uD83C\uDF42', 'Indie Folk': '\uD83C\uDF42', 'Americana': '\uD83C\uDF42', 'Bluegrass': '\uD83C\uDF42', 'Celtic': '\uD83C\uDF42',
    'Latin': '\uD83D\uDC83', 'Reggaeton': '\uD83D\uDC83', 'Salsa': '\uD83D\uDC83', 'Bossa Nova': '\uD83D\uDC83', 'Latin Pop': '\uD83D\uDC83', 'Cumbia': '\uD83D\uDC83', 'Bachata': '\uD83D\uDC83', 'Merengue': '\uD83D\uDC83',
    'Country': '\uD83E\uDD20', 'Country Rock': '\uD83E\uDD20', 'Outlaw Country': '\uD83E\uDD20', 'Alt Country': '\uD83E\uDD20', 'Honky Tonk': '\uD83E\uDD20',
    'Ambient': '\uD83C\uDF0C', 'Lo-Fi': '\u2615', 'Chillout': '\u2615', 'Chillwave': '\u2615', 'Downtempo': '\u2615', 'New Age': '\uD83C\uDF0C', 'Space Ambient': '\uD83C\uDF0C', 'Vaporwave': '\u2615',
    'Reggae': '\uD83C\uDF34', 'Dub': '\uD83C\uDF34', 'Ska': '\uD83C\uDF34', 'Rocksteady': '\uD83C\uDF34', 'Soca': '\uD83C\uDF34', 'Calypso': '\uD83C\uDF34',
    'Afrobeat': '\uD83C\uDF0D', 'Afrobeats': '\uD83C\uDF0D', 'Amapiano': '\uD83C\uDF0D', 'Highlife': '\uD83C\uDF0D', 'Juju': '\uD83C\uDF0D',
    'Blues': '\uD83C\uDFB9', 'Delta Blues': '\uD83C\uDFB9', 'Chicago Blues': '\uD83C\uDFB9', 'Blues Rock': '\uD83C\uDFB9', 'Rhythm & Blues': '\uD83C\uDFB9',
    'World Music': '\uD83C\uDF0E', 'Middle Eastern': '\uD83C\uDF0E', 'Indian': '\uD83C\uDF0E', 'Asian': '\uD83C\uDF0E', 'Flamenco': '\uD83C\uDF0E', 'Polka': '\uD83C\uDF0E', 'Experimental': '\uD83D\uDD2C', 'Noise': '\uD83D\uDD2C',
    'Other': '\uD83C\uDFB6'
  };

  const GENRE_TO_SLUG = {
    'Pop':'pop','Rock':'rock','Hip-Hop':'hip-hop','Electronic':'electronic',
    'R&B / Soul':'r-b-soul','Funk':'funk','Metal':'metal','Jazz':'jazz',
    'Classical':'classical','Cinematic':'cinematic','Indie / Folk':'indie-folk',
    'Latin':'latin','Country':'country','Ambient':'ambient','Reggae':'reggae',
    'Afrobeat':'afrobeat','Blues':'blues','Other':'other'
  };

  // =========================================================================
  // buildBrowseCard
  // =========================================================================

  function buildBrowseCard(track, embed) {
    var uid = 'bc-' + (browseCardUid++);
    var avg = track.avg_rating || 0;
    var cnt = track.rating_count || 0;
    var userScore = (VMA.userRatings[track.id]) || 0;
    var isRated = userScore > 0;
    var plat = embed.platform !== 'unknown' ? embed.platform.charAt(0).toUpperCase() + embed.platform.slice(1) : '';
    var isHot = cnt >= 3;
    var isNew = (Date.now() - new Date(track.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
    var trackIdAttr = sanitizeAttr(String(track.id));
    var titleAttr   = sanitizeAttr(track.title || '');

    var thumbSrc = track.thumbnail_url || '';
    // For Suno: derive fresh thumbnail from song UUID
    if (embed.platform === 'suno') {
      var sunoMatch = (track.embed_url || '').match(/suno\.com\/(?:song|embed)\/([a-f0-9-]{36})/);
      if (sunoMatch) thumbSrc = 'https://cdn2.suno.ai/image_' + sunoMatch[1] + '.jpeg';
    }
    if (!thumbSrc && embed.platform === 'youtube') {
      var match = (track.embed_url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([^&?\/#]+)/) || [null, track.yt_id];
      if (match[1]) thumbSrc = 'https://img.youtube.com/vi/' + match[1] + '/hqdefault.jpg';
    }

    var starsHtml = '';
    var avgRounded = Math.round(track.avg_rating || 0);
    for (var s = 1; s <= 5; s++) {
      var cls = isRated && s <= userScore ? 'filled' : (!isRated && avgRounded > 0 && s <= avgRounded ? 'ghost' : '');
      starsHtml += '<div class="bstar ' + cls + '" data-track="' + trackIdAttr + '" data-score="' + s + '">' + starSVG + '</div>';
    }

    return '<div class="browse-card" id="' + uid + '" data-track-id="' + trackIdAttr + '" data-uid="' + uid + '">' +
      '<div class="browse-card-thumb" data-action="load-embed" data-uid="' + uid + '" data-track-id="' + trackIdAttr + '">' +
        (thumbSrc ? '<img src="' + sanitizeAttr(thumbSrc) + '" alt="' + titleAttr + '" loading="lazy" draggable="false">' : '<div style="width:100%;height:100%;background:var(--surface-2);"></div>') +
        '<button class="browse-card-play" data-action="load-embed" data-uid="' + uid + '" data-track-id="' + trackIdAttr + '"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>' +
        (plat ? '<span class="browse-card-platform">' + plat + '</span>' : '') +
        (isHot ? '<span class="browse-card-hot"><span class="dot"></span> HOT</span>' : '') +
        (isNew && !isHot ? '<span class="browse-card-new">NEW</span>' : '') +
      '</div>' +
      '<div class="browse-card-body">' +
        '<div class="browse-card-title">' + sanitize(track.title) + '</div>' +
        '<div class="browse-card-meta">' +
          '<span class="browse-card-badge tool">' + sanitize(track.tool) + '</span>' +
          '<span class="browse-card-badge genre">' + sanitize(track.genre) + '</span>' +
        '</div>' +
        '<div class="browse-card-rating">' +
          '<div class="browse-card-stars ' + (isRated ? 'rated' : '') + '">' + starsHtml + '</div>' +
          '<div class="browse-card-score">' +
            '<div class="browse-card-score-num">' + (avg > 0 ? avg.toFixed(1) : '\u2014') + '</div>' +
            '<div class="browse-card-score-count">' + cnt + ' rating' + (cnt !== 1 ? 's' : '') + '</div>' +
          '</div>' +
        '</div>' +
        (track.artist_note ? '<div class="browse-card-note"><div class="browse-card-note-toggle" data-action="toggle-note" data-uid="' + uid + '">\uD83D\uDCDD Artist\'s Note</div><div class="browse-card-note-text" id="note-' + uid + '">' + sanitize(track.artist_note) + '</div></div>' : '') +
        '<div class="browse-card-footer">' +
          '<button data-action="comments" data-track="' + trackIdAttr + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Comments</button>' +
          '<button data-action="share" data-track="' + trackIdAttr + '" data-title="' + titleAttr + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share</button>' +
        '</div>' +
      '</div>' +
      '<div class="comments-panel" id="cp-' + uid + '"><div class="comments-inner"><div id="cc-' + uid + '" data-track-id="' + track.id + '"><span style="color:var(--muted);font-size:0.8rem;">Loading...</span></div>' +
      (VMA.currentUser ? '<div class="comment-form"><textarea class="comment-input" id="ci-' + uid + '" data-track-id="' + trackIdAttr + '" placeholder="Write a comment..." rows="2"></textarea><div class="comment-form-actions"><button class="comment-submit" data-action="post-comment" data-track="' + trackIdAttr + '" data-uid="' + uid + '"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg> Send</button></div></div>' : '<p style="font-size:0.75rem;color:var(--muted);margin-top:8px;"><a href="/login.html" style="color:var(--accent);text-decoration:none;font-weight:600;">Log in</a> to comment</p>') +
      '</div></div>' +
    '</div>';
  }

  // =========================================================================
  // sortBrowseTracks — cached sort by view mode
  // =========================================================================

  function sortBrowseTracks(tracks) {
    if (_sortCache.view === browseView && _sortCache.len === tracks.length && _sortCache.result) return _sortCache.result;
    var result;
    switch (browseView) {
      case 'top':
        result = [].concat(tracks).sort(function (a, b) { return wilsonScore(b.avg_rating||0, b.rating_count||0) - wilsonScore(a.avg_rating||0, a.rating_count||0); });
        break;
      case 'new':
        result = [].concat(tracks).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
        break;
      default:
        result = [].concat(tracks).sort(function (a, b) {
          var ca = a.rating_count||0, cb = b.rating_count||0;
          if (ca <= 5 && cb > 5) return -1;
          if (cb <= 5 && ca > 5) return 1;
          return new Date(b.created_at) - new Date(a.created_at);
        });
        break;
    }
    _sortCache = { view: browseView, len: tracks.length, result: result };
    return result;
  }

  // =========================================================================
  // getTrackIndex — fast search index
  // =========================================================================

  function getTrackIndex() {
    if (_trackIndex && _trackIndex.size === VMA.allTracks.length) return _trackIndex;
    _trackIndex = new Map();
    VMA.allTracks.forEach(function (t) {
      var key = ((t.title || '') + ' ' + (t.genre || '') + ' ' + (t.tool || '')).toLowerCase();
      _trackIndex.set(t.id, key);
    });
    return _trackIndex;
  }

  // =========================================================================
  // Efficient partial sort: O(n) for finding top-k instead of O(n log n)
  // =========================================================================

  function partialSort(arr, k, compareFn) {
    if (arr.length <= k) return [].concat(arr).sort(compareFn);
    var result = arr.slice(0, k).sort(compareFn);
    for (var i = k; i < arr.length; i++) {
      if (compareFn(arr[i], result[k - 1]) < 0) {
        result[k - 1] = arr[i];
        var j = k - 1;
        while (j > 0 && compareFn(result[j], result[j - 1]) < 0) {
          var tmp = result[j]; result[j] = result[j - 1]; result[j - 1] = tmp;
          j--;
        }
      }
    }
    return result;
  }

  // =========================================================================
  // renderBrowse — main render with genre grouping + lazy IO hydration
  // =========================================================================

  function renderBrowse() {
    var container       = document.getElementById('browseRows');
    var searchContainer = document.getElementById('searchResults');
    if (!container) return;
    var sorted = sortBrowseTracks(VMA.allTracks);

    var browseCount = document.getElementById('browseCount');
    if (browseCount) browseCount.textContent = sorted.length + ' track' + (sorted.length !== 1 ? 's' : '');

    // --- Search mode ---
    if (searchQuery.length >= 2) {
      container.style.display = 'none';
      if (searchContainer) searchContainer.style.display = 'grid';
      var q   = searchQuery.toLowerCase();
      var idx = getTrackIndex();
      var results = [];
      for (var i = 0; i < sorted.length && results.length < 60; i++) {
        var t = sorted[i];
        if ((idx.get(t.id) || '').includes(q)) results.push(t);
      }
      if (results.length) {
        searchContainer.innerHTML = '';
        var frag = document.createDocumentFragment();
        results.forEach(function (t) {
          var div = document.createElement('div');
          div.innerHTML = buildBrowseCard(t, getEmbedHtml(t));
          frag.appendChild(div.firstChild);
        });
        searchContainer.appendChild(frag);
      } else {
        searchContainer.innerHTML = '<div class="search-results-empty"><p>No tracks found for "' + sanitize(searchQuery) + '"</p><span>Try a different search term</span></div>';
      }
      return;
    }

    container.style.display = 'block';
    if (searchContainer) searchContainer.style.display = 'none';

    // --- Map subgenres to parent categories ---
    var GENRE_PARENTS = {
      // Pop
      'Synth-Pop':'Pop','Synthpop':'Pop','Indie Pop':'Pop','Electropop':'Pop','Dream Pop':'Pop','K-Pop':'Pop','Kpop':'Pop','J-Pop':'Pop','Jpop':'Pop','Art Pop':'Pop','Dance Pop':'Pop',
      'Pop Rock':'Pop','Power Pop':'Pop','Bedroom Pop':'Pop','Bubblegum Pop':'Pop','Teen Pop':'Pop','Sophisti-Pop':'Pop','Chamber Pop':'Pop','Baroque Pop':'Pop','Noise Pop':'Pop',
      'Dark Pop':'Pop','Emo Pop':'Pop','Cinematic Pop':'Pop','Orchestral Pop':'Pop','Folk Pop':'Pop','Hyper Pop':'Pop','Hyperpop':'Pop','PC Music':'Pop','City Pop':'Pop',
      'Ambient Pop':'Pop','Grunge Pop':'Pop','Math Pop':'Pop','Pop Rap':'Pop','Pop Punk':'Pop','Pop-Punk':'Pop',
      // Rock
      'Indie Rock':'Rock','Alt Rock':'Rock','Punk Rock':'Rock','Post-Punk':'Rock','Garage Rock':'Rock','Psychedelic Rock':'Rock','Prog Rock':'Rock','Shoegaze':'Rock','Grunge':'Rock','Britpop':'Rock',
      'Alternative':'Rock','Alternative Rock':'Rock','Classic Rock':'Rock','Hard Rock':'Rock','Soft Rock':'Rock','Progressive Rock':'Rock','Emo':'Rock','Post-Rock':'Rock','Stoner Rock':'Rock','Southern Rock':'Rock','Surf Rock':'Rock','Art Rock':'Rock','Math Rock':'Rock','Noise Rock':'Rock','Space Rock':'Rock','Glam Rock':'Rock',
      'Punk':'Rock','Hardcore':'Rock','Post-Hardcore':'Rock','Post Hardcore':'Rock','Ska Punk':'Rock','Hardcore Punk':'Rock','Crust Punk':'Rock','Anarcho-Punk':'Rock',
      'Screamo':'Rock','Mathcore':'Rock','Midwest Emo':'Rock','Post-Grunge':'Rock','Dream Rock':'Rock','Ambient Rock':'Rock','J-Rock':'Rock','Visual Kei':'Rock','Progressive':'Rock',
      'Funk Rock':'Rock','Indie Pop Rock':'Rock','Folk Rock':'Rock',
      // Hip-Hop
      'Trap':'Hip-Hop','Boom Bap':'Hip-Hop','Lo-Fi Hip-Hop':'Hip-Hop','Drill':'Hip-Hop','Conscious Rap':'Hip-Hop','Old School Hip-Hop':'Hip-Hop','Cloud Rap':'Hip-Hop',
      'Rap':'Hip-Hop','Hip Hop':'Hip-Hop','Hiphop':'Hip-Hop','HipHop':'Hip-Hop','Hip-Hop/Rap':'Hip-Hop','Gangsta Rap':'Hip-Hop','Mumble Rap':'Hip-Hop','Emo Rap':'Hip-Hop','G-Funk':'Hip-Hop','Crunk':'Hip-Hop','Grime':'Hip-Hop','UK Rap':'Hip-Hop','Freestyle':'Hip-Hop','Phonk':'Hip-Hop',
      'Melodic Rap':'Hip-Hop','Dark Trap':'Hip-Hop','Rage':'Hip-Hop','Rage Beat':'Hip-Hop','UK Drill':'Hip-Hop','Brooklyn Drill':'Hip-Hop','Gospel Rap':'Hip-Hop',
      'Country Rap':'Hip-Hop','Hick Hop':'Hip-Hop','Country Hip-Hop':'Hip-Hop','Latin Hip-Hop':'Hip-Hop','Christian Hip-Hop':'Hip-Hop',
      'Instrumental Hip-Hop':'Hip-Hop','Trip-Hop':'Hip-Hop','Trip Hop':'Hip-Hop','Triphop':'Hip-Hop','Bounce':'Hip-Hop','New Orleans Bounce':'Hip-Hop','Jazz Rap':'Hip-Hop',
      // Electronic
      'House':'Electronic','Deep House':'Electronic','Tech House':'Electronic','Techno':'Electronic','Trance':'Electronic','Dubstep':'Electronic','Drum & Bass':'Electronic','DnB':'Electronic','IDM':'Electronic','Breakbeat':'Electronic','Garage':'Electronic','Hardstyle':'Electronic','Hard Style':'Electronic','Eurodance':'Electronic','Italo Disco':'Electronic','Synthwave':'Electronic','Electro':'Electronic','Future Bass':'Electronic',
      'Dance':'Electronic','EDM':'Electronic','Nu-Disco':'Electronic','Tropical House':'Electronic','Afro House':'Electronic',
      'Electronica':'Electronic','Progressive House':'Electronic','Melodic Techno':'Electronic','Minimal':'Electronic','Lo-Fi House':'Electronic','Glitch':'Electronic','Bass Music':'Electronic','Chillstep':'Electronic','Future House':'Electronic','Big Room':'Electronic','UK Garage':'Electronic','Jersey Club':'Electronic','Jungle':'Electronic','Happy Hardcore':'Electronic','Gabber':'Electronic','Psytrance':'Electronic','Melodic House':'Electronic',
      'Melodic Dubstep':'Electronic','Future Garage':'Electronic','Liquid DnB':'Electronic','Electro Swing':'Electronic','Complextro':'Electronic','Moombahton':'Electronic',
      'Rave':'Electronic','Hard Trance':'Electronic','Acid House':'Electronic','Dark Electro':'Electronic','Industrial Dance':'Electronic',
      'Dark':'Electronic','Gothic':'Electronic','Goth':'Electronic','Dark Wave':'Electronic','Darkwave':'Electronic','EBM':'Electronic','Witch House':'Electronic',
      'Electro Pop':'Electronic','Electro Funk':'Electronic','Indie Electronic':'Electronic',
      // R&B / Soul
      'Neo Soul':'R&B / Soul','Neo-Soul':'R&B / Soul','Contemporary R&B':'R&B / Soul','Motown':'R&B / Soul',
      'R&B':'R&B / Soul','RnB':'R&B / Soul','Soul':'R&B / Soul','R&B/Soul':'R&B / Soul','Rhythm and Blues':'R&B / Soul','Quiet Storm':'R&B / Soul','New Jack Swing':'R&B / Soul',
      'Gospel':'R&B / Soul','Christian':'R&B / Soul','Worship':'R&B / Soul','Spiritual':'R&B / Soul','CCM':'R&B / Soul','Christian Rock':'R&B / Soul',
      // Funk
      'Disco':'Funk','Funk':'Funk','Boogie':'Funk','P-Funk':'Funk','Nu-Funk':'Funk','Funk Pop':'Funk','Future Funk':'Funk',
      // Metal
      'Heavy Metal':'Metal','Death Metal':'Metal','Black Metal':'Metal','Doom Metal':'Metal','Thrash Metal':'Metal','Metalcore':'Metal','Nu Metal':'Metal','Nu-Metal':'Metal','Power Metal':'Metal','Symphonic Metal':'Metal',
      'Progressive Metal':'Metal','Industrial Metal':'Metal','Industrial':'Metal','Djent':'Metal','Deathcore':'Metal','Post-Metal':'Metal','Sludge Metal':'Metal','Speed Metal':'Metal','Groove Metal':'Metal','Folk Metal':'Metal','Viking Metal':'Metal','Melodic Death Metal':'Metal','Gothic Metal':'Metal',
      'Grindcore':'Metal','Powerviolence':'Metal','Trap Metal':'Metal',
      // Jazz
      'Smooth Jazz':'Jazz','Bebop':'Jazz','Jazz Fusion':'Jazz','Acid Jazz':'Jazz','Nu Jazz':'Jazz','Swing':'Jazz','Cool Jazz':'Jazz','Free Jazz':'Jazz','Modal Jazz':'Jazz','Gypsy Jazz':'Jazz',
      // Classical
      'Orchestral':'Classical','Neoclassical':'Classical','Baroque':'Classical','Romantic':'Classical','Chamber Music':'Classical','Opera':'Classical','Choral':'Classical','Piano':'Classical',
      // Cinematic
      'Film Score':'Cinematic','Epic Orchestral':'Cinematic','Soundtrack':'Cinematic','Film Music':'Cinematic','Epic':'Cinematic','Trailer Music':'Cinematic','Score':'Cinematic','Cinematic Orchestra':'Cinematic',
      'Video Game Music':'Cinematic','Chiptune':'Cinematic','8-bit':'Cinematic','Game':'Cinematic','Anime':'Cinematic',
      'Horror':'Cinematic','Halloween':'Cinematic','Spooky':'Cinematic',
      // Indie / Folk
      'Folk':'Indie / Folk','Acoustic':'Indie / Folk','Singer-Songwriter':'Indie / Folk','Indie Folk':'Indie / Folk','Americana':'Indie / Folk','Bluegrass':'Indie / Folk','Celtic':'Indie / Folk',
      'Indie':'Indie / Folk','Chamber Folk':'Indie / Folk','Freak Folk':'Indie / Folk','Neofolk':'Indie / Folk',
      'Storytelling':'Indie / Folk','Narrative':'Indie / Folk',
      // Latin
      'Reggaeton':'Latin','Salsa':'Latin','Bossa Nova':'Latin','Latin Pop':'Latin','Cumbia':'Latin','Bachata':'Latin','Merengue':'Latin','Tango':'Latin','Samba':'Latin','Mariachi':'Latin','Norte\u00F1o':'Latin','Corrido':'Latin','Latin Trap':'Latin',
      'Dembow':'Latin','Tropical':'Latin',
      // Country
      'Country Rock':'Country','Outlaw Country':'Country','Alt Country':'Country','Honky Tonk':'Country','Country Pop':'Country','Americana Country':'Country','Nashville Sound':'Country','Bluegrass Country':'Country',
      'Bro Country':'Country','Red Dirt':'Country',
      // Ambient / Chill
      'Chillout':'Ambient','Chillwave':'Ambient','Downtempo':'Ambient','New Age':'Ambient','Space Ambient':'Ambient','Vaporwave':'Ambient',
      'Lo-Fi':'Ambient','Lo-fi':'Ambient','Lo Fi':'Ambient','lo fi':'Ambient','Lofi':'Ambient','LoFi':'Ambient','lofi hip hop':'Ambient','Chill':'Ambient','Chillhop':'Ambient','Ambient Electronic':'Ambient','Dark Ambient':'Ambient','Drone':'Ambient','Meditation':'Ambient',
      'Instrumental':'Ambient','Instrumental Rock':'Ambient',
      // Reggae
      'Dub':'Reggae','Dancehall':'Reggae','Ska':'Reggae','Rocksteady':'Reggae','Soca':'Reggae','Calypso':'Reggae','Lovers Rock':'Reggae','Roots Reggae':'Reggae','Roots':'Reggae',
      'Island':'Reggae','Caribbean':'Reggae',
      // Afrobeat
      'Afrobeats':'Afrobeat','Amapiano':'Afrobeat','Highlife':'Afrobeat','Juju':'Afrobeat','Afro Pop':'Afrobeat','Afro-Pop':'Afrobeat','Afro Fusion':'Afrobeat','Afropop':'Afrobeat','Afroswing':'Afrobeat',
      // Blues
      'Delta Blues':'Blues','Chicago Blues':'Blues','Blues Rock':'Blues','Rhythm & Blues':'Blues','Electric Blues':'Blues','Acoustic Blues':'Blues','Country Blues':'Blues',
      // Other
      'World Music':'Other','Middle Eastern':'Other','Indian':'Other','Asian':'Other','Flamenco':'Other','Polka':'Other','Experimental':'Other','Noise':'Other','Spoken Word':'Other','Podcast':'Other','Comedy':'Other','ASMR':'Other',
      'Sufi':'Other','Qawwali':'Other','Bollywood':'Other',
      'Christmas':'Other','Holiday':'Other','Mashup':'Other','Remix':'Other',
      'Pop/Rock':'Pop','Rock/Pop':'Rock','Hip-Hop/Rap':'Hip-Hop'
    };

    // Build case-insensitive genre lookup
    var _genreLookup = {};
    Object.entries(GENRE_PARENTS).forEach(function (entry) { _genreLookup[entry[0].toLowerCase().trim()] = entry[1]; });
    var parents = ['Pop','Rock','Hip-Hop','Electronic','R&B / Soul','Funk','Metal','Jazz','Classical','Cinematic','Indie / Folk','Latin','Country','Ambient','Reggae','Afrobeat','Blues','Other'];
    parents.forEach(function (p) { _genreLookup[p.toLowerCase()] = p; });

    // Keyword-to-parent mapping for fuzzy fallback
    var _genreKeywords = {
      'rap':'Hip-Hop','hip hop':'Hip-Hop','hiphop':'Hip-Hop','hip-hop':'Hip-Hop','trap':'Hip-Hop','drill':'Hip-Hop','boom bap':'Hip-Hop','phonk':'Hip-Hop',
      'rock':'Rock','punk':'Rock','emo':'Rock','grunge':'Rock','hardcore':'Rock','shoegaze':'Rock',
      'pop':'Pop',
      'metal':'Metal','djent':'Metal','core':'Metal',
      'electro':'Electronic','techno':'Electronic','house':'Electronic','trance':'Electronic','bass':'Electronic','dubstep':'Electronic','edm':'Electronic','dnb':'Electronic','rave':'Electronic','dance':'Electronic','synth':'Electronic',
      'jazz':'Jazz','swing':'Jazz','bebop':'Jazz',
      'blues':'Blues',
      'folk':'Indie / Folk','acoustic':'Indie / Folk','indie':'Indie / Folk','singer':'Indie / Folk',
      'soul':'R&B / Soul','r&b':'R&B / Soul','rnb':'R&B / Soul','gospel':'R&B / Soul','christian':'R&B / Soul',
      'country':'Country',
      'latin':'Latin','reggaeton':'Latin','salsa':'Latin','cumbia':'Latin',
      'ambient':'Ambient','chill':'Ambient','lofi':'Ambient','lo-fi':'Ambient','lo fi':'Ambient','downtempo':'Ambient',
      'reggae':'Reggae','ska':'Reggae','dub':'Reggae','dancehall':'Reggae','island':'Reggae','caribbean':'Reggae',
      'afro':'Afrobeat',
      'funk':'Funk','disco':'Funk',
      'classical':'Classical','orchestral':'Classical','piano':'Classical','opera':'Classical','choral':'Classical',
      'cinematic':'Cinematic','soundtrack':'Cinematic','film':'Cinematic','epic':'Cinematic','score':'Cinematic','trailer':'Cinematic','game':'Cinematic','anime':'Cinematic','8-bit':'Cinematic','chiptune':'Cinematic',
      'christmas':'Other','holiday':'Other','mashup':'Other','remix':'Other','experimental':'Other','world':'Other'
    };

    function resolveGenre(g) {
      if (!g) return 'Other';
      var key = g.trim();
      if (parents.includes(key)) return key;
      var lower = key.toLowerCase();
      if (_genreLookup[lower]) return _genreLookup[lower];
      for (var kw in _genreKeywords) {
        if (_genreKeywords.hasOwnProperty(kw) && lower.includes(kw)) return _genreKeywords[kw];
      }
      return 'Other';
    }

    // Group by parent genre
    var genreMap = {};
    sorted.forEach(function (t) {
      var parent = resolveGenre(t.genre);
      if (!genreMap[parent]) genreMap[parent] = [];
      genreMap[parent].push(t);
    });

    // Build "Trending" row (top rated across all genres)
    var trending = [].concat(sorted).sort(function (a, b) {
      return wilsonScore(b.avg_rating||0, b.rating_count||0) - wilsonScore(a.avg_rating||0, a.rating_count||0);
    }).slice(0, 20);

    // Prepare row data (cards are lazy-rendered via IntersectionObserver)
    var rowData = [];

    if (trending.length) {
      rowData.push({ emoji: '\uD83D\uDD25', title: 'Trending Now', tracks: trending });
    }

    if (browseView === 'discover') {
      var recent = [].concat(sorted).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }).slice(0, 20);
      if (recent.length) {
        rowData.push({ emoji: '\uD83C\uDD95', title: 'Just Added', tracks: recent });
      }
    }

    var genreOrder = Object.entries(genreMap).sort(function (a, b) { return b[1].length - a[1].length; });
    genreOrder.forEach(function (entry) {
      var genre  = entry[0];
      var tracks = entry[1];
      var emoji  = GENRE_EMOJIS[genre] || '\uD83C\uDFB6';
      var genreSorted = [].concat(tracks).sort(function (a, b) {
        return wilsonScore(b.avg_rating||0, b.rating_count||0) - wilsonScore(a.avg_rating||0, a.rating_count||0);
      });
      rowData.push({ emoji: emoji, title: genre, tracks: genreSorted, allTracks: tracks, isGenre: true, sortMode: 'top' });
    });

    // Render skeleton rows — actual cards are filled by IntersectionObserver
    container.innerHTML = '';
    var frag = document.createDocumentFragment();
    rowData.forEach(function (rd, idx) {
      var row = document.createElement('div');
      row.className = 'genre-row';
      row.dataset.rowIdx = idx;
      row.innerHTML =
        '<div class="genre-row-header">' +
          '<div class="genre-row-title"><span class="genre-emoji">' + rd.emoji + '</span> ' + sanitize(rd.title) + '</div>' +
          (rd.isGenre ? '<div class="genre-sort-toggle"><button class="genre-sort-btn active" data-sort="top" data-row="' + idx + '">Top</button><button class="genre-sort-btn" data-sort="new" data-row="' + idx + '">New</button></div>' : '') +
          '<span class="genre-row-count">' + rd.tracks.length + ' track' + (rd.tracks.length !== 1 ? 's' : '') + '</span>' +
          (rd.isGenre && GENRE_TO_SLUG[rd.title] ? '<a href="/playlist.html?genre=' + GENRE_TO_SLUG[rd.title] + '" class="genre-row-viewall">View All \u2192</a>' : '') +
          '<div class="genre-row-line"></div>' +
        '</div>' +
        '<div class="genre-row-wrapper">' +
          '<button class="scroll-arrow left" aria-label="Scroll left"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
          '<div class="genre-row-scroll"></div>' +
          '<button class="scroll-arrow right show" aria-label="Scroll right"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>' +
        '</div>';
      frag.appendChild(row);
    });
    container.appendChild(frag);

    // Store row data for lazy hydration + deep-link access
    window._browseRowData = rowData;

    // Observe rows — populate cards when they enter viewport
    if (window._browseObserver) window._browseObserver.disconnect();
    window._browseObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var row = entry.target;
        if (row.dataset.hydrated) return;
        row.dataset.hydrated = '1';
        var idx = parseInt(row.dataset.rowIdx, 10);
        var rd  = window._browseRowData[idx];
        if (!rd) return;
        var scroll = row.querySelector('.genre-row-scroll');
        if (!scroll || scroll.children.length > 0) return;
        var cardFrag = document.createDocumentFragment();
        rd.tracks.forEach(function (t) {
          var div = document.createElement('div');
          div.innerHTML = buildBrowseCard(t, getEmbedHtml(t));
          cardFrag.appendChild(div.firstChild);
        });
        scroll.appendChild(cardFrag);
        setupScrollArrows(row);
      });
    }, { rootMargin: '300px 0px' });

    container.querySelectorAll('.genre-row').forEach(function (row) {
      window._browseObserver.observe(row);
    });

    // Genre sort toggle handler
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.genre-sort-btn');
      if (!btn) return;
      var rowIdx   = parseInt(btn.dataset.row, 10);
      var sortMode = btn.dataset.sort;
      var rd = window._browseRowData[rowIdx];
      if (!rd || !rd.isGenre || rd.sortMode === sortMode) return;

      var toggle = btn.parentElement;
      toggle.querySelectorAll('.genre-sort-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');

      rd.sortMode = sortMode;
      if (sortMode === 'new') {
        rd.tracks = [].concat(rd.allTracks).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      } else {
        rd.tracks = [].concat(rd.allTracks).sort(function (a, b) { return wilsonScore(b.avg_rating||0, b.rating_count||0) - wilsonScore(a.avg_rating||0, a.rating_count||0); });
      }

      var row = container.querySelector('.genre-row[data-row-idx="' + rowIdx + '"]');
      if (!row) return;
      var scroll = row.querySelector('.genre-row-scroll');
      if (!scroll) return;
      scroll.innerHTML = '';
      var cardFrag = document.createDocumentFragment();
      rd.tracks.forEach(function (t) {
        var div = document.createElement('div');
        div.innerHTML = buildBrowseCard(t, getEmbedHtml(t));
        cardFrag.appendChild(div.firstChild);
      });
      scroll.appendChild(cardFrag);
      scroll.scrollLeft = 0;
      setupScrollArrows(row);
    });
  }

  // =========================================================================
  // setupScrollArrows — arrow visibility + drag binding
  // =========================================================================

  function setupScrollArrows(row) {
    var wrapper  = row.querySelector('.genre-row-wrapper');
    if (!wrapper) return;
    var scroll   = wrapper.querySelector('.genre-row-scroll');
    var leftArr  = wrapper.querySelector('.scroll-arrow.left');
    var rightArr = wrapper.querySelector('.scroll-arrow.right');
    if (!scroll || !leftArr || !rightArr) return;

    var arrowRaf = null;
    function updateArrows() {
      if (arrowRaf) return;
      arrowRaf = requestAnimationFrame(function () {
        leftArr.classList.toggle('show', scroll.scrollLeft > 20);
        rightArr.classList.toggle('show', scroll.scrollLeft < scroll.scrollWidth - scroll.clientWidth - 20);
        arrowRaf = null;
      });
    }

    leftArr.addEventListener('click', function () { scroll.scrollBy({ left: -500, behavior: 'auto' }); updateArrows(); });
    rightArr.addEventListener('click', function () { scroll.scrollBy({ left: 500, behavior: 'auto' }); updateArrows(); });
    scroll.addEventListener('scroll', updateArrows, { passive: true });
    updateArrows();

    scroll.addEventListener('mousedown', onDragStart);
  }

  // =========================================================================
  // Single global drag system for genre row scrolling
  // =========================================================================

  var _drag = null;
  var _dragMomentumId = null;

  function cleanupDrag() {
    if (_dragMomentumId) { cancelAnimationFrame(_dragMomentumId); _dragMomentumId = null; }
    if (_drag && _drag.el) _drag.el.style.cursor = '';
    document.body.classList.remove('is-dragging');
    _drag = null;
  }

  function onDragStart(e) {
    if (e.button !== 0) return;
    if (e.target.closest('button, .bstar, a, .browse-card-footer, .comment-input, .comment-form, .comment-submit, .comments-panel, .browse-card-note, .browse-card-note-toggle, .browse-card-note-text, .browse-card-play, input, textarea')) return;
    cleanupDrag();
    var scroll = e.currentTarget;
    _drag = {
      el: scroll,
      startX: e.clientX,
      scrollStart: scroll.scrollLeft,
      lastX: e.clientX,
      lastTime: performance.now(),
      velocity: 0,
      moved: false
    };
  }

  function onGlobalMove(e) {
    if (!_drag) return;
    if (e.buttons === 0) { cleanupDrag(); return; }
    var now = performance.now();
    var dt  = now - _drag.lastTime;
    var dx  = e.clientX - _drag.lastX;
    if (dt > 0) _drag.velocity = dx / dt;
    _drag.lastX = e.clientX;
    _drag.lastTime = now;
    var totalDx = e.clientX - _drag.startX;
    if (!_drag.moved && Math.abs(totalDx) > 5) {
      _drag.moved = true;
      _drag.el.style.cursor = 'grabbing';
      document.body.classList.add('is-dragging');
    }
    if (_drag.moved) {
      _drag.el.scrollLeft = _drag.scrollStart - totalDx;
    }
  }

  function onGlobalUp() {
    if (!_drag) return;
    var el = _drag.el;
    var wasDragged = _drag.moved;
    var velocity   = _drag.velocity;

    el.style.cursor = '';
    document.body.classList.remove('is-dragging');

    if (wasDragged) {
      var v = -velocity * 800;
      if (Math.abs(v) > 20) {
        var friction = 0.92;
        var last = performance.now();
        function coast(now) {
          var dt = (now - last) / 1000;
          last = now;
          v *= friction;
          el.scrollLeft += v * dt;
          if (Math.abs(v) > 5) {
            _dragMomentumId = requestAnimationFrame(coast);
          } else {
            _dragMomentumId = null;
          }
        }
        _dragMomentumId = requestAnimationFrame(coast);
      }
      el.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });
    }
    _drag = null;
  }

  document.addEventListener('mousemove', onGlobalMove, { passive: true });
  document.addEventListener('mouseup', onGlobalUp);
  document.documentElement.addEventListener('mouseleave', onGlobalUp);
  window.addEventListener('blur', cleanupDrag);

  function onVisChange() { if (document.hidden) cleanupDrag(); }
  document.addEventListener('visibilitychange', onVisChange);

  function onDragStart_native(e) {
    if (e.target.closest('.genre-row-scroll, .search-results-grid, .browse-card')) {
      e.preventDefault();
    }
  }
  document.addEventListener('dragstart', onDragStart_native);

  _cleanup.push(function () {
    document.removeEventListener('mousemove', onGlobalMove);
    document.removeEventListener('mouseup', onGlobalUp);
    document.documentElement.removeEventListener('mouseleave', onGlobalUp);
    window.removeEventListener('blur', cleanupDrag);
    document.removeEventListener('visibilitychange', onVisChange);
    document.removeEventListener('dragstart', onDragStart_native);
    cleanupDrag();
  });

  // =========================================================================
  // Leaderboard
  // =========================================================================

  var currentLbPeriod = 'week';

  function renderLeaderboard(period) {
    if (period) currentLbPeriod = period;
    var lb = document.getElementById('leaderboardList');
    if (!lb) return;
    var filtered = VMA.allTracks;
    var now = Date.now();
    if (currentLbPeriod === 'week') {
      var cutoff = now - 7 * 24 * 60 * 60 * 1000;
      filtered = VMA.allTracks.filter(function (t) { return new Date(t.created_at).getTime() >= cutoff; });
    } else if (currentLbPeriod === 'month') {
      var cutoff2 = now - 30 * 24 * 60 * 60 * 1000;
      filtered = VMA.allTracks.filter(function (t) { return new Date(t.created_at).getTime() >= cutoff2; });
    }
    var topN = 10;
    var sorted = partialSort(filtered, topN, function (a, b) {
      return wilsonScore(b.avg_rating||0, b.rating_count||0) - wilsonScore(a.avg_rating||0, a.rating_count||0);
    });
    if (!sorted.length) {
      lb.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">No tracks in this period</div>';
      return;
    }
    var medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
    lb.innerHTML = sorted.map(function (t, i) {
      var rank  = i < 3 ? medals[i] : '#' + (i + 1);
      var stars = (t.avg_rating||0) > 0 ? (t.avg_rating).toFixed(1) + ' \u2605' : '\u2014';
      return '<div class="lb-row" data-action="lb-play" data-track-id="' + t.id + '">' +
        '<div class="lb-rank">' + rank + '</div>' +
        '<div class="lb-info"><div class="lb-title">' + sanitize(t.title) + '</div><div class="lb-meta">' + sanitize(t.tool) + ' \u00B7 ' + sanitize(t.genre) + '</div></div>' +
        '<div class="lb-rating"><span class="lb-stars">' + stars + '</span><span class="lb-count">(' + (t.rating_count||0) + ')</span></div>' +
        '<div class="lb-play-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="var(--accent)"><polygon points="6 3 20 12 6 21"/></svg></div>' +
      '</div>';
    }).join('');
  }

  // Leaderboard period tabs
  var lbTabs = document.querySelectorAll('.lb-tab');
  lbTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      lbTabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      renderLeaderboard(tab.dataset.period);
    });
  });

  // =========================================================================
  // renderTracks — simple reset function
  // =========================================================================

  function renderTracks() {
    _sortCache  = { view: null, len: 0, result: null };
    _trackIndex = null;
  }

  // =========================================================================
  // Deep Link handler — ?track=ID
  // =========================================================================

  function handleDeepLink() {
    var params     = new URLSearchParams(window.location.search);
    var trackParam = params.get('track');
    if (!trackParam) return;

    var track = getTrack(trackParam);
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

    // Force-hydrate all genre rows so deep-link card exists in DOM
    if (window._browseRowData) {
      document.querySelectorAll('.genre-row').forEach(function (row) {
        if (row.dataset.hydrated) return;
        row.dataset.hydrated = '1';
        var idx = parseInt(row.dataset.rowIdx, 10);
        var rd  = window._browseRowData[idx];
        if (!rd) return;
        var scroll = row.querySelector('.genre-row-scroll');
        if (!scroll || scroll.children.length > 0) return;
        var cardFrag = document.createDocumentFragment();
        rd.tracks.forEach(function (t) {
          var div = document.createElement('div');
          div.innerHTML = buildBrowseCard(t, getEmbedHtml(t));
          cardFrag.appendChild(div.firstChild);
        });
        scroll.appendChild(cardFrag);
        setupScrollArrows(row);
      });
    }

    requestAnimationFrame(function () {
      // Find the card in its GENRE row, not in Trending/Just Added
      var genre = track.genre || 'Other';
      var targetCard = null;
      document.querySelectorAll('.genre-row').forEach(function (row) {
        var title = row.querySelector('.genre-row-title');
        if (!title) return;
        var rowTitle = title.textContent.trim();
        if (rowTitle.includes('Trending') || rowTitle.includes('Just Added')) return;
        if (rowTitle.includes(genre)) {
          var card = row.querySelector('.browse-card[data-track-id="' + trackParam + '"]');
          if (card) targetCard = card;
        }
      });
      // Fallback: any card with this track
      if (!targetCard) {
        targetCard = document.querySelector('.browse-card[data-track-id="' + trackParam + '"]');
      }

      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetCard.style.boxShadow = '0 0 0 2px var(--accent), 0 12px 40px rgba(232,255,71,0.15)';
        setTimeout(function () { targetCard.style.boxShadow = ''; }, 4000);
      }

      var overlay = document.createElement('div');
      overlay.id = 'deeplink-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(7,7,11,0.8);display:flex;align-items:center;justify-content:center;cursor:pointer;';
      overlay.innerHTML = '<div style="text-align:center;"><div style="width:80px;height:80px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 0 40px rgba(232,255,71,0.4);animation:deepPulse 1.5s ease-in-out infinite;cursor:pointer;"><svg width="36" height="36" viewBox="0 0 24 24" fill="#07070b"><polygon points="6 3 20 12 6 21"/></svg></div><div style="color:var(--text);font-weight:700;font-size:1rem;margin-bottom:4px;">Tap to play</div><div style="color:var(--muted);font-size:0.8rem;">' + sanitize(track.title || '') + '</div></div>';

      var style = document.createElement('style');
      style.textContent = '@keyframes deepPulse{0%,100%{transform:scale(1);box-shadow:0 0 40px rgba(232,255,71,0.4)}50%{transform:scale(1.08);box-shadow:0 0 60px rgba(232,255,71,0.6)}}';
      document.head.appendChild(style);

      overlay.addEventListener('click', function () {
        overlay.remove();
        style.remove();
        if (targetCard) {
          Player.browsePlay(targetCard.dataset.uid, trackParam);
        } else {
          var fallbackCard = document.querySelector('.browse-card[data-track-id="' + trackParam + '"]');
          if (fallbackCard) {
            Player.browsePlay(fallbackCard.dataset.uid, trackParam);
          }
        }
      }, { once: true });

      document.body.appendChild(overlay);
    });

    window.history.replaceState(null, '', '/');
  }

  // =========================================================================
  // Search — bind to browseSearch input
  // =========================================================================

  var browseSearchInput = document.getElementById('browseSearch');
  var searchClearBtn    = document.getElementById('searchClear');
  var searchDebounce;

  if (browseSearchInput) {
    function onSearchInput() {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(function () {
        searchQuery = browseSearchInput.value.trim();
        if (searchClearBtn) searchClearBtn.classList.toggle('show', searchQuery.length > 0);
        renderBrowse();
      }, 350);
    }
    browseSearchInput.addEventListener('input', onSearchInput);
    _cleanup.push(function () {
      browseSearchInput.removeEventListener('input', onSearchInput);
      clearTimeout(searchDebounce);
    });
  }

  if (searchClearBtn) {
    function onSearchClear() {
      if (browseSearchInput) browseSearchInput.value = '';
      searchQuery = '';
      searchClearBtn.classList.remove('show');
      renderBrowse();
    }
    searchClearBtn.addEventListener('click', onSearchClear);
    _cleanup.push(function () {
      searchClearBtn.removeEventListener('click', onSearchClear);
    });
  }

  // =========================================================================
  // Connect to track loading via custom events
  // =========================================================================

  function onTracksReady() {
    renderTracks();
    renderLeaderboard();
    renderBrowse();
    handleDeepLink();
  }

  function onTracksUpdated() {
    _sortCache  = { view: null, len: 0, result: null };
    _trackIndex = null;
    renderTracks();
    renderLeaderboard();
    renderBrowse();
  }

  document.addEventListener('vma:tracks-loaded', onTracksReady);
  document.addEventListener('vma:tracks-updated', onTracksUpdated);

  _cleanup.push(function () {
    document.removeEventListener('vma:tracks-loaded', onTracksReady);
    document.removeEventListener('vma:tracks-updated', onTracksUpdated);
  });

  // =========================================================================
  // If tracks are already loaded (navigating back to home)
  // =========================================================================

  if (VMA.allTracks.length > 0) {
    onTracksReady();
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  function cleanup() {
    // Disconnect IntersectionObserver
    if (window._browseObserver) {
      window._browseObserver.disconnect();
      window._browseObserver = null;
    }
    // Clean up row data
    window._browseRowData = null;
    // Run all registered cleanup functions
    _cleanup.forEach(function (fn) { fn(); });
    _cleanup = [];
  }

  VMA._pageCleanup = cleanup;

})();
