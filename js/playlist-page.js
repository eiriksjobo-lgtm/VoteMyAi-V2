/**
 * VoteMyAI — Playlist Page Module
 *
 * All playlist-page-specific logic extracted from playlist.html.
 * Runs as an IIFE with cleanup pattern for SPA compatibility.
 */
(function () {
  'use strict';

  var VMA    = window.VMA;
  var Player = window.VMAPlayer;
  var _cleanup = [];

  // ─── Constants ───────────────────────────────────────────────────────
  var DISPLAY_CHUNK = 50;

  // ─── State ───────────────────────────────────────────────────────────
  var filteredTracks  = [];
  var sortedTracks    = [];
  var displayCount    = DISPLAY_CHUNK;
  var currentSort     = 'top';
  var currentGenreSlug = null;
  var currentSubgenre  = null;
  var searchQuery      = '';
  var searchTimeout    = null;
  var activeTrackId    = null;

  // ─── Drag state (scoped to this module) ──────────────────────────────
  var _drag           = null;
  var _dragMomentumId = null;

  // ─── Comment & Note state ────────────────────────────────────────────
  var _openCommentPanel = null;
  var _openNoteEl       = null;
  var _noteScrollStart  = null;

  // ─── Share platform configuration ────────────────────────────────────
  var sharePlatforms = [
    { name: 'Facebook',  icon: '<svg viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>', share: function(u) { return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(u); } },
    { name: 'X',         icon: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>', share: function(u, t) { return 'https://x.com/intent/tweet?url=' + encodeURIComponent(u) + '&text=' + encodeURIComponent(t); } },
    { name: 'Reddit',    icon: '<svg viewBox="0 0 24 24" fill="#FF4500"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.05 1.604a3.1 3.1 0 0 1 .046.539c0 2.689-3.117 4.868-6.979 4.868-3.862 0-6.979-2.18-6.979-4.868a3.2 3.2 0 0 1 .043-.529A1.75 1.75 0 0 1 4.028 12.2a1.75 1.75 0 0 1 1.754-1.754c.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.21 1.21 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25s.561 1.25 1.25 1.25 1.25-.562 1.25-1.25S9.939 12 9.25 12zm5.5 0c-.689 0-1.25.562-1.25 1.25s.561 1.25 1.25 1.25 1.25-.562 1.25-1.25S15.439 12 14.75 12zm-4.003 3.738a.326.326 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 3.495.913 1.01 0 2.653-.07 3.495-.913a.33.33 0 0 0 0-.463.326.326 0 0 0-.463 0c-.534.534-1.684.79-3.032.79-1.349 0-2.498-.256-3.033-.79a.326.326 0 0 0-.231-.094z"/></svg>', share: function(u, t) { return 'https://www.reddit.com/submit?url=' + encodeURIComponent(u) + '&title=' + encodeURIComponent(t); } },
    { name: 'WhatsApp',  icon: '<svg viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>', share: function(u, t) { return 'https://wa.me/?text=' + encodeURIComponent(t + ' ' + u); } },
    { name: 'Telegram',  icon: '<svg viewBox="0 0 24 24" fill="#26A5E4"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>', share: function(u, t) { return 'https://t.me/share/url?url=' + encodeURIComponent(u) + '&text=' + encodeURIComponent(t); } },
    { name: 'LinkedIn',  icon: '<svg viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>', share: function(u, t) { return 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(u); } },
    { name: 'Email',     icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 4-10 8L2 4"/></svg>', share: function(u, t) { return 'mailto:?subject=' + encodeURIComponent(t) + '&body=' + encodeURIComponent('Check out this AI track: ' + u); } },
    { name: 'Snapchat',  icon: '<svg viewBox="0 0 24 24" fill="#FFFC00"><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12.979-.29a.63.63 0 0 1 .293-.064c.15 0 .415.044.56.19.12.12.18.272.18.405 0 .3-.225.54-.72.72l-.015.005c-.045.015-.09.032-.135.046-.539.186-1.187.415-1.305.9a.96.96 0 0 0-.03.225c0 .12.03.27.075.39.27.705.93 1.86 2.295 2.505.06.03.18.09.195.18a.254.254 0 0 1-.045.195c-.375.54-1.455.81-1.635.855-.03.015-.12.06-.135.12-.015.045-.015.135.015.21.045.12.075.225.075.345a.72.72 0 0 1-.12.39.96.96 0 0 1-.615.345c-.39.075-.72.075-1.095.075-.3 0-.615 0-.945.045-.465.06-.765.375-1.215.72-.6.464-1.29.99-2.34.99h-.06c-1.05 0-1.74-.525-2.34-.99-.45-.345-.75-.66-1.215-.72-.33-.045-.645-.045-.945-.045-.375 0-.705 0-1.095-.075a.96.96 0 0 1-.615-.345.72.72 0 0 1-.12-.39c0-.12.03-.225.075-.345.03-.075.03-.165.015-.21-.015-.06-.105-.105-.135-.12-.18-.045-1.26-.315-1.635-.855a.254.254 0 0 1-.045-.195c.015-.09.135-.15.195-.18 1.365-.645 2.025-1.8 2.295-2.505.045-.12.075-.27.075-.39a.96.96 0 0 0-.03-.225c-.12-.49-.77-.72-1.305-.9a2.678 2.678 0 0 1-.135-.046l-.015-.005c-.405-.15-.72-.375-.72-.72 0-.18.105-.36.27-.465.135-.09.315-.12.435-.12.045 0 .09 0 .135.015.36.15.72.27 1.02.27.18 0 .3-.045.39-.09l-.003-.06c-.105-1.628-.227-3.654.3-4.847C7.859 1.069 11.214.793 12.206.793z"/></svg>', share: function(u) { return 'https://www.snapchat.com/scan?attachmentUrl=' + encodeURIComponent(u); } },
    { name: 'Threads',   icon: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.432 1.781 3.632 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.275-1.624-1.639-.076 1.744-.527 3.065-1.344 3.93-.949 1.003-2.349 1.478-4.163 1.41-1.382-.052-2.532-.467-3.42-1.233-1.003-.862-1.554-2.04-1.554-3.318 0-2.558 2.087-4.397 5.084-4.476 1.476-.038 2.77.251 3.861.838-.041-.893-.207-1.621-.501-2.17-.44-.822-1.182-1.256-2.206-1.292-1.2-.04-2.293.424-2.478 1.052l-1.945-.47c.378-1.284 1.825-2.39 3.85-2.514h.002c1.576-.062 3.002.37 4.01 1.216 1.106.929 1.717 2.331 1.815 4.167.474.256.903.557 1.28.906 1.007.929 1.626 2.168 1.84 3.68.325 2.318-.32 4.804-1.892 6.393C18.455 23.093 15.903 23.978 12.186 24zm-1.638-8.092c-1.903.064-3.087 1.048-3.087 2.368 0 .695.322 1.318.907 1.82.584.505 1.4.764 2.36.795 1.395.054 2.436-.298 3.091-.986.508-.534.786-1.29.832-2.258-.87-.504-1.98-.78-3.103-.739z"/></svg>', share: function(u, t) { return 'https://www.threads.net/intent/post?text=' + encodeURIComponent(t + ' ' + u); } },
    { name: 'Copy Link', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#E8FF47" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>', share: function() { return null; } }
  ];

  // ─── Shared helpers (from VMA global, with inline fallbacks) ──────────

  // Sanitize for text content
  var _sanitizeEl = document.createElement('div');
  function sanitize(str) {
    if (VMA && VMA.sanitize) return VMA.sanitize(str);
    if (!str) return '';
    _sanitizeEl.textContent = str;
    return _sanitizeEl.innerHTML;
  }

  // Sanitize for HTML attribute values
  function sanitizeAttr(str) {
    if (VMA && VMA.sanitizeAttr) return VMA.sanitizeAttr(str);
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Current user (via VMA global or direct localStorage check)
  function currentUser() {
    if (VMA && VMA.currentUser !== undefined) return VMA.currentUser;
    return null;
  }

  // All tracks (via VMA global)
  function allTracks() {
    return (VMA && VMA.allTracks) ? VMA.allTracks : [];
  }

  // User ratings (via VMA global or empty)
  function userRatings() {
    return (VMA && VMA.userRatings) ? VMA.userRatings : {};
  }

  // Supabase credentials (via VMA global with fallbacks)
  function supabaseUrl() {
    return (VMA && VMA.SUPABASE_URL) ? VMA.SUPABASE_URL : 'https://gezijezmsecbtzytotax.supabase.co';
  }
  function supabaseKey() {
    return (VMA && VMA.SUPABASE_KEY) ? VMA.SUPABASE_KEY : 'sb_publishable_hOOMtCz7gYsu_-CVD6lW9Q_SxtFlNhw';
  }

  // Anon token
  function getAnonToken() {
    if (VMA && VMA.getAnonToken) return VMA.getAnonToken();
    var token = localStorage.getItem('votemyai_anon_token');
    if (!token) { token = 'anon_' + crypto.randomUUID(); localStorage.setItem('votemyai_anon_token', token); }
    return token;
  }

  // Toast notification
  function showToast(msg) {
    if (VMA && VMA.showToast) { VMA.showToast(msg); return; }
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
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
    }, 2500);
  }

  // Star SVG path used inside interactive stars
  var starSVG = '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>';

  // ─── Genre helpers (from VMA global, with inline fallbacks) ──────────

  function genreParentList() {
    return (VMA && VMA.GENRE_PARENT_LIST) ? VMA.GENRE_PARENT_LIST
      : ['Pop','Rock','Hip-Hop','Electronic','R&B / Soul','Funk','Metal','Jazz','Classical','Cinematic','Indie / Folk','Latin','Country','Ambient','Reggae','Afrobeat','Blues','Other'];
  }

  function genreSlugs() {
    return (VMA && VMA.GENRE_SLUGS) ? VMA.GENRE_SLUGS
      : { 'Pop':'pop','Rock':'rock','Hip-Hop':'hip-hop','Electronic':'electronic','R&B / Soul':'r-b-soul','Funk':'funk','Metal':'metal','Jazz':'jazz','Classical':'classical','Cinematic':'cinematic','Indie / Folk':'indie-folk','Latin':'latin','Country':'country','Ambient':'ambient','Reggae':'reggae','Afrobeat':'afrobeat','Blues':'blues','Other':'other' };
  }

  function slugToGenre() {
    if (VMA && VMA.SLUG_TO_GENRE) return VMA.SLUG_TO_GENRE;
    var map = {};
    var slugs = genreSlugs();
    Object.keys(slugs).forEach(function (g) { map[slugs[g]] = g; });
    return map;
  }

  function genreParentEmojis() {
    return (VMA && VMA.GENRE_PARENT_EMOJIS) ? VMA.GENRE_PARENT_EMOJIS
      : { 'Pop':'\ud83c\udfb5','Rock':'\ud83c\udfb8','Hip-Hop':'\ud83c\udfa4','Electronic':'\u26a1','R&B / Soul':'\ud83d\udc9c','Funk':'\ud83d\udd7a','Metal':'\ud83e\udd18','Jazz':'\ud83c\udfb7','Classical':'\ud83c\udfbb','Cinematic':'\ud83c\udfac','Indie / Folk':'\ud83c\udf42','Latin':'\ud83d\udc83','Country':'\ud83e\udd20','Ambient':'\ud83c\udf0c','Reggae':'\ud83c\udf34','Afrobeat':'\ud83c\udf0d','Blues':'\ud83c\udfb9','Other':'\ud83c\udfb6' };
  }

  function subgenresByParent() {
    return (VMA && VMA.SUBGENRES_BY_PARENT) ? VMA.SUBGENRES_BY_PARENT : {};
  }

  function resolveGenre(g) {
    if (VMA && VMA.resolveGenre) return VMA.resolveGenre(g);
    // Minimal inline fallback
    if (!g) return 'Other';
    var key = g.trim();
    if (genreParentList().indexOf(key) !== -1) return key;
    return 'Other';
  }

  function wilsonScore(avg, n) {
    if (VMA && VMA.wilsonScore) return VMA.wilsonScore(avg, n);
    if (n === 0) return 0;
    var p = (avg - 1) / 4;
    var z = 1.96;
    var z2 = z * z;
    return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
  }

  function detectPlatform(url) {
    if (VMA && VMA.detectPlatform) return VMA.detectPlatform(url);
    if (!url) return { platform: 'unknown' };
    var ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([^&?\/#]+)/);
    if (ytMatch) return { platform: 'youtube', videoId: ytMatch[1] };
    if (url.includes('soundcloud.com')) {
      var isShort = url.includes('/s-');
      return { platform: 'soundcloud', url: url, isShort: isShort };
    }
    if (url.includes('suno.com') || url.includes('suno.ai')) {
      var sunoMatch = url.match(/\/([a-f0-9-]{36})/);
      if (sunoMatch) return { platform: 'suno', sunoId: sunoMatch[1], url: url };
      return { platform: 'suno', url: url };
    }
    if (url.includes('udio.com')) {
      var udioUuid = url.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
      if (udioUuid) return { platform: 'udio', udioId: udioUuid[0], url: url };
      var udioSlug = url.match(/udio\.com\/songs\/([a-zA-Z0-9_-]+)/);
      if (udioSlug) return { platform: 'udio', udioId: udioSlug[1], url: url };
      return { platform: 'udio', url: url };
    }
    return { platform: 'unknown' };
  }

  function getTrackPlatform(track) {
    if (VMA && VMA.getTrackPlatform) return VMA.getTrackPlatform(track);
    if (track.embed_url) return detectPlatform(track.embed_url);
    if (track.yt_id) return { platform: 'youtube', videoId: track.yt_id };
    return { platform: 'unknown' };
  }

  function findTrackById(id) {
    if (VMA && VMA.findTrackById) return VMA.findTrackById(id);
    return allTracks().find(function (t) { return String(t.id) === String(id); });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 2. Thumbnail helper
  // ═══════════════════════════════════════════════════════════════════════

  function getThumb(track) {
    if (track.thumbnail_url) return track.thumbnail_url;
    if (track.tool && track.tool.toLowerCase().includes('suno') && track.embed_url) {
      var m = track.embed_url.match(/\/([a-f0-9-]{36})/);
      if (m) return 'https://cdn2.suno.ai/image_' + m[1] + '.jpeg';
    }
    if (track.yt_id) return 'https://img.youtube.com/vi/' + track.yt_id + '/default.jpg';
    return '';
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 3. Stars HTML
  // ═══════════════════════════════════════════════════════════════════════

  function starsHTML(avg) {
    var rounded = Math.round((avg || 0) * 2) / 2;
    var html = '';
    for (var i = 1; i <= 5; i++) {
      var cls = i <= Math.floor(rounded) ? 'filled' : 'empty';
      html += '<svg class="' + cls + '" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>';
    }
    return html;
  }

  function interactiveStarsHTML(track) {
    var trackId = track.id;
    var ratings = userRatings();
    var userScore = ratings[trackId];
    var avg = track.avg_rating ? Math.round(parseFloat(track.avg_rating) * 2) / 2 : 0;
    var isRated = userScore !== undefined;
    var html = '';
    for (var i = 1; i <= 5; i++) {
      var cls = 'bstar';
      if (isRated) {
        cls += i <= userScore ? ' filled' : '';
      } else if (avg > 0) {
        cls += i <= Math.floor(avg) ? ' ghost' : '';
      }
      html += '<span class="' + cls + '" data-track="' + trackId + '" data-score="' + i + '">' + starSVG + '</span>';
    }
    return '<div class="track-stars' + (isRated ? ' rated' : '') + '" data-track="' + trackId + '">' + html + '</div>';
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 4. Skeleton
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
  // 5. Filtering & Sorting
  // ═══════════════════════════════════════════════════════════════════════

  function applyFilters() {
    var genreName = currentGenreSlug ? slugToGenre()[currentGenreSlug] : null;

    // Genre filter
    filteredTracks = genreName
      ? allTracks().filter(function (t) { return resolveGenre(t.genre) === genreName; })
      : allTracks().slice();

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

    // Sort
    sortTracks();

    // Update header
    updateHeader(genreName);

    // Reset display
    displayCount = DISPLAY_CHUNK;
    renderList();
  }

  function sortTracks() {
    sortedTracks = filteredTracks.slice();
    if (currentSort === 'top') {
      sortedTracks.sort(function (a, b) {
        var sa = wilsonScore(a.avg_rating || 0, a.rating_count || 0);
        var sb = wilsonScore(b.avg_rating || 0, b.rating_count || 0);
        return sb - sa;
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

  function updateHeader(genreName) {
    var emoji = genreName ? (genreParentEmojis()[genreName] || '\ud83c\udfb6') : '\ud83c\udfb6';
    var titleEl = document.getElementById('playlistTitle');
    if (!titleEl) return;

    if (genreName) {
      var displayName = currentSubgenre || genreName;
      titleEl.innerHTML = emoji + ' <span class="accent">' + displayName.toUpperCase() + '</span>';
      document.title = displayName + ' Playlist \u2014 VoteMyAI';
      var desc = 'Listen to top-rated AI ' + genreName + ' tracks on VoteMyAI.';
      var metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.content = desc;
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.content = document.title;
      var ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.content = desc;
      var twTitle = document.querySelector('meta[name="twitter:title"]');
      if (twTitle) twTitle.content = document.title;
      var twDesc = document.querySelector('meta[name="twitter:description"]');
      if (twDesc) twDesc.content = desc;
      var slugs = genreSlugs();
      var url = 'https://www.votemyai.com/playlist.html?genre=' + (slugs[genreName] || '');
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.href = url;
      var ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.content = url;
    } else {
      titleEl.innerHTML = 'ALL <span class="accent">TRACKS</span>';
      document.title = 'Playlist \u2014 VoteMyAI';
    }

    var countEl = document.getElementById('playlistCount');
    if (countEl) countEl.textContent = filteredTracks.length + ' tracks';
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 6. Track Row HTML
  // ═══════════════════════════════════════════════════════════════════════

  function buildRowHTML(t) {
    var thumb = getThumb(t);
    var thumbHTML = thumb
      ? '<img class="track-thumb" src="' + thumb + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
      : '<div class="track-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:var(--muted)">\ud83c\udfb5</div>';
    var avg = t.avg_rating ? parseFloat(t.avg_rating).toFixed(1) : '\u2014';
    var count = t.rating_count || 0;
    var genre = resolveGenre(t.genre);
    var tool = t.tool || '';
    var isPlaying = activeTrackId !== null && String(t.id) === String(activeTrackId);
    var playIcon = isPlaying
      ? '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>';
    var noteToggle = t.artist_note
      ? '<span class="track-note-toggle" data-action="toggle-note" data-track="' + t.id + '">Artist Note</span>'
      : '';
    var user = currentUser();
    var commentFormHTML = user
      ? '<div class="comment-form"><input class="comment-input" placeholder="Add a comment..." maxlength="500"><button class="comment-submit" data-action="post-comment" data-track="' + t.id + '">Post</button></div>'
      : '<div style="font-size:.72rem;color:var(--muted);margin-top:8px;"><a href="/login.html" style="color:var(--accent);">Log in</a> to comment</div>';

    return '<div class="track-row' + (isPlaying ? ' playing' : '') + '" data-track-id="' + t.id + '" data-title="' + sanitizeAttr(t.title || 'Untitled') + '" data-tool="' + sanitizeAttr(tool) + '" data-genre="' + sanitizeAttr(genre) + '">' +
      thumbHTML +
      '<div class="track-info">' +
        '<div class="track-title" title="' + sanitizeAttr(t.title || '') + '">' + sanitize(t.title || 'Untitled') + '</div>' +
        '<div class="track-badges">' +
          (tool ? '<span class="track-badge tool">' + sanitize(tool) + '</span>' : '') +
          '<span class="track-badge genre">' + sanitize(genre) + '</span>' +
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
        '<button class="track-action-btn" data-action="share" data-track="' + t.id + '" data-title="' + sanitizeAttr(t.title || 'Untitled') + '" title="Share" aria-label="Share"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></button>' +
      '</div>' +
      '<button class="track-play" aria-label="' + (isPlaying ? 'Stop' : 'Play') + '" data-action="play" data-track-id="' + t.id + '">' +
        playIcon +
      '</button>' +
      (t.artist_note ? '<div class="track-note-text" id="note-' + t.id + '">' + sanitize(t.artist_note) + '</div>' : '') +
      '<div class="comments-panel" id="comments-' + t.id + '">' +
        '<div class="comments-inner" id="cc-' + t.id + '" data-track-id="' + t.id + '" data-comment-limit="30"></div>' +
        commentFormHTML +
      '</div>' +
      '<div class="track-embed-area" id="embed-' + t.id + '"></div>' +
    '</div>';
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 7. Render
  // ═══════════════════════════════════════════════════════════════════════

  function renderList() {
    var list = document.getElementById('trackList');
    if (!list) return;

    var visible = sortedTracks.slice(0, displayCount);

    if (visible.length === 0) {
      if (activeTrackId !== null) stopTrack();
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">\ud83d\udd0d</div><p>No tracks found.</p></div>';
      var wrap = document.getElementById('loadMoreWrap');
      if (wrap) wrap.style.display = 'none';
      return;
    }

    // Detach playing embed so it survives DOM rebuild
    var savedEmbed = null;
    var savedTrackId = null;
    if (activeTrackId !== null) {
      var playingRow = list.querySelector('.track-row[data-track-id="' + activeTrackId + '"]');
      if (playingRow) {
        var embedArea = playingRow.querySelector('.track-embed-area');
        if (embedArea && embedArea.querySelector('iframe')) {
          savedTrackId = activeTrackId;
          savedEmbed = embedArea;
          // Move out of DOM to preserve iframe state
          savedEmbed.remove();
        }
      }
    }

    list.innerHTML = visible.map(function (t) { return buildRowHTML(t); }).join('');

    // Re-attach saved embed if the playing track is still visible
    if (savedEmbed && savedTrackId !== null) {
      var newRow = list.querySelector('.track-row[data-track-id="' + savedTrackId + '"]');
      if (newRow) {
        var placeholder = newRow.querySelector('.track-embed-area');
        if (placeholder) placeholder.replaceWith(savedEmbed);
        savedEmbed.style.display = 'block';
        newRow.classList.add('playing');
        var btn = newRow.querySelector('.track-play');
        if (btn) {
          btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
          btn.setAttribute('aria-label', 'Stop');
        }
      } else {
        // Playing track no longer visible -- keep it playing but embed is lost
        // Re-create it when user scrolls back or clicks locate
        savedEmbed = null;
      }
    }

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


  // ═══════════════════════════════════════════════════════════════════════
  // 8. Genre Pills
  // ═══════════════════════════════════════════════════════════════════════

  function renderGenrePills() {
    var container = document.getElementById('genrePills');
    if (!container) return;

    var html = '<a class="genre-pill' + (!currentGenreSlug ? ' active' : '') + '" href="/playlist.html">All Genres</a>';
    var parents = genreParentList();
    var slugs = genreSlugs();
    var emojis = genreParentEmojis();

    parents.forEach(function (g) {
      var slug = slugs[g];
      var emoji = emojis[g] || '\ud83c\udfb6';
      var active = currentGenreSlug === slug ? ' active' : '';
      html += '<a class="genre-pill' + active + '" href="/playlist.html?genre=' + slug + '">' + emoji + ' ' + g + '</a>';
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
  // 9. Subgenre Pills
  // ═══════════════════════════════════════════════════════════════════════

  function renderSubgenrePills() {
    var wrap = document.getElementById('subgenreWrap');
    var container = document.getElementById('subgenrePills');
    if (!wrap || !container) return;

    var genreName = currentGenreSlug ? slugToGenre()[currentGenreSlug] : null;
    if (!genreName) { wrap.style.display = 'none'; currentSubgenre = null; return; }

    // Collect subgenres that actually have tracks in the data
    var parentSubs = subgenresByParent()[genreName] || [];
    if (parentSubs.length === 0) { wrap.style.display = 'none'; currentSubgenre = null; return; }

    var tracks = allTracks();
    var subCounts = {};
    tracks.forEach(function (t) {
      if (resolveGenre(t.genre) !== genreName) return;
      var g = (t.genre || '').trim();
      if (g && g !== genreName) {
        subCounts[g] = (subCounts[g] || 0) + 1;
      }
    });

    // Sort by count descending
    var subs = Object.entries(subCounts).sort(function (a, b) { return b[1] - a[1]; });
    if (subs.length === 0) { wrap.style.display = 'none'; currentSubgenre = null; return; }

    var html = '<span class="subgenre-pill' + (!currentSubgenre ? ' active' : '') + '" data-sub="">All ' + sanitize(genreName) + '</span>';
    subs.forEach(function (entry) {
      var sub = entry[0];
      var count = entry[1];
      var active = currentSubgenre && currentSubgenre.toLowerCase() === sub.toLowerCase() ? ' active' : '';
      html += '<span class="subgenre-pill' + active + '" data-sub="' + sanitizeAttr(sub) + '">' + sanitize(sub) + ' <span style="opacity:.5">' + count + '</span></span>';
    });
    container.innerHTML = html;
    wrap.style.display = '';
    requestAnimationFrame(updateSubArrows);
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 10. Arrow helpers & Drag-to-scroll
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

  // --- Drag-to-scroll for pill rows ---

  function cleanupDrag() {
    if (_dragMomentumId) { cancelAnimationFrame(_dragMomentumId); _dragMomentumId = null; }
    document.body.classList.remove('is-dragging');
    _drag = null;
  }

  function onPillDragStart(e) {
    if (e.button !== 0) return;
    if (e.target.closest('button, a, .bstar, input, textarea')) return;
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

  function onDocMouseMove(e) {
    if (!_drag) return;
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
      document.body.classList.add('is-dragging');
    }
    if (_drag.moved) {
      _drag.el.scrollLeft = _drag.scrollStart - totalDx;
    }
  }

  function onDocMouseUp() {
    if (!_drag) return;
    var el = _drag.el;
    var wasDragged = _drag.moved;
    var velocity = _drag.velocity;
    document.body.classList.remove('is-dragging');
    if (wasDragged) {
      // Momentum coast
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
      // Block click after drag
      el.addEventListener('click', function (ev) { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    }
    _drag = null;
  }

  function onDocMouseLeave() {
    if (_drag) cleanupDrag();
  }

  function onWindowBlur() {
    cleanupDrag();
  }

  function onVisibilityChange() {
    if (document.hidden) cleanupDrag();
  }

  function onDragStart(e) {
    if (e.target.closest('.genre-pills, .subgenre-pills, .genre-pill, .subgenre-pill')) {
      e.preventDefault();
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 11. Playback
  // ═══════════════════════════════════════════════════════════════════════

  function playTrack(trackId) {
    // Toggle: same track => stop
    if (activeTrackId !== null && String(activeTrackId) === String(trackId)) {
      stopTrack();
      return;
    }
    // Stop current if any
    if (activeTrackId !== null) stopTrack();

    var track = findTrackById(trackId);
    if (!track) return;

    var row = document.querySelector('.track-row[data-track-id="' + trackId + '"]');
    if (!row) return;

    var info = getTrackPlatform(track);

    // Mark as playing
    activeTrackId = trackId;
    row.classList.add('playing');

    // Change play icon to stop icon
    var btn = row.querySelector('.track-play');
    if (btn) {
      btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
      btn.setAttribute('aria-label', 'Stop');
    }

    // Embed area is always in DOM
    var embedArea = row.querySelector('.track-embed-area');
    populateEmbed(track, info, embedArea);

    // Activate player bar
    activatePlayerBar(track);

    if (typeof gtag === 'function') {
      gtag('event', 'playlist_play', { track_id: trackId, platform: info.platform });
    }
  }

  function activatePlayerBar(track) {
    // Delegate to Player module if available
    if (Player && typeof Player.activatePlayerBar === 'function') {
      Player.activatePlayerBar(track);
      return;
    }
    // Fallback: update player bar directly
    var playerBar   = document.getElementById('playerBar');
    var playerTitle = document.getElementById('playerTitle');
    var playerMeta  = document.getElementById('playerMeta');
    if (!playerBar) return;

    var genre = resolveGenre(track.genre);
    if (playerTitle) playerTitle.textContent = track.title || 'Now Playing';
    if (playerMeta)  playerMeta.textContent = [track.tool, genre].filter(Boolean).join(' \u00b7 ');
    playerBar.classList.add('active', 'playing');
    document.body.classList.add('player-active');
  }

  function populateEmbed(track, info, embedArea) {
    if (!embedArea) return;
    var isMobile = window.innerWidth <= 640;

    if (info.platform === 'youtube') {
      embedArea.innerHTML = '<div class="embed-yt"><iframe src="https://www.youtube.com/embed/' + info.videoId + '?rel=0&autoplay=1&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(window.location.origin) + '" allow="autoplay; encrypted-media" allowfullscreen playsinline></iframe></div>';
      embedArea.style.display = 'block';
    } else if (info.platform === 'suno' && info.sunoId) {
      var sunoH = isMobile ? '120px' : '160px';
      embedArea.innerHTML = '<div class="embed-suno"><iframe src="https://suno.com/embed/' + info.sunoId + '?autoplay=true" allow="autoplay" style="height:' + sunoH + '" playsinline></iframe></div>';
      embedArea.style.display = 'block';
    } else if (info.platform === 'soundcloud') {
      if (info.isShort) {
        embedArea.innerHTML = '<a href="' + sanitizeAttr(track.embed_url) + '" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;height:48px;background:var(--surface-2);border-radius:8px;color:#ff5500;text-decoration:none;gap:8px;font-weight:600;font-size:.82rem;"><svg width="18" height="18" viewBox="0 0 24 24" fill="#ff5500"><polygon points="6 3 20 12 6 21 6 3"/></svg>Play on SoundCloud</a>';
        embedArea.style.display = 'block';
      } else {
        var scH = isMobile ? '120px' : '166px';
        embedArea.innerHTML = '<iframe src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(info.url) + '&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true" allow="autoplay" style="width:100%;height:' + scH + ';border:none;border-radius:8px" playsinline></iframe>';
        embedArea.style.display = 'block';
      }
    } else if (info.platform === 'udio') {
      var embedId = info.udioId;
      if (embedId) {
        var udioH = isMobile ? '140px' : '180px';
        embedArea.innerHTML = '<iframe src="https://www.udio.com/embed/' + embedId + '" allow="autoplay" style="width:100%;height:' + udioH + ';border:none;border-radius:8px" playsinline></iframe>';
        embedArea.style.display = 'block';
      } else {
        embedArea.innerHTML = '<a href="' + sanitizeAttr(track.embed_url) + '" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;height:48px;background:var(--surface-2);border-radius:8px;color:#818cf8;text-decoration:none;gap:8px;font-weight:600;font-size:.82rem;"><svg width="18" height="18" viewBox="0 0 24 24" fill="#818cf8"><polygon points="6 3 20 12 6 21 6 3"/></svg>Play on Udio</a>';
        embedArea.style.display = 'block';
      }
    } else {
      // Unknown platform -- open in new tab
      var url = track.embed_url || (track.yt_id ? 'https://www.youtube.com/watch?v=' + track.yt_id : null);
      if (url) window.open(url, '_blank');
      stopTrack();
    }
  }

  function stopTrack() {
    if (activeTrackId === null) return;
    activeTrackId = null;

    // Clean up all playing rows (safety)
    document.querySelectorAll('.track-row.playing').forEach(function (row) {
      row.classList.remove('playing');
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
      }
    });

    // Deactivate player bar
    var playerBar = document.getElementById('playerBar');
    if (playerBar) playerBar.classList.remove('active', 'playing');
    document.body.classList.remove('player-active');
  }

  function locateTrack() {
    if (activeTrackId === null) return;

    // If the track is not visible (filtered out or not loaded yet), expand display
    var row = document.querySelector('.track-row[data-track-id="' + activeTrackId + '"]');
    if (!row) {
      // Check if it is in sortedTracks but beyond displayCount
      var idx = sortedTracks.findIndex(function (t) { return String(t.id) === String(activeTrackId); });
      if (idx >= 0 && idx >= displayCount) {
        displayCount = idx + DISPLAY_CHUNK;
        renderList();
        row = document.querySelector('.track-row[data-track-id="' + activeTrackId + '"]');
      }
    }
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.boxShadow = '0 0 0 2px var(--accent), 0 8px 32px rgba(232,255,71,0.15)';
      setTimeout(function () { row.style.boxShadow = ''; }, 2000);
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // Rating (via Edge Function)
  // ═══════════════════════════════════════════════════════════════════════

  function rateStar(trackId, score, container) {
    container.classList.add('rated');
    container.querySelectorAll('.bstar').forEach(function (s) {
      s.classList.remove('hover-fill');
      s.classList.toggle('filled', parseInt(s.dataset.score) <= score);
      s.classList.remove('ghost');
    });

    var ratings = userRatings();
    ratings[trackId] = score;

    if (typeof gtag === 'function') gtag('event', 'rate', { track_id: trackId, score: score });

    fetch(supabaseUrl() + '/functions/v1/rate-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: trackId, score: score, anon_token: getAnonToken() })
    })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) { showToast(result.data.error || 'Could not rate'); return; }
      var data = result.data;
      var t = findTrackById(trackId);
      if (t) { t.avg_rating = data.avg_rating; t.rating_count = data.rating_count; }
      // Invalidate track cache so other pages see fresh avg/count
      try { sessionStorage.removeItem('vmai_tracks_ts'); } catch (e) { /* ignore */ }
      showToast(score >= 4 ? '\u2b50 ' + score + '/5 \u2014 Great taste!' : '\u2705 Rated ' + score + '/5');
      var row = document.querySelector('.track-row[data-track-id="' + trackId + '"]');
      if (row) {
        var numEl = row.querySelector('.track-rating-num');
        var countEl = row.querySelector('.track-rating-count');
        if (numEl) numEl.textContent = data.avg_rating ? data.avg_rating.toFixed(1) : '\u2014';
        if (countEl) countEl.textContent = '(' + (data.rating_count || 0) + ')';
      }
      container.classList.add('just-rated');
      setTimeout(function () { container.classList.remove('just-rated'); }, 600);
    })
    .catch(function () { showToast('Network error \u2014 try again'); });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // Star hover/click delegation
  // ═══════════════════════════════════════════════════════════════════════

  function onStarMouseOver(e) {
    var star = e.target.closest('.track-stars .bstar');
    if (!star) return;
    var container = star.closest('.track-stars');
    if (container.classList.contains('rated')) return;
    var score = parseInt(star.dataset.score);
    container.querySelectorAll('.bstar').forEach(function (s) {
      s.classList.toggle('hover-fill', parseInt(s.dataset.score) <= score);
      s.classList.remove('ghost');
    });
  }

  function onStarMouseOut(e) {
    var star = e.target.closest('.track-stars .bstar');
    if (!star) return;
    var container = star.closest('.track-stars');
    if (container.classList.contains('rated')) return;
    container.querySelectorAll('.bstar').forEach(function (s) { s.classList.remove('hover-fill'); });
  }

  function onStarClick(e) {
    var star = e.target.closest('.track-stars .bstar');
    if (!star) return;
    var container = star.closest('.track-stars');
    if (container.classList.contains('rated')) return;
    var trackId = star.dataset.track;
    var score = parseInt(star.dataset.score);
    rateStar(trackId, score, container);
  }


  // ═══════════════════════════════════════════════════════════════════════
  // Comments
  // ═══════════════════════════════════════════════════════════════════════

  function toggleComments(trackId, el) {
    var row = el ? el.closest('.track-row') : null;
    var panel = row ? row.querySelector('.comments-panel') : document.getElementById('comments-' + trackId);
    if (!panel) return;
    var wasOpen = panel.classList.contains('open');
    if (_openCommentPanel && _openCommentPanel !== panel) _openCommentPanel.classList.remove('open');
    _openCommentPanel = null;
    if (!wasOpen) {
      panel.classList.add('open');
      _openCommentPanel = panel;
      loadComments(trackId, panel);
    }
  }

  function loadComments(trackId, panel) {
    var contentEl = panel ? panel.querySelector('[id^="cc-"]') : document.getElementById('cc-' + trackId);
    if (!contentEl) return;
    var limit = parseInt(contentEl.dataset.commentLimit || '30', 10);

    fetch(supabaseUrl() + '/rest/v1/comments?track_id=eq.' + trackId + '&select=content,author_name,created_at&order=created_at.desc&limit=' + (limit + 1), {
      headers: { 'apikey': supabaseKey() }
    })
    .then(function (res) { return res.json(); })
    .then(function (c) {
      var hasMore = c.length > limit;
      var visible = hasMore ? c.slice(0, limit) : c;
      contentEl.innerHTML = visible.length
        ? visible.map(function (x) {
            return '<div class="comment"><div class="comment-text">' + sanitize(x.content) + '</div><div class="comment-author">\u2014 ' + sanitize(x.author_name || 'Anonymous') + '</div></div>';
          }).join('')
          + (hasMore ? '<button class="comments-show-more" data-track-id="' + trackId + '" data-new-limit="' + (limit + 30) + '" style="background:none;border:1px solid var(--border);color:var(--muted);padding:6px 14px;border-radius:6px;font-size:0.72rem;cursor:pointer;margin-top:8px;font-family:\'DM Sans\',sans-serif;">Show more</button>' : '')
        : '<p style="font-size:0.8rem;color:var(--muted);">No comments yet</p>';
    })
    .catch(function () { /* silently fail */ });
  }

  function addComment(trackId, el) {
    var row = el ? el.closest('.track-row') : null;
    var input = row ? row.querySelector('.comment-input') : null;
    if (!input) return;
    var c = input.value.trim();
    var user = currentUser();
    if (!c || !user) return;
    var token = localStorage.getItem('sb_token');
    var name = (user.user_metadata && user.user_metadata.name) || (user.email ? user.email.split('@')[0] : 'Anonymous');

    fetch(supabaseUrl() + '/rest/v1/comments', {
      method: 'POST',
      headers: {
        'apikey': supabaseKey(),
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ track_id: trackId, user_id: user.id, content: c, author_name: name })
    })
    .then(function () {
      if (typeof gtag === 'function') gtag('event', 'comment', { track_id: trackId });
      input.value = '';
      var panel = row ? row.querySelector('.comments-panel') : null;
      loadComments(trackId, panel);
    })
    .catch(function () { /* silently fail */ });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // Share Modal
  // ═══════════════════════════════════════════════════════════════════════

  var _shareUrl   = '';
  var _shareTitle = '';

  function initShareModal() {
    var shareOverlay    = document.getElementById('shareOverlay');
    var shareGrid       = document.getElementById('shareGrid');
    var shareLinkInput  = document.getElementById('shareLinkInput');
    var shareLinkCopy   = document.getElementById('shareLinkCopy');
    var shareModalTitle = document.getElementById('shareModalTitle');
    var shareClose      = document.getElementById('shareClose');

    if (!shareOverlay || !shareGrid) return;

    // Build share buttons
    shareGrid.innerHTML = '';
    sharePlatforms.forEach(function (p, i) {
      var btn = document.createElement('button');
      btn.className = 'share-btn';
      btn.dataset.idx = i;
      btn.innerHTML = p.icon + '<span>' + p.name + '</span>';
      shareGrid.appendChild(btn);
    });

    shareGrid.addEventListener('click', function (e) {
      var btn = e.target.closest('.share-btn');
      if (!btn) return;
      var idx = parseInt(btn.dataset.idx);
      var p = sharePlatforms[idx];
      var url = p.share(_shareUrl, _shareTitle);
      if (url) {
        window.open(url, '_blank', 'width=600,height=400');
        if (typeof gtag === 'function') gtag('event', 'share', { method: p.name.toLowerCase() });
      } else {
        try { navigator.clipboard.writeText(_shareUrl); } catch (e) { /* ignore */ }
        showToast('\ud83d\udd17 Link copied!');
        if (typeof gtag === 'function') gtag('event', 'share', { method: 'clipboard' });
      }
      shareOverlay.classList.remove('active');
    });

    if (shareLinkCopy) {
      shareLinkCopy.addEventListener('click', function () {
        try { navigator.clipboard.writeText(_shareUrl); } catch (e) { /* ignore */ }
        shareLinkCopy.textContent = 'Copied!';
        setTimeout(function () { shareLinkCopy.textContent = 'Copy'; }, 2000);
        if (typeof gtag === 'function') gtag('event', 'share', { method: 'copy_link' });
      });
    }

    shareOverlay.addEventListener('click', function (e) {
      if (e.target === shareOverlay) shareOverlay.classList.remove('active');
    });

    if (shareClose) {
      shareClose.addEventListener('click', function () {
        shareOverlay.classList.remove('active');
      });
    }
  }

  function shareTrack(id, title) {
    _shareUrl = window.location.origin + '/?track=' + id;
    _shareTitle = title + ' \u2014 VoteMyAI';
    var shareModalTitle = document.getElementById('shareModalTitle');
    var shareLinkInput  = document.getElementById('shareLinkInput');
    var shareOverlay    = document.getElementById('shareOverlay');
    if (shareModalTitle) shareModalTitle.textContent = title;
    if (shareLinkInput)  shareLinkInput.value = _shareUrl;
    if (shareOverlay)    shareOverlay.classList.add('active');
    if (typeof gtag === 'function') gtag('event', 'share_open', { track_id: id });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // Artist Note Toggle
  // ═══════════════════════════════════════════════════════════════════════

  function onNoteToggleClick(e) {
    var noteToggle = e.target.closest('[data-action="toggle-note"]');
    if (!noteToggle) return;
    var noteText = document.getElementById('note-' + noteToggle.dataset.track);
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
  // "Show more" comments delegation (inline onclick replacement)
  // ═══════════════════════════════════════════════════════════════════════

  function onShowMoreCommentsClick(e) {
    var btn = e.target.closest('.comments-show-more');
    if (!btn) return;
    var trackId = btn.dataset.trackId;
    var newLimit = btn.dataset.newLimit;
    var contentEl = btn.parentElement;
    if (contentEl) contentEl.dataset.commentLimit = newLimit;
    var panel = btn.closest('.comments-panel');
    loadComments(trackId, panel);
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 12. Events
  // ═══════════════════════════════════════════════════════════════════════

  function initEvents() {
    // --- Sort buttons ---
    var sortBtns = document.querySelectorAll('.genre-sort-btn');
    sortBtns.forEach(function (btn) {
      var handler = function () {
        var sort = btn.dataset.sort;
        if (sort === currentSort) return;
        currentSort = sort;
        document.querySelectorAll('.genre-sort-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (typeof gtag === 'function') gtag('event', 'playlist_sort', { sort_mode: sort });
        sortTracks();
        displayCount = DISPLAY_CHUNK;
        renderList();
      };
      btn.addEventListener('click', handler);
      _cleanup.push(function () { btn.removeEventListener('click', handler); });
    });

    // --- Search input with debounce ---
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
        }, 350);
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

    // --- Load more button ---
    var loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
      var onLoadMore = function () {
        displayCount += DISPLAY_CHUNK;
        renderList();
      };
      loadMoreBtn.addEventListener('click', onLoadMore);
      _cleanup.push(function () { loadMoreBtn.removeEventListener('click', onLoadMore); });
    }

    // --- Track list click delegation ---
    var trackList = document.getElementById('trackList');
    if (trackList) {
      var onTrackListClick = function (e) {
        var playBtn = e.target.closest('[data-action="play"]');
        if (playBtn) { e.preventDefault(); e.stopPropagation(); playTrack(playBtn.dataset.trackId); return; }

        var commentsBtn = e.target.closest('[data-action="comments"]');
        if (commentsBtn) { toggleComments(commentsBtn.dataset.track, commentsBtn); return; }

        var shareBtn = e.target.closest('[data-action="share"]');
        if (shareBtn) { shareTrack(shareBtn.dataset.track, shareBtn.dataset.title); return; }

        var postBtn = e.target.closest('[data-action="post-comment"]');
        if (postBtn) { addComment(postBtn.dataset.track, postBtn); return; }
      };
      trackList.addEventListener('click', onTrackListClick);
      _cleanup.push(function () { trackList.removeEventListener('click', onTrackListClick); });
    }

    // --- Player bar locate & close ---
    var btnLocate = document.getElementById('btnLocate');
    if (btnLocate) {
      btnLocate.addEventListener('click', locateTrack);
      _cleanup.push(function () { btnLocate.removeEventListener('click', locateTrack); });
    }

    var btnClose = document.getElementById('btnClose');
    if (btnClose) {
      var onClose = function () { stopTrack(); };
      btnClose.addEventListener('click', onClose);
      _cleanup.push(function () { btnClose.removeEventListener('click', onClose); });
    }

    // --- Genre pill clicks (SPA-style, prevent full reload) ---
    var genrePillsEl = document.getElementById('genrePills');
    if (genrePillsEl) {
      var onGenrePillClick = function (e) {
        var pill = e.target.closest('.genre-pill');
        if (!pill) return;
        e.preventDefault();
        var url = new URL(pill.href, window.location.origin);
        var newSlug = url.searchParams.get('genre') || null;
        if (newSlug === currentGenreSlug) return;
        currentGenreSlug = newSlug;
        currentSubgenre = null;
        window.history.pushState({}, '', pill.href);
        if (typeof gtag === 'function') gtag('event', 'playlist_genre_switch', { genre: currentGenreSlug || 'all' });
        renderGenrePills();
        applyFilters();
      };
      genrePillsEl.addEventListener('click', onGenrePillClick);
      _cleanup.push(function () { genrePillsEl.removeEventListener('click', onGenrePillClick); });
    }

    // --- Subgenre pill clicks ---
    var subPillsEl = document.getElementById('subgenrePills');
    if (subPillsEl) {
      var onSubPillClick = function (e) {
        var pill = e.target.closest('.subgenre-pill');
        if (!pill) return;
        var sub = pill.dataset.sub || null;
        if ((sub || null) === (currentSubgenre || null)) return;
        currentSubgenre = sub || null;
        renderSubgenrePills();
        applyFilters();
        if (typeof gtag === 'function') gtag('event', 'playlist_subgenre', { subgenre: currentSubgenre || 'all' });
      };
      subPillsEl.addEventListener('click', onSubPillClick);
      _cleanup.push(function () { subPillsEl.removeEventListener('click', onSubPillClick); });
    }

    // --- Init arrows + drag-to-scroll for both pill rows ---
    if (genrePillsEl) {
      initArrows(genrePillsEl, document.getElementById('genreArrowL'), document.getElementById('genreArrowR'));
      genrePillsEl.addEventListener('mousedown', onPillDragStart);
      _cleanup.push(function () { genrePillsEl.removeEventListener('mousedown', onPillDragStart); });
    }
    if (subPillsEl) {
      initArrows(subPillsEl, document.getElementById('subArrowL'), document.getElementById('subArrowR'));
      subPillsEl.addEventListener('mousedown', onPillDragStart);
      _cleanup.push(function () { subPillsEl.removeEventListener('mousedown', onPillDragStart); });
    }

    // Global drag listeners (document/window level)
    document.addEventListener('mousemove', onDocMouseMove, { passive: true });
    document.addEventListener('mouseup', onDocMouseUp);
    document.documentElement.addEventListener('mouseleave', onDocMouseLeave);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('dragstart', onDragStart);
    _cleanup.push(function () {
      document.removeEventListener('mousemove', onDocMouseMove);
      document.removeEventListener('mouseup', onDocMouseUp);
      document.documentElement.removeEventListener('mouseleave', onDocMouseLeave);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('dragstart', onDragStart);
    });

    // --- Star hover/click delegation (document level) ---
    document.addEventListener('mouseover', onStarMouseOver);
    document.addEventListener('mouseout', onStarMouseOut);
    document.addEventListener('click', onStarClick);
    _cleanup.push(function () {
      document.removeEventListener('mouseover', onStarMouseOver);
      document.removeEventListener('mouseout', onStarMouseOut);
      document.removeEventListener('click', onStarClick);
    });

    // --- Artist note toggle (document level) ---
    document.addEventListener('click', onNoteToggleClick);
    _cleanup.push(function () { document.removeEventListener('click', onNoteToggleClick); });

    // --- Note auto-close on scroll ---
    window.addEventListener('scroll', onNoteScroll, { passive: true });
    _cleanup.push(function () { window.removeEventListener('scroll', onNoteScroll); });

    // --- Show more comments delegation (document level) ---
    document.addEventListener('click', onShowMoreCommentsClick);
    _cleanup.push(function () { document.removeEventListener('click', onShowMoreCommentsClick); });

    // --- Handle back/forward (genre pill SPA navigation within playlist) ---
    var onPopState = function () {
      var params = new URLSearchParams(window.location.search);
      currentGenreSlug = params.get('genre') || null;
      currentSubgenre = null;
      renderGenrePills();
      applyFilters();
    };
    window.addEventListener('popstate', onPopState);
    _cleanup.push(function () { window.removeEventListener('popstate', onPopState); });

    // --- Share modal init ---
    initShareModal();
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 13. Connect to track loading
  // ═══════════════════════════════════════════════════════════════════════

  function onTracksReady() {
    applyFilters();
  }


  // ═══════════════════════════════════════════════════════════════════════
  // 14. Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  function cleanup() {
    // Stop any playing track before tearing down
    if (activeTrackId !== null) stopTrack();

    // Clear any pending search debounce
    clearTimeout(searchTimeout);

    // Clean up drag state
    cleanupDrag();

    // Close open panels
    if (_openCommentPanel) { _openCommentPanel.classList.remove('open'); _openCommentPanel = null; }
    if (_openNoteEl) { _openNoteEl.classList.remove('open'); _openNoteEl = null; }

    // Run all registered cleanup callbacks (removes event listeners, etc.)
    _cleanup.forEach(function (fn) { fn(); });
    _cleanup = [];
  }


  // ═══════════════════════════════════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════════════════════════════════

  function init() {
    // Parse genre from URL
    var params = new URLSearchParams(window.location.search);
    currentGenreSlug = params.get('genre') || null;

    renderGenrePills();
    showSkeleton();
    initEvents();

    // If tracks are already loaded, apply filters immediately
    if (allTracks().length > 0) {
      applyFilters();
    }

    // Listen for track data events
    document.addEventListener('vma:tracks-loaded', onTracksReady);
    document.addEventListener('vma:tracks-updated', onTracksReady);
    _cleanup.push(function () {
      document.removeEventListener('vma:tracks-loaded', onTracksReady);
      document.removeEventListener('vma:tracks-updated', onTracksReady);
    });

    if (typeof gtag === 'function') {
      gtag('event', 'playlist_view', { genre: currentGenreSlug || 'all' });
    }
  }

  // Register cleanup on VMA and run init
  if (VMA) {
    VMA._pageCleanup = cleanup;
  }
  init();
})();
