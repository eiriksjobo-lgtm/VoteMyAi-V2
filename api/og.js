// ═══════════════════════════════════════════════════════════════
// VoteMyAI — Dynamic OG Tags for Track Deep Links
// ═══════════════════════════════════════════════════════════════
//
// WHAT THIS DOES:
// When someone shares a link like votemyai.com/?track=849d9236-...
// on Messenger, Discord, iMessage etc., those platforms send a
// "crawler" to fetch the page and read the og:title, og:image etc.
// 
// Problem: Our site is a static HTML file. The OG tags are hardcoded
// to the generic "VoteMyAI — Rate the Best AI-Generated Music".
// JavaScript can't help because crawlers don't run JavaScript.
//
// Solution: This edge function intercepts requests with ?track=ID,
// fetches the track info from Supabase, and returns a small HTML
// page with the correct OG tags for that specific track.
// Regular users (not crawlers) get redirected to the real page.
//
// HOW IT WORKS:
// 1. Vercel routes /?track=xxx to this function (see vercel.json)
// 2. Function extracts the track ID from the URL
// 3. Fetches track data from Supabase REST API
// 4. Returns HTML with dynamic og:title, og:image, og:description
// 5. Includes a <meta refresh> + JavaScript redirect so real users
//    land on the actual page immediately
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://gezijezmsecbtzytotax.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hOOMtCz7gYsu_-CVD6lW9Q_SxtFlNhw';

export const config = {
  runtime: 'edge',  // Runs on Vercel's edge network — fast globally
};

export default async function handler(request) {
  const url = new URL(request.url);
  const trackId = url.searchParams.get('track');

  // If no track ID, just redirect to homepage
  if (!trackId) {
    return Response.redirect('https://www.votemyai.com/', 302);
  }

  // ─── Fetch track data from Supabase ───
  let track = null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tracks?id=eq.${trackId}&select=id,title,tool,genre,thumbnail_url,embed_url,avg_rating,rating_count`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      track = data[0];
    }
  } catch (e) {
    // If fetch fails, fall through to default OG tags
  }

  // ─── Build OG metadata ───
  // If we found the track, use its info. Otherwise, use defaults.
  const title = track
    ? `${track.title} — VoteMyAI`
    : 'VoteMyAI — Rate the Best AI-Generated Music';

  const description = track
    ? `Made with ${track.tool}${track.genre ? ' · ' + track.genre : ''}${track.avg_rating ? ' · ' + track.avg_rating.toFixed(1) + '★' : ''}. Listen and rate on VoteMyAI.`
    : 'Discover and rate AI music made with Suno, Udio and more.';

  // Thumbnail logic: try track thumbnail, then Suno CDN, then default
  let image = 'https://www.votemyai.com/og-image.png';
  if (track) {
    if (track.thumbnail_url) {
      image = track.thumbnail_url;
    } else if (track.embed_url && track.embed_url.includes('suno.com')) {
      // Extract Suno UUID and build CDN image URL
      const sunoMatch = track.embed_url.match(/suno\.com\/(?:song|embed)\/([a-f0-9-]{36})/);
      if (sunoMatch) {
        image = `https://cdn2.suno.ai/image_${sunoMatch[1]}.jpeg`;
      }
    }
  }

  // The actual page URL where we want users to end up
  const pageUrl = `https://www.votemyai.com/?track=${trackId}`;

  // ─── Return HTML with OG tags ───
  // This HTML does two things:
  // 1. For crawlers: provides the OG meta tags they need
  // 2. For real users: redirects instantly to the actual page
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>

  <!-- OG tags for social media previews -->
  <meta property="og:type" content="music.song">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:site_name" content="VoteMyAI">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">

  <!-- Redirect real users to the actual page immediately -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(pageUrl)}">
  <script>window.location.replace("${pageUrl}");</script>
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(pageUrl)}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Cache for 1 hour — so we don't hit Supabase on every crawler request
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

// Simple HTML escaping to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
