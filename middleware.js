// ═══════════════════════════════════════════════════════════════
// VoteMyAI — Edge Middleware for Dynamic OG Tags (no Next.js)
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://gezijezmsecbtzytotax.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hOOMtCz7gYsu_-CVD6lW9Q_SxtFlNhw';

const BOT_PATTERNS = [
  'facebookexternalhit', 'facebot', 'twitterbot', 'linkedinbot',
  'whatsapp', 'slackbot', 'discordbot', 'telegrambot',
  'googlebot', 'bingbot', 'embedly', 'iframely',
  'vkshare', 'pinterestbot', 'applebot', 'curl',
];

export default async function middleware(request) {
  const url = new URL(request.url);

  // Only intercept requests to / with ?track= parameter
  if (url.pathname !== '/' || !url.searchParams.has('track')) {
    return;
  }

  const trackId = url.searchParams.get('track');
  if (!trackId) return;

  // Check if this is a bot/crawler
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  const isBot = BOT_PATTERNS.some(bot => ua.includes(bot));
  if (!isBot) return;

  // Fetch track data from Supabase
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
    if (data && data.length > 0) track = data[0];
  } catch (e) {
    return;
  }

  if (!track) return;

  // Build OG metadata
  const title = `${track.title} — VoteMyAI`;
  const description = `Made with ${track.tool}${track.genre ? ' · ' + track.genre : ''}${track.avg_rating ? ' · ' + track.avg_rating.toFixed(1) + '★' : ''}. Listen and rate on VoteMyAI.`;

  let image = 'https://www.votemyai.com/og-image.png';
  if (track.thumbnail_url) {
    image = track.thumbnail_url;
  } else if (track.embed_url && track.embed_url.includes('suno.com')) {
    const sunoMatch = track.embed_url.match(/suno\.com\/(?:song|embed)\/([a-f0-9-]{36})/);
    if (sunoMatch) image = `https://cdn2.suno.ai/image_${sunoMatch[1]}.jpeg`;
  }

  const pageUrl = `https://www.votemyai.com/?track=${trackId}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <meta property="og:type" content="music.song">
  <meta property="og:url" content="${esc(pageUrl)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:site_name" content="VoteMyAI">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(image)}">
</head>
<body>
  <p>Loading <a href="${esc(pageUrl)}">${esc(title)}</a>...</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
