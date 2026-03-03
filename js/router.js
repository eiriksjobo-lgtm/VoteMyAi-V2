/**
 * VoteMyAI SPA Router
 *
 * Intercepts same-origin links, fetches content fragments, and injects
 * them into #spa-content while keeping the persistent player bar alive.
 */
window.VMARouter = (function () {
  'use strict';

  const VMA    = window.VMA;
  const Player = window.VMAPlayer;

  // ---------------------------------------------------------------------------
  // Route table
  // ---------------------------------------------------------------------------
  const ROUTES = {
    '/':              { content: '/content/home.html',     js: '/js/home.js',          title: 'VoteMyAI \u2014 Rate the Best AI-Generated Music' },
    '/index.html':    { content: '/content/home.html',     js: '/js/home.js',          title: 'VoteMyAI \u2014 Rate the Best AI-Generated Music' },
    '/playlist.html': { content: '/content/playlist.html', js: '/js/playlist-page.js', title: 'Playlist \u2014 VoteMyAI' },
    '/submit.html':   { content: '/content/submit.html',   js: '/js/submit-page.js',   title: 'Submit a Track \u2014 VoteMyAI' },
    '/login.html':    { content: '/content/login.html',    js: '/js/login-page.js',    title: 'Login \u2014 VoteMyAI' },
    '/about.html':    { content: '/content/about.html',    js: null,                   title: 'About \u2014 VoteMyAI' },
    '/faq.html':      { content: '/content/faq.html',      js: null,                   title: 'FAQ \u2014 VoteMyAI' },
    '/contact.html':  { content: '/content/contact.html',  js: '/js/contact-page.js',  title: 'Contact \u2014 VoteMyAI' },
    '/terms.html':    { content: '/content/terms.html',    js: null,                   title: 'Terms \u2014 VoteMyAI' },
    '/privacy.html':  { content: '/content/privacy.html',  js: null,                   title: 'Privacy \u2014 VoteMyAI' },
    '/profile.html':  { content: '/content/profile.html',  js: '/js/profile-page.js',  title: 'Profile \u2014 VoteMyAI' },
    '/admin.html':    { content: '/content/admin.html',    js: '/js/admin-page.js',    title: 'Admin \u2014 VoteMyAI' },
    '/blog.html':     { content: '/content/blog.html',     js: null,                   title: 'Blog \u2014 VoteMyAI' },
  };

  // ---------------------------------------------------------------------------
  // Content cache
  // ---------------------------------------------------------------------------
  const _cache    = new Map();
  const CACHE_TTL = 120000; // 2 minutes for dynamic pages

  const STATIC_PAGES = new Set([
    '/about.html',
    '/faq.html',
    '/terms.html',
    '/privacy.html',
    '/blog.html',
  ]);

  /**
   * Fetch a content fragment. Returns cached HTML when available and fresh.
   * Static pages are cached indefinitely; dynamic pages expire after CACHE_TTL.
   */
  async function fetchContent(url) {
    const cached = _cache.get(url);
    if (cached) {
      const isStatic = STATIC_PAGES.has(new URL(url, location.origin).pathname);
      if (isStatic || (Date.now() - cached.ts < CACHE_TTL)) {
        return cached.html;
      }
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load page');

    const html = await res.text();
    _cache.set(url, { html, ts: Date.now() });
    return html;
  }

  // ---------------------------------------------------------------------------
  // Page-specific JS loader
  // ---------------------------------------------------------------------------

  /**
   * Load (or re-load) a page-level script. The previous page script is removed
   * first so the new one can re-execute its IIFE / setup logic.
   */
  function loadPageJS(src) {
    return new Promise(function (resolve, reject) {
      // Remove the previous page script if present
      var old = document.getElementById('spa-page-script');
      if (old) old.remove();

      var script    = document.createElement('script');
      script.id     = 'spa-page-script';
      script.src    = src + '?_=' + Date.now(); // cache-bust to force re-execution
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('Failed to load page script: ' + src));
      };
      document.body.appendChild(script);
    });
  }

  // ---------------------------------------------------------------------------
  // Active nav indicator
  // ---------------------------------------------------------------------------
  function updateActiveNav(path) {
    var links = document.querySelectorAll('nav .nav-link, .nav-links-mobile .nav-link');
    links.forEach(function (link) {
      var href = link.getAttribute('href');
      var isActive =
        href === path ||
        (path === '/' && href === '/') ||
        (path === '/index.html' && href === '/');

      if (isActive) {
        link.style.color = 'var(--accent)';
      } else {
        link.style.color = '';
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Mobile nav helper
  // ---------------------------------------------------------------------------
  function closeMobileNav() {
    var mobileNav = document.querySelector('.nav-links-mobile');
    if (mobileNav && mobileNav.classList.contains('open')) {
      mobileNav.classList.remove('open');
    }
    // Also toggle the hamburger if it has an active state
    var hamburger = document.querySelector('.hamburger');
    if (hamburger && hamburger.classList.contains('active')) {
      hamburger.classList.remove('active');
    }
  }

  // ---------------------------------------------------------------------------
  // Link interception helpers
  // ---------------------------------------------------------------------------

  /**
   * Determine whether a click on an <a> element should be intercepted by the
   * SPA router. Returns `true` when we should handle it ourselves.
   */
  function shouldIntercept(link) {
    // Must be same origin
    if (link.origin !== location.origin) return false;

    // target="_blank" — let the browser handle it
    if (link.target === '_blank') return false;

    var pathname = link.pathname;

    // Standalone pages that should NOT be routed
    if (pathname === '/radio.html' || pathname === '/radio') return false;

    // Individual blog posts stay standalone (but /blog.html listing is routed)
    if (pathname.startsWith('/blog/') && pathname.endsWith('.html')) return false;

    // Pure anchor links on the current page (#section)
    if (link.getAttribute('href').charAt(0) === '#') return false;

    // Already on this exact page and no change in search params
    if (pathname === location.pathname && link.search === location.search) {
      // Allow hash navigation on the same page
      if (link.hash) return false;
      return false;
    }

    // Route must exist in the table
    if (!ROUTES[pathname]) return false;

    return true;
  }

  // ---------------------------------------------------------------------------
  // Core navigation
  // ---------------------------------------------------------------------------
  var _currentPath = null;

  /**
   * Navigate to a URL within the SPA.
   *
   * @param {string}  url              — pathname + search (+ optional hash)
   * @param {Object}  [opts]
   * @param {boolean} [opts.pushState=true]  — false for popstate / initial load
   * @param {boolean} [opts.initial=false]   — true on first load
   */
  async function navigate(url, opts) {
    opts = opts || {};
    var pushState = opts.pushState !== false;
    var initial   = opts.initial === true;

    // Parse the URL
    var parsed   = new URL(url, location.origin);
    var pathname = parsed.pathname;
    var search   = parsed.search;
    var hash     = parsed.hash;

    // Look up route
    var route = ROUTES[pathname];
    if (!route) {
      // Unknown route — fall back to full page navigation
      window.location.href = url;
      return;
    }

    // ------------------------------------------------------------------
    // 1. Clean up previous page
    // ------------------------------------------------------------------
    if (VMA && typeof VMA._pageCleanup === 'function') {
      try { VMA._pageCleanup(); } catch (_) { /* ignore */ }
      VMA._pageCleanup = null;
    }

    // ------------------------------------------------------------------
    // 2. Preserve playback across navigation
    // ------------------------------------------------------------------
    if (Player && typeof Player.preserveForNav === 'function') {
      Player.preserveForNav();
    }

    // ------------------------------------------------------------------
    // 3. Fetch content fragment
    // ------------------------------------------------------------------
    var contentUrl = route.content + search; // pass query string through

    try {
      var html = await fetchContent(contentUrl);
    } catch (err) {
      console.error('[VMARouter] Content fetch failed:', err);
      // Fallback: full page load
      window.location.href = url;
      return;
    }

    // ------------------------------------------------------------------
    // 4. Inject content
    // ------------------------------------------------------------------
    var container = document.getElementById('spa-content');
    if (!container) {
      console.error('[VMARouter] #spa-content container not found');
      window.location.href = url;
      return;
    }

    container.innerHTML = html;
    _currentPath = pathname;

    // ------------------------------------------------------------------
    // 5. Load page-specific JS (if any)
    // ------------------------------------------------------------------
    if (route.js) {
      try {
        await loadPageJS(route.js);
      } catch (err) {
        console.error('[VMARouter] Page JS load failed:', err);
      }
    }

    // ------------------------------------------------------------------
    // 6. Restore playback
    // ------------------------------------------------------------------
    if (Player && typeof Player.restoreAfterNav === 'function') {
      Player.restoreAfterNav();
    }

    // ------------------------------------------------------------------
    // 7. Push history state
    // ------------------------------------------------------------------
    if (pushState) {
      history.pushState({ path: pathname + search + hash }, '', pathname + search + hash);
    }

    // ------------------------------------------------------------------
    // 8. Update document title
    // ------------------------------------------------------------------
    document.title = route.title;

    // ------------------------------------------------------------------
    // 9. Update active nav link
    // ------------------------------------------------------------------
    updateActiveNav(pathname);

    // ------------------------------------------------------------------
    // 10. Scroll handling
    // ------------------------------------------------------------------
    if (hash) {
      // Give the DOM a tick to settle, then scroll to the anchor
      requestAnimationFrame(function () {
        var target = document.getElementById(hash.slice(1));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    } else if (!initial) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    // ------------------------------------------------------------------
    // 11. GA4 pageview
    // ------------------------------------------------------------------
    if (typeof gtag === 'function') {
      gtag('event', 'page_view', { page_path: pathname + search });
    }

    // ------------------------------------------------------------------
    // 12. Close mobile nav if open
    // ------------------------------------------------------------------
    closeMobileNav();
  }

  // ---------------------------------------------------------------------------
  // popstate — browser back/forward
  // ---------------------------------------------------------------------------
  window.addEventListener('popstate', function () {
    navigate(window.location.pathname + window.location.search + window.location.hash, {
      pushState: false,
    });
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  function init() {
    // Global click interception (capturing phase)
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href]');
      if (!link) return;

      if (shouldIntercept(link)) {
        e.preventDefault();
        navigate(link.pathname + link.search + link.hash);
      }
    }, true);

    // Load the initial page based on the current URL
    var path   = window.location.pathname;
    var search = window.location.search;
    var hash   = window.location.hash;

    navigate(path + search + hash, { pushState: false, initial: true });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    init:     init,
    navigate: navigate,
  };
})();
