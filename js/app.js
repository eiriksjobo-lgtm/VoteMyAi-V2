/**
 * VoteMyAI — Shared Core Logic Module
 * Extracted from index.html and playlist.html into a unified VMA namespace.
 * All duplicated logic lives here; page-specific code stays in page scripts.
 */
window.VMA = (function() {
  'use strict';

  // ═══════════════════════════════════════════════
  // 1. Config
  // ═══════════════════════════════════════════════
  const SUPABASE_URL = 'https://gezijezmsecbtzytotax.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hOOMtCz7gYsu_-CVD6lW9Q_SxtFlNhw';
  const TRACK_FIELDS = 'id,title,yt_id,tool,genre,avg_rating,rating_count,embed_url,thumbnail_url,artist_note,created_at';
  const PAGE_SIZE = 500;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const starSVG = '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>';

  // ═══════════════════════════════════════════════
  // 2. Shared State
  // ═══════════════════════════════════════════════
  let currentUser = null;
  let allTracks = [];
  let _trackMap = new Map();
  let userRatings = {};

  // ═══════════════════════════════════════════════
  // 3. Utils
  // ═══════════════════════════════════════════════
  const _sanitizeEl = document.createElement('div');
  function sanitize(str) {
    if (!str) return '';
    _sanitizeEl.textContent = str;
    return _sanitizeEl.innerHTML;
  }

  function sanitizeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function wilsonScore(avg, n) {
    if (n === 0) return 0;
    const p = (avg - 1) / 4;
    const z = 1.96;
    const z2 = z * z;
    return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
  }

  function showToast(msg) {
    var toast = document.getElementById('vote-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vote-toast';
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(10px);background:var(--surface);color:var(--text);padding:12px 24px;border-radius:12px;font-size:0.82rem;font-weight:600;z-index:9999;opacity:0;transition:opacity 0.3s,transform 0.3s;border:1px solid rgba(232,255,71,0.25);box-shadow:0 8px 32px rgba(0,0,0,0.5);';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
    }, 2500);
  }

  // Efficient partial sort: O(n) for finding top-k instead of O(n log n) full sort
  function partialSort(arr, k, compareFn) {
    if (arr.length <= k) return [].concat(arr).sort(compareFn);
    // Selection-based: maintain a sorted result of top k
    var result = arr.slice(0, k).sort(compareFn);
    for (var i = k; i < arr.length; i++) {
      if (compareFn(arr[i], result[k - 1]) < 0) {
        result[k - 1] = arr[i];
        // Insert in correct position
        var j = k - 1;
        while (j > 0 && compareFn(result[j], result[j - 1]) < 0) {
          var tmp = result[j];
          result[j] = result[j - 1];
          result[j - 1] = tmp;
          j--;
        }
      }
    }
    return result;
  }

  // ═══════════════════════════════════════════════
  // 4. Auth
  // ═══════════════════════════════════════════════
  function getAnonToken() {
    var token = localStorage.getItem('votemyai_anon_token');
    if (!token) {
      token = 'anon_' + crypto.randomUUID();
      localStorage.setItem('votemyai_anon_token', token);
    }
    return token;
  }

  async function checkAuth() {
    var hash = window.location.hash.substring(1);
    var params = new URLSearchParams(hash);
    var accessToken = params.get('access_token');
    if (accessToken) {
      var res = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { 'Authorization': 'Bearer ' + accessToken, 'apikey': SUPABASE_KEY }
      });
      if (res.ok) {
        currentUser = await res.json();
        localStorage.setItem('sb_token', accessToken);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        var redirect = localStorage.getItem('login_redirect');
        if (redirect && redirect !== '/' && redirect !== window.location.pathname) {
          localStorage.removeItem('login_redirect');
          window.location.href = redirect;
          return;
        }
        localStorage.removeItem('login_redirect');
      }
    } else {
      var token = localStorage.getItem('sb_token');
      if (token) {
        var res2 = await fetch(SUPABASE_URL + '/auth/v1/user', {
          headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY }
        });
        if (res2.ok) {
          currentUser = await res2.json();
        } else {
          localStorage.removeItem('sb_token');
        }
      }
    }
    if (currentUser) {
      var authLink = document.getElementById('authLink');
      if (authLink) {
        authLink.textContent = currentUser.user_metadata?.name || 'Profile';
        authLink.href = '/profile.html';
      }
      var ml = document.getElementById('authLinkMobile');
      if (ml) {
        ml.textContent = currentUser.user_metadata?.name || 'Profile';
        ml.href = '/profile.html';
      }
    }
    await loadAnonRatings();
  }

  async function loadAnonRatings() {
    var token = getAnonToken();
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/anonymous_ratings?anon_token=eq.' + token + '&select=track_id,score&limit=10000', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      if (res.ok) {
        (await res.json()).forEach(function(r) { userRatings[r.track_id] = r.score; });
      }
    } catch(e) { /* silent */ }
  }

  // ═══════════════════════════════════════════════
  // 5. Tracks
  // ═══════════════════════════════════════════════
  function rebuildTrackMap() {
    _trackMap = new Map();
    allTracks.forEach(function(t) { _trackMap.set(String(t.id), t); });
  }

  function getTrack(id) {
    return _trackMap.get(String(id));
  }

  async function loadTracks() {
    try {
      // Check sessionStorage cache (2 min TTL)
      var cached = sessionStorage.getItem('vmai_tracks');
      var cachedAt = parseInt(sessionStorage.getItem('vmai_tracks_ts') || '0', 10);
      if (cached && (Date.now() - cachedAt < 120000)) {
        allTracks = JSON.parse(cached);
        rebuildTrackMap();
        document.dispatchEvent(new CustomEvent('vma:tracks-loaded'));
        return;
      }

      // First page — fast initial render
      var res = await fetch(SUPABASE_URL + '/rest/v1/tracks?select=' + TRACK_FIELDS + '&order=created_at.desc&limit=' + PAGE_SIZE + '&offset=0', {
        headers: { 'apikey': SUPABASE_KEY, 'Prefer': 'count=exact' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var totalCount = parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10);
      allTracks = await res.json();
      rebuildTrackMap();
      document.dispatchEvent(new CustomEvent('vma:tracks-loaded'));

      // Load remaining pages in background
      if (totalCount > PAGE_SIZE) {
        var pages = Math.ceil(totalCount / PAGE_SIZE);
        for (var p = 1; p < pages; p++) {
          var r = await fetch(SUPABASE_URL + '/rest/v1/tracks?select=' + TRACK_FIELDS + '&order=created_at.desc&limit=' + PAGE_SIZE + '&offset=' + (p * PAGE_SIZE), {
            headers: { 'apikey': SUPABASE_KEY }
          });
          if (r.ok) {
            allTracks = allTracks.concat(await r.json());
          }
        }
        // Re-index after all pages loaded
        var finalize = function() {
          rebuildTrackMap();
          try {
            sessionStorage.setItem('vmai_tracks', JSON.stringify(allTracks));
            sessionStorage.setItem('vmai_tracks_ts', String(Date.now()));
          } catch(e) { /* quota exceeded — ignore */ }
          document.dispatchEvent(new CustomEvent('vma:tracks-updated'));
        };
        if (window.requestIdleCallback) {
          requestIdleCallback(finalize);
        } else {
          setTimeout(finalize, 50);
        }
      } else {
        // Single page — cache immediately
        try {
          sessionStorage.setItem('vmai_tracks', JSON.stringify(allTracks));
          sessionStorage.setItem('vmai_tracks_ts', String(Date.now()));
        } catch(e) { /* quota exceeded — ignore */ }
      }
    } catch(e) {
      console.error('Load error:', e);
      document.dispatchEvent(new CustomEvent('vma:tracks-error'));
    }
  }

  // ═══════════════════════════════════════════════
  // 6. Embed Detection
  // ═══════════════════════════════════════════════
  function detectPlatform(url) {
    if (!url) return { platform: 'unknown', embedHtml: '' };
    var ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([^&?\/#]+)/);
    if (ytMatch) return { platform: 'youtube', embedHtml: '<iframe src="https://www.youtube.com/embed/' + ytMatch[1] + '?rel=0&enablejsapi=1&origin=' + encodeURIComponent(window.location.origin) + '" allowfullscreen loading="lazy"></iframe>' };
    if (url.includes('soundcloud.com')) {
      // Short links (on.soundcloud.com) can't be embedded
      if (url.includes('on.soundcloud.com')) {
        return { platform: 'soundcloud', embedHtml: '<a href="' + sanitizeAttr(url) + '" target="_blank" rel="noopener" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg, rgba(255,85,0,0.1) 0%, var(--surface-2) 100%);color:var(--text);text-decoration:none;gap:8px;cursor:pointer;"><div style="width:52px;height:52px;border-radius:50%;background:rgba(255,85,0,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(255,85,0,0.4);"><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3"/></svg></div><span style="font-weight:700;font-size:0.78rem;color:#ff5500;">Play on SoundCloud</span><span style="font-size:0.65rem;color:var(--muted);">Opens in new tab</span></a>' };
      }
      var scTrackUrl = url;
      var widgetMatch = url.match(/w\.soundcloud\.com\/player\/?\?.*url=([^&]+)/);
      if (widgetMatch) scTrackUrl = decodeURIComponent(widgetMatch[1]);
      return { platform: 'soundcloud', embedHtml: '<iframe src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(scTrackUrl) + '&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true" scrolling="no" allow="autoplay" loading="lazy"></iframe>' };
    }
    if (url.includes('suno.com')) {
      var sunoUUID = url.match(/suno\.com\/(?:song|embed)\/([a-f0-9-]{36})/);
      if (sunoUUID) return { platform: 'suno', embedHtml: '<iframe src="https://suno.com/embed/' + sunoUUID[1] + '" loading="lazy" style="border:none;"></iframe>' };
      return { platform: 'suno', embedHtml: '<a href="' + sanitizeAttr(url) + '" target="_blank" rel="noopener" class="embed-placeholder" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:var(--surface-2);color:var(--text);text-decoration:none;gap:8px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg><span style="font-weight:600;font-size:0.82rem;">Play on Suno</span><span style="font-size:0.7rem;color:var(--muted);">Opens in new tab</span></a>' };
    }
    if (url.includes('udio.com')) {
      var udioUuid = url.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
      if (udioUuid) return { platform: 'udio', udioId: udioUuid[0], embedHtml: '<div class="udio-player" data-udio-id="' + udioUuid[0] + '" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg, rgba(129,140,248,0.12) 0%, var(--surface-2) 100%);color:var(--text);cursor:pointer;gap:6px;position:relative;"><div style="width:52px;height:52px;border-radius:50%;background:rgba(129,140,248,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(129,140,248,0.4);transition:transform 0.2s;"><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3"/></svg></div><span style="font-weight:700;font-size:0.72rem;letter-spacing:1px;text-transform:uppercase;color:#818cf8;">Udio</span></div>' };
      var udioSlug = url.match(/udio\.com\/songs\/([a-zA-Z0-9_-]+)/);
      if (udioSlug) return { platform: 'udio', udioId: udioSlug[1], embedHtml: '<div class="udio-player" data-udio-id="' + udioSlug[1] + '" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg, rgba(129,140,248,0.12) 0%, var(--surface-2) 100%);color:var(--text);cursor:pointer;gap:6px;position:relative;"><div style="width:52px;height:52px;border-radius:50%;background:rgba(129,140,248,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(129,140,248,0.4);transition:transform 0.2s;"><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3"/></svg></div><span style="font-weight:700;font-size:0.72rem;letter-spacing:1px;text-transform:uppercase;color:#818cf8;">Udio</span></div>' };
    }
    return { platform: 'unknown', embedHtml: '' };
  }

  var _embedCache = new Map();
  function getEmbedHtml(track) {
    var key = track.id;
    if (_embedCache.has(key)) return _embedCache.get(key);
    var result;
    if (track.embed_url) {
      result = detectPlatform(track.embed_url);
    } else if (track.yt_id) {
      result = { platform: 'youtube', embedHtml: '<iframe src="https://www.youtube.com/embed/' + track.yt_id + '?rel=0&enablejsapi=1&origin=' + encodeURIComponent(window.location.origin) + '" allowfullscreen loading="lazy"></iframe>' };
    } else {
      result = { platform: 'unknown', embedHtml: '<div class="embed-placeholder" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.8rem;">No preview available</div>' };
    }
    _embedCache.set(key, result);
    return result;
  }

  // ═══════════════════════════════════════════════
  // 7. Genre System
  // ═══════════════════════════════════════════════
  var GENRE_EMOJIS = {
    'Pop':'\uD83C\uDFB5','Synth-Pop':'\uD83C\uDFB5','Indie Pop':'\uD83C\uDFB5','Electropop':'\uD83C\uDFB5','Dream Pop':'\uD83C\uDFB5','K-Pop':'\u2728','J-Pop':'\u2728','Art Pop':'\uD83C\uDFB5','Dance Pop':'\uD83C\uDFB5',
    'Rock':'\uD83C\uDFB8','Indie Rock':'\uD83C\uDFB8','Alt Rock':'\uD83C\uDFB8','Punk Rock':'\uD83C\uDFB8','Post-Punk':'\uD83C\uDFB8','Garage Rock':'\uD83C\uDFB8','Psychedelic Rock':'\uD83C\uDFB8','Prog Rock':'\uD83C\uDFB8','Shoegaze':'\uD83C\uDFB8','Grunge':'\uD83C\uDFB8','Britpop':'\uD83C\uDFB8',
    'Hip-Hop':'\uD83C\uDFA4','Trap':'\uD83C\uDFA4','Boom Bap':'\uD83C\uDFA4','Lo-Fi Hip-Hop':'\uD83C\uDFA4','Drill':'\uD83C\uDFA4','Conscious Rap':'\uD83C\uDFA4','Old School Hip-Hop':'\uD83C\uDFA4','Cloud Rap':'\uD83C\uDFA4',
    'Electronic':'\u26A1','House':'\u26A1','Deep House':'\u26A1','Tech House':'\u26A1','Techno':'\u26A1','Trance':'\u26A1','Dubstep':'\u26A1','Drum & Bass':'\uD83E\uDD41','IDM':'\u26A1','Breakbeat':'\u26A1','Garage':'\u26A1','Hardstyle':'\u26A1','Eurodance':'\u26A1','Italo Disco':'\u26A1','Synthwave':'\u26A1','Electro':'\u26A1','Future Bass':'\u26A1',
    'R&B / Soul':'\uD83D\uDC9C','Neo Soul':'\uD83D\uDC9C','Contemporary R&B':'\uD83D\uDC9C','Motown':'\uD83D\uDC9C','Funk':'\uD83D\uDD7A','Disco':'\uD83D\uDD7A',
    'Dance':'\uD83D\uDC83','EDM':'\uD83D\uDC83','Nu-Disco':'\uD83D\uDC83','Tropical House':'\uD83D\uDC83','Afro House':'\uD83D\uDC83','Dancehall':'\uD83D\uDC83',
    'Metal':'\uD83E\uDD18','Heavy Metal':'\uD83E\uDD18','Death Metal':'\uD83E\uDD18','Black Metal':'\uD83E\uDD18','Doom Metal':'\uD83E\uDD18','Thrash Metal':'\uD83E\uDD18','Metalcore':'\uD83E\uDD18','Nu Metal':'\uD83E\uDD18','Power Metal':'\uD83E\uDD18','Symphonic Metal':'\uD83E\uDD18',
    'Jazz':'\uD83C\uDFB7','Smooth Jazz':'\uD83C\uDFB7','Bebop':'\uD83C\uDFB7','Jazz Fusion':'\uD83C\uDFB7','Acid Jazz':'\uD83C\uDFB7','Nu Jazz':'\uD83C\uDFB7','Swing':'\uD83C\uDFB7',
    'Classical':'\uD83C\uDFBB','Orchestral':'\uD83C\uDFBB','Cinematic':'\uD83C\uDFA6','Neoclassical':'\uD83C\uDFBB','Baroque':'\uD83C\uDFBB','Romantic':'\uD83C\uDFBB','Chamber Music':'\uD83C\uDFBB','Film Score':'\uD83C\uDFA6','Epic Orchestral':'\uD83C\uDFA6',
    'Indie / Folk':'\uD83C\uDF42','Folk':'\uD83C\uDF42','Acoustic':'\uD83C\uDF42','Singer-Songwriter':'\uD83C\uDF42','Indie Folk':'\uD83C\uDF42','Americana':'\uD83C\uDF42','Bluegrass':'\uD83C\uDF42','Celtic':'\uD83C\uDF42',
    'Latin':'\uD83D\uDC83','Reggaeton':'\uD83D\uDC83','Salsa':'\uD83D\uDC83','Bossa Nova':'\uD83D\uDC83','Latin Pop':'\uD83D\uDC83','Cumbia':'\uD83D\uDC83','Bachata':'\uD83D\uDC83','Merengue':'\uD83D\uDC83',
    'Country':'\uD83E\uDD20','Country Rock':'\uD83E\uDD20','Outlaw Country':'\uD83E\uDD20','Alt Country':'\uD83E\uDD20','Honky Tonk':'\uD83E\uDD20',
    'Ambient':'\uD83C\uDF0C','Lo-Fi':'\u2615','Chillout':'\u2615','Chillwave':'\u2615','Downtempo':'\u2615','New Age':'\uD83C\uDF0C','Space Ambient':'\uD83C\uDF0C','Vaporwave':'\u2615',
    'Reggae':'\uD83C\uDF34','Dub':'\uD83C\uDF34','Ska':'\uD83C\uDF34','Rocksteady':'\uD83C\uDF34','Soca':'\uD83C\uDF34','Calypso':'\uD83C\uDF34',
    'Afrobeat':'\uD83C\uDF0D','Afrobeats':'\uD83C\uDF0D','Amapiano':'\uD83C\uDF0D','Highlife':'\uD83C\uDF0D','Juju':'\uD83C\uDF0D',
    'Blues':'\uD83C\uDFB9','Delta Blues':'\uD83C\uDFB9','Chicago Blues':'\uD83C\uDFB9','Blues Rock':'\uD83C\uDFB9','Rhythm & Blues':'\uD83C\uDFB9',
    'World Music':'\uD83C\uDF0E','Middle Eastern':'\uD83C\uDF0E','Indian':'\uD83C\uDF0E','Asian':'\uD83C\uDF0E','Flamenco':'\uD83C\uDF0E','Polka':'\uD83C\uDF0E','Experimental':'\uD83D\uDD2C','Noise':'\uD83D\uDD2C',
    'Other':'\uD83C\uDFB6'
  };

  var GENRE_PARENT_EMOJIS = {
    'Pop':'\uD83C\uDFB5','Rock':'\uD83C\uDFB8','Hip-Hop':'\uD83C\uDFA4','Electronic':'\u26A1','R&B / Soul':'\uD83D\uDC9C','Funk':'\uD83D\uDD7A',
    'Metal':'\uD83E\uDD18','Jazz':'\uD83C\uDFB7','Classical':'\uD83C\uDFBB','Cinematic':'\uD83C\uDFA6','Indie / Folk':'\uD83C\uDF42',
    'Latin':'\uD83D\uDC83','Country':'\uD83E\uDD20','Ambient':'\uD83C\uDF0C','Reggae':'\uD83C\uDF34','Afrobeat':'\uD83C\uDF0D','Blues':'\uD83C\uDFB9','Other':'\uD83C\uDFB6'
  };

  var GENRE_PARENT_LIST = ['Pop','Rock','Hip-Hop','Electronic','R&B / Soul','Funk','Metal','Jazz','Classical','Cinematic','Indie / Folk','Latin','Country','Ambient','Reggae','Afrobeat','Blues','Other'];

  var GENRE_TO_SLUG = {
    'Pop':'pop','Rock':'rock','Hip-Hop':'hip-hop','Electronic':'electronic',
    'R&B / Soul':'r-b-soul','Funk':'funk','Metal':'metal','Jazz':'jazz',
    'Classical':'classical','Cinematic':'cinematic','Indie / Folk':'indie-folk',
    'Latin':'latin','Country':'country','Ambient':'ambient','Reggae':'reggae',
    'Afrobeat':'afrobeat','Blues':'blues','Other':'other'
  };

  // GENRE_SLUGS is an alias used in playlist.html — identical to GENRE_TO_SLUG
  var GENRE_SLUGS = GENRE_TO_SLUG;

  var SLUG_TO_GENRE = {};
  Object.entries(GENRE_TO_SLUG).forEach(function(entry) { SLUG_TO_GENRE[entry[1]] = entry[0]; });

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
  var SUBGENRES_BY_PARENT = {};
  Object.entries(GENRE_PARENTS).forEach(function(entry) {
    var sub = entry[0], parent = entry[1];
    _genreLookup[sub.toLowerCase().trim()] = parent;
    if (!SUBGENRES_BY_PARENT[parent]) SUBGENRES_BY_PARENT[parent] = [];
    SUBGENRES_BY_PARENT[parent].push(sub);
  });
  // Also map parent genres to themselves for case-insensitive lookup
  GENRE_PARENT_LIST.forEach(function(p) { _genreLookup[p.toLowerCase()] = p; });

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
    // Exact parent match
    if (GENRE_PARENT_LIST.indexOf(key) !== -1) return key;
    // Case-insensitive exact lookup
    var lower = key.toLowerCase();
    if (_genreLookup[lower]) return _genreLookup[lower];
    // Keyword-based fuzzy match
    var kwEntries = Object.entries(_genreKeywords);
    for (var i = 0; i < kwEntries.length; i++) {
      if (lower.includes(kwEntries[i][0])) return kwEntries[i][1];
    }
    // Nothing matched
    return 'Other';
  }

  // ═══════════════════════════════════════════════
  // 8. Rating
  // ═══════════════════════════════════════════════
  async function rateStar(trackId, score, container) {
    container.classList.add('rated');
    container.querySelectorAll('.bstar').forEach(function(s) {
      s.classList.remove('hover-fill');
      s.classList.toggle('filled', parseInt(s.dataset.score) <= score);
      s.classList.remove('ghost');
    });
    userRatings[trackId] = score;
    if (typeof gtag === 'function') gtag('event', 'rate', { track_id: trackId, score: score });
    try {
      var res = await fetch(SUPABASE_URL + '/functions/v1/rate-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId, score: score, anon_token: getAnonToken() })
      });
      var data = await res.json();
      if (!res.ok) { showToast(data.error || 'Kunne ikke rate'); return; }
      var t = getTrack(trackId);
      if (t) { t.avg_rating = data.avg_rating; t.rating_count = data.rating_count; }
      // Invalidate track cache so other pages see fresh avg/count
      try { sessionStorage.removeItem('vmai_tracks_ts'); } catch(e2) { /* ignore */ }
      showToast(score >= 4 ? '\u2B50 ' + score + '/5 \u2014 Great taste!' : '\u2705 Rated ' + score + '/5');
      // Update any visible browse cards for this track
      document.querySelectorAll('.browse-card[data-track-id="' + trackId + '"]').forEach(function(bc) {
        var sn = bc.querySelector('.browse-card-score-num');
        var sc2 = bc.querySelector('.browse-card-score-count');
        if (sn) sn.textContent = data.avg_rating ? data.avg_rating.toFixed(1) : '\u2014';
        if (sc2) sc2.textContent = (data.rating_count || 0) + ' rating' + ((data.rating_count || 0) !== 1 ? 's' : '');
        var stars = bc.querySelector('.browse-card-stars');
        if (stars && !stars.classList.contains('rated')) {
          stars.classList.add('rated');
          stars.querySelectorAll('.bstar').forEach(function(s) {
            s.classList.toggle('filled', parseInt(s.dataset.score) <= score);
          });
        }
      });
      // Update any visible track rows (playlist page)
      var row = document.querySelector('.track-row[data-track-id="' + trackId + '"]');
      if (row) {
        var numEl = row.querySelector('.track-rating-num');
        var countEl = row.querySelector('.track-rating-count');
        if (numEl) numEl.textContent = data.avg_rating ? data.avg_rating.toFixed(1) : '\u2014';
        if (countEl) countEl.textContent = '(' + (data.rating_count || 0) + ')';
      }
      // Update any visible card-{id} (index page legacy)
      var card = document.getElementById('card-' + trackId);
      if (card) {
        var se = card.querySelector('.rating-score');
        var ce = card.querySelector('.rating-count');
        if (se) se.textContent = data.avg_rating ? data.avg_rating.toFixed(1) : '\u2014';
        if (ce) ce.textContent = (data.rating_count || 0) + ' rating' + ((data.rating_count || 0) !== 1 ? 's' : '');
      }
      container.classList.add('just-rated');
      setTimeout(function() { container.classList.remove('just-rated'); }, 600);
    } catch(e) {
      showToast('Network error \u2014 try again');
    }
  }

  // Star hover/click and data-action delegation handled by main.js to avoid duplicates

  // ═══════════════════════════════════════════════
  // 9. Comments
  // ═══════════════════════════════════════════════
  var _openCommentPanel = null;

  async function toggleComments(trackId, el) {
    var card = el ? (el.closest('.browse-card') || el.closest('.track-row')) : null;
    var panel;
    if (card) {
      panel = card.querySelector('.comments-panel');
    } else {
      panel = document.getElementById('comments-' + trackId);
    }
    if (!panel) return;
    var wasOpen = panel.classList.contains('open');
    // Close previously open panel
    if (_openCommentPanel && _openCommentPanel !== panel) {
      _openCommentPanel.classList.remove('open');
    }
    _openCommentPanel = null;
    if (!wasOpen) {
      panel.classList.add('open');
      _openCommentPanel = panel;
      var contentEl = panel.querySelector('[data-track-id]') || panel.querySelector('[id^="comments-content-"]') || panel.querySelector('[id^="cc-"]');
      var tid = contentEl ? (contentEl.dataset.trackId || trackId) : trackId;
      await loadComments(tid, panel);
    }
  }

  async function loadComments(trackId, panel) {
    var contentEl = panel
      ? (panel.querySelector('[id^="cc-"]') || panel.querySelector('[id^="comments-content-"]'))
      : document.getElementById('comments-content-' + trackId);
    if (!contentEl) return;
    var limit = parseInt(contentEl.dataset.commentLimit || '30', 10);
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/comments?track_id=eq.' + trackId + '&select=content,author_name,created_at&order=created_at.desc&limit=' + (limit + 1), {
        headers: { 'apikey': SUPABASE_KEY }
      });
      var c = await res.json();
      var hasMore = c.length > limit;
      var visible = hasMore ? c.slice(0, limit) : c;
      contentEl.innerHTML = visible.length
        ? visible.map(function(x) {
            return '<div class="comment"><div class="comment-text">' + sanitize(x.content) + '</div><div class="comment-author">\u2014 ' + sanitize(x.author_name || 'Anonymous') + '</div></div>';
          }).join('')
          + (hasMore ? '<button onclick="this.parentElement.dataset.commentLimit=\'' + (limit + 30) + '\';VMA.loadComments(\'' + trackId + '\',this.closest(\'.comments-panel\'))" style="background:none;border:1px solid var(--border);color:var(--muted);padding:6px 14px;border-radius:6px;font-size:0.72rem;cursor:pointer;margin-top:8px;font-family:\'DM Sans\',sans-serif;">Show more</button>' : '')
        : '<p style="font-size:0.8rem;color:var(--muted);">No comments yet</p>';
    } catch(e) { /* silent */ }
  }

  async function addComment(trackId, el) {
    var card = el ? (el.closest('.browse-card') || el.closest('.track-row')) : null;
    var input = card ? card.querySelector('.comment-input') : document.getElementById('comment-input-' + trackId);
    if (!input) return;
    var c = input.value.trim();
    if (!c || !currentUser) return;
    var token = localStorage.getItem('sb_token');
    var name = currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'Anonymous';
    try {
      await fetch(SUPABASE_URL + '/rest/v1/comments', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId, user_id: currentUser.id, content: c, author_name: name })
      });
      if (typeof gtag === 'function') gtag('event', 'comment', { track_id: trackId });
      input.value = '';
      var panel = card ? card.querySelector('.comments-panel') : null;
      await loadComments(trackId, panel);
    } catch(e) { /* silent */ }
  }

  // ═══════════════════════════════════════════════
  // 10. Share Modal
  // ═══════════════════════════════════════════════
  var sharePlatforms = [
    { name: 'Facebook', color: '#1877F2', icon: '<svg viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>', share: function(u,t){ return 'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(u); } },
    { name: 'X', color: '#000', icon: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>', share: function(u,t){ return 'https://x.com/intent/tweet?url='+encodeURIComponent(u)+'&text='+encodeURIComponent(t); } },
    { name: 'Reddit', color: '#FF4500', icon: '<svg viewBox="0 0 24 24" fill="#FF4500"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.05 1.604a3.1 3.1 0 0 1 .046.539c0 2.689-3.117 4.868-6.979 4.868-3.862 0-6.979-2.18-6.979-4.868a3.2 3.2 0 0 1 .043-.529A1.75 1.75 0 0 1 4.028 12.2a1.75 1.75 0 0 1 1.754-1.754c.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.21 1.21 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25s.561 1.25 1.25 1.25 1.25-.562 1.25-1.25S9.939 12 9.25 12zm5.5 0c-.689 0-1.25.562-1.25 1.25s.561 1.25 1.25 1.25 1.25-.562 1.25-1.25S15.439 12 14.75 12zm-4.003 3.738a.326.326 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 3.495.913 1.01 0 2.653-.07 3.495-.913a.33.33 0 0 0 0-.463.326.326 0 0 0-.463 0c-.534.534-1.684.79-3.032.79-1.349 0-2.498-.256-3.033-.79a.326.326 0 0 0-.231-.094z"/></svg>', share: function(u,t){ return 'https://www.reddit.com/submit?url='+encodeURIComponent(u)+'&title='+encodeURIComponent(t); } },
    { name: 'WhatsApp', color: '#25D366', icon: '<svg viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>', share: function(u,t){ return 'https://wa.me/?text='+encodeURIComponent(t+' '+u); } },
    { name: 'Telegram', color: '#26A5E4', icon: '<svg viewBox="0 0 24 24" fill="#26A5E4"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>', share: function(u,t){ return 'https://t.me/share/url?url='+encodeURIComponent(u)+'&text='+encodeURIComponent(t); } },
    { name: 'LinkedIn', color: '#0A66C2', icon: '<svg viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>', share: function(u,t){ return 'https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(u); } },
    { name: 'Email', color: '#888', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 4-10 8L2 4"/></svg>', share: function(u,t){ return 'mailto:?subject='+encodeURIComponent(t)+'&body='+encodeURIComponent('Check out this AI track: '+u); } },
    { name: 'Snapchat', color: '#FFFC00', icon: '<svg viewBox="0 0 24 24" fill="#FFFC00"><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12.979-.29a.63.63 0 0 1 .293-.064c.15 0 .415.044.56.19.12.12.18.272.18.405 0 .3-.225.54-.72.72l-.015.005c-.045.015-.09.032-.135.046-.539.186-1.187.415-1.305.9a.96.96 0 0 0-.03.225c0 .12.03.27.075.39.27.705.93 1.86 2.295 2.505.06.03.18.09.195.18a.254.254 0 0 1-.045.195c-.375.54-1.455.81-1.635.855-.03.015-.12.06-.135.12-.015.045-.015.135.015.21.045.12.075.225.075.345a.72.72 0 0 1-.12.39.96.96 0 0 1-.615.345c-.39.075-.72.075-1.095.075-.3 0-.615 0-.945.045-.465.06-.765.375-1.215.72-.6.464-1.29.99-2.34.99h-.06c-1.05 0-1.74-.525-2.34-.99-.45-.345-.75-.66-1.215-.72-.33-.045-.645-.045-.945-.045-.375 0-.705 0-1.095-.075a.96.96 0 0 1-.615-.345.72.72 0 0 1-.12-.39c0-.12.03-.225.075-.345.03-.075.03-.165.015-.21-.015-.06-.105-.105-.135-.12-.18-.045-1.26-.315-1.635-.855a.254.254 0 0 1-.045-.195c.015-.09.135-.15.195-.18 1.365-.645 2.025-1.8 2.295-2.505.045-.12.075-.27.075-.39a.96.96 0 0 0-.03-.225c-.12-.49-.77-.72-1.305-.9a2.678 2.678 0 0 1-.135-.046l-.015-.005c-.405-.15-.72-.375-.72-.72 0-.18.105-.36.27-.465.135-.09.315-.12.435-.12.045 0 .09 0 .135.015.36.15.72.27 1.02.27.18 0 .3-.045.39-.09l-.003-.06c-.105-1.628-.227-3.654.3-4.847C7.859 1.069 11.214.793 12.206.793z"/></svg>', share: function(u,t){ return 'https://www.snapchat.com/scan?attachmentUrl='+encodeURIComponent(u); } },
    { name: 'Threads', color: '#000', icon: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.432 1.781 3.632 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.275-1.624-1.639-.076 1.744-.527 3.065-1.344 3.93-.949 1.003-2.349 1.478-4.163 1.41-1.382-.052-2.532-.467-3.42-1.233-1.003-.862-1.554-2.04-1.554-3.318 0-2.558 2.087-4.397 5.084-4.476 1.476-.038 2.77.251 3.861.838-.041-.893-.207-1.621-.501-2.17-.44-.822-1.182-1.256-2.206-1.292-1.2-.04-2.293.424-2.478 1.052l-1.945-.47c.378-1.284 1.825-2.39 3.85-2.514h.002c1.576-.062 3.002.37 4.01 1.216 1.106.929 1.717 2.331 1.815 4.167.474.256.903.557 1.28.906 1.007.929 1.626 2.168 1.84 3.68.325 2.318-.32 4.804-1.892 6.393C18.455 23.093 15.903 23.978 12.186 24zm-1.638-8.092c-1.903.064-3.087 1.048-3.087 2.368 0 .695.322 1.318.907 1.82.584.505 1.4.764 2.36.795 1.395.054 2.436-.298 3.091-.986.508-.534.786-1.29.832-2.258-.87-.504-1.98-.78-3.103-.739z"/></svg>', share: function(u,t){ return 'https://www.threads.net/intent/post?text='+encodeURIComponent(t+' '+u); } },
    { name: 'Copy Link', color: '#E8FF47', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#E8FF47" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>', share: function(u,t){ return null; } }
  ];

  var _shareUrl = '';
  var _shareTitle = '';

  function initShareModal() {
    var shareOverlay = document.getElementById('shareOverlay');
    var shareGrid = document.getElementById('shareGrid');
    var shareLinkInput = document.getElementById('shareLinkInput');
    var shareLinkCopy = document.getElementById('shareLinkCopy');
    var shareModalTitle = document.getElementById('shareModalTitle');
    if (!shareOverlay || !shareGrid) return;

    // Build grid once
    sharePlatforms.forEach(function(p, i) {
      var btn = document.createElement('button');
      btn.className = 'share-btn';
      btn.dataset.idx = i;
      btn.innerHTML = p.icon + '<span>' + p.name + '</span>';
      shareGrid.appendChild(btn);
    });

    shareGrid.addEventListener('click', function(e) {
      var btn = e.target.closest('.share-btn');
      if (!btn) return;
      var idx = parseInt(btn.dataset.idx);
      var p = sharePlatforms[idx];
      var url = p.share(_shareUrl, _shareTitle);
      if (url) {
        var shareLink = document.createElement('a');
        shareLink.href = url;
        shareLink.target = '_blank';
        shareLink.rel = 'noopener noreferrer';
        shareLink.click();
        if (typeof gtag === 'function') gtag('event', 'share', { method: p.name.toLowerCase() });
      } else {
        try { navigator.clipboard.writeText(_shareUrl); } catch(e2) { /* ignore */ }
        showToast('\uD83D\uDD17 Link copied!');
        if (typeof gtag === 'function') gtag('event', 'share', { method: 'clipboard' });
      }
      shareOverlay.classList.remove('active');
    });

    if (shareLinkCopy) {
      shareLinkCopy.addEventListener('click', function() {
        try { navigator.clipboard.writeText(_shareUrl); } catch(e2) { /* ignore */ }
        shareLinkCopy.textContent = 'Copied!';
        setTimeout(function() { shareLinkCopy.textContent = 'Copy'; }, 2000);
        if (typeof gtag === 'function') gtag('event', 'share', { method: 'copy_link' });
      });
    }

    shareOverlay.addEventListener('click', function(e) {
      if (e.target === shareOverlay) shareOverlay.classList.remove('active');
    });

    var shareClose = document.getElementById('shareClose');
    if (shareClose) {
      shareClose.addEventListener('click', function() {
        shareOverlay.classList.remove('active');
      });
    }
  }

  function shareTrack(id, title, btn) {
    _shareUrl = window.location.origin + '/?track=' + id;
    _shareTitle = title + ' \u2014 VoteMyAI';
    var shareOverlay = document.getElementById('shareOverlay');
    var shareModalTitle = document.getElementById('shareModalTitle');
    var shareLinkInput = document.getElementById('shareLinkInput');
    if (shareModalTitle) shareModalTitle.textContent = title;
    if (shareLinkInput) shareLinkInput.value = _shareUrl;
    if (shareOverlay) shareOverlay.classList.add('active');
    if (typeof gtag === 'function') gtag('event', 'share_open', { track_id: id });
  }

  // ═══════════════════════════════════════════════
  // 11. Drag System
  // ═══════════════════════════════════════════════
  var _drag = null;
  var _dragMomentumId = null;

  function cleanupDrag() {
    if (_dragMomentumId) { cancelAnimationFrame(_dragMomentumId); _dragMomentumId = null; }
    if (_drag && _drag.el) _drag.el.style.cursor = '';
    document.body.classList.remove('is-dragging');
    _drag = null;
  }

  function onDragStart(e, scrollEl) {
    // Don't intercept interactive elements
    if (e.button !== 0) return;
    if (e.target.closest('button, .bstar, a, .browse-card-footer, .comment-input, .comment-form, .comment-submit, .comments-panel, .browse-card-note, .browse-card-note-toggle, .browse-card-note-text, .browse-card-play, input, textarea')) return;

    // Kill any previous drag/momentum
    cleanupDrag();

    var scroll = scrollEl || e.currentTarget;
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

  // Global mouse handlers for drag
  document.addEventListener('mousemove', function(e) {
    if (!_drag) return;
    // If mouse button is not held down, cancel drag immediately
    if (e.buttons === 0) { cleanupDrag(); return; }
    var now = performance.now();
    var dt = now - _drag.lastTime;
    var dx = e.clientX - _drag.lastX;
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
  }, { passive: true });

  document.addEventListener('mouseup', function() {
    if (!_drag) return;
    var el = _drag.el;
    var wasDragged = _drag.moved;
    var velocity = _drag.velocity;

    // Always clean up visual state immediately
    el.style.cursor = '';
    document.body.classList.remove('is-dragging');

    if (wasDragged) {
      // Momentum coast
      var v = -velocity * 800;
      if (Math.abs(v) > 20) {
        var friction = 0.92;
        var last = performance.now();
        function coast(now) {
          var dt2 = (now - last) / 1000;
          last = now;
          v *= friction;
          el.scrollLeft += v * dt2;
          if (Math.abs(v) > 5) {
            _dragMomentumId = requestAnimationFrame(coast);
          } else {
            _dragMomentumId = null;
          }
        }
        _dragMomentumId = requestAnimationFrame(coast);
      }
      // Block the click that follows mouseup after a drag
      el.addEventListener('click', function(ev) { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    }

    // Always null out _drag on mouseup — momentum runs independently
    _drag = null;
  });

  document.documentElement.addEventListener('mouseleave', function() {
    if (_drag) cleanupDrag();
  });
  window.addEventListener('blur', cleanupDrag);
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) cleanupDrag();
  });

  // Kill ALL native browser drag within scrollable sections
  document.addEventListener('dragstart', function(e) {
    if (e.target.closest('.genre-row-scroll, .search-results-grid, .browse-card, .genre-pills, .subgenre-pills, .genre-pill, .subgenre-pill')) {
      e.preventDefault();
    }
  });

  // ═══════════════════════════════════════════════
  // 12. Global Click Delegation (data-action)
  // ═══════════════════════════════════════════════
  //
  // Single global handler for all data-action clicks.
  // Covers browse-card play/stop, comments, share, leaderboard play, artist notes.
  //

  // Data-action click delegation and note scroll handlers moved to main.js to avoid duplicates

  // ═══════════════════════════════════════════════
  // 13. Cookie Consent
  // ═══════════════════════════════════════════════
  function acceptCookies() {
    localStorage.setItem('cookie_consent', 'accepted');
    var banner = document.getElementById('cookieBanner');
    if (banner) banner.remove();
  }

  function declineCookies() {
    localStorage.setItem('cookie_consent', 'declined');
    var banner = document.getElementById('cookieBanner');
    if (banner) banner.remove();
    window['ga-disable-G-KW4NR9QBWB'] = true;
  }

  // Auto-show cookie banner if no consent stored
  (function() {
    var consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      var banner = document.getElementById('cookieBanner');
      if (banner) banner.style.display = 'block';
    } else if (consent === 'declined') {
      window['ga-disable-G-KW4NR9QBWB'] = true;
    }
  })();

  // ═══════════════════════════════════════════════
  // 14. Navigation Helpers
  // ═══════════════════════════════════════════════
  (function() {
    var hamburger = document.getElementById('hamburger');
    var mobileNav = document.getElementById('mobileNav');
    if (hamburger && mobileNav) {
      hamburger.addEventListener('click', function() {
        hamburger.classList.toggle('open');
        mobileNav.classList.toggle('open');
      });
      mobileNav.addEventListener('click', function(e) {
        if (e.target.closest('.nav-link')) {
          hamburger.classList.remove('open');
          mobileNav.classList.remove('open');
        }
      });
    }
  })();

  // ═══════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════
  return {
    // Config
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_KEY: SUPABASE_KEY,
    TRACK_FIELDS: TRACK_FIELDS,
    PAGE_SIZE: PAGE_SIZE,
    isIOS: isIOS,
    starSVG: starSVG,

    // State (with getters/setters for mutable state)
    get currentUser() { return currentUser; },
    set currentUser(v) { currentUser = v; },
    get allTracks() { return allTracks; },
    get userRatings() { return userRatings; },

    // Auth
    checkAuth: checkAuth,
    loadAnonRatings: loadAnonRatings,
    getAnonToken: getAnonToken,

    // Tracks
    loadTracks: loadTracks,
    rebuildTrackMap: rebuildTrackMap,
    getTrack: getTrack,

    // Embeds
    detectPlatform: detectPlatform,

    // Utils
    sanitize: sanitize,
    sanitizeAttr: sanitizeAttr,
    wilsonScore: wilsonScore,
    showToast: showToast,
    partialSort: partialSort,

    // Genre
    GENRE_PARENTS: GENRE_PARENTS,
    GENRE_PARENT_LIST: GENRE_PARENT_LIST,
    GENRE_EMOJIS: GENRE_EMOJIS,
    GENRE_PARENT_EMOJIS: GENRE_PARENT_EMOJIS,
    GENRE_TO_SLUG: GENRE_TO_SLUG,
    GENRE_SLUGS: GENRE_SLUGS,
    SLUG_TO_GENRE: SLUG_TO_GENRE,
    SUBGENRES_BY_PARENT: SUBGENRES_BY_PARENT,
    resolveGenre: resolveGenre,

    // Rating
    rateStar: rateStar,

    // Comments
    toggleComments: toggleComments,
    loadComments: loadComments,
    addComment: addComment,

    // Share
    shareTrack: shareTrack,
    initShareModal: initShareModal,
    sharePlatforms: sharePlatforms,

    // Drag
    cleanupDrag: cleanupDrag,
    onDragStart: onDragStart,

    // Cookie
    acceptCookies: acceptCookies,
    declineCookies: declineCookies,

    // Page lifecycle — slot for current page's cleanup function
    _pageCleanup: null
  };
})();
