// ═══════════════════════════════════════════════════════════════
// VoteMyAI — Middleware for Dynamic OG Tags
// ═══════════════════════════════════════════════════════════════
// This middleware runs BEFORE any other routing.
// It checks if the request has ?track=ID and if the visitor
// is a crawler (bot). If so, it fetches track data and returns
// HTML with the correct OG tags. Otherwise, it passes through.

import { NextResponse } from 'next/server';

const SUPABASE_URL = 'https://gezijezmsecbtzytotax.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hOOMtCz7gYsu_-CVD6lW9Q_SxtFlNhw';

// Common social media and search engine crawlers
const BOT_PATTERNS = [
  'facebookexternalhit', 'Facebot', 'Twitterbot', 'LinkedInBot',
  'WhatsApp', 'Slackbot', 'Discordbot', 'TelegramBot',
  'Googlebot', 'bingbot', 'Embedly', 'Iframely',
  'vkShare', 'Pinterestbot', 'Applebot',
  'curl', // for testing
];

export const config = {
  matcher: '/',
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const trackId = url.searchParams.get('track');

  // Only intercept if ?track= is present
  if (!trackId) {
    return NextResponse.next();
  }

  // Check if this is a bot/crawler
  const ua = request.headers.get('user-agent') || '';
  const isBot = BOT_PATTERNS.some(bot => ua.toLowerCase().includes(bot.toLowerCase()));

  // If not a bot, let the request pass through to index.html
  if (!isBot) {
    return NextResponse.next();
  }

  // ─── Bot detected with ?track= → return dynamic OG tags ───
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
    // If fetch fails, pass through
    return NextResponse.next();
  }

  if (!track) {
    return NextResponse.next();
  }

  // Build metadata
  const title = `${track.title} — VoteMyAI`;
  const description = `Made with ${track.tool}${track.genre ? ' · ' + track.genre : ''}${track.avg_rating ? ' · ' + track.avg_rating.toFixed(1) + '★' : ''}. Listen and rate on VoteMyAI.`;

  let image = 'https://www.votemyai.com/og-image.png';
  if (track.thumbnail_url) {
    image = track.thumbnail_url;
  } else if (track.embed_url && track.embed_url.includes('suno.com')) {
    const sunoMatch = track.embed_url.match(/suno\.com\/(?:song|embed)\/([a-f0-9-]{36})/);
    if (sunoMatch) {
      image = `https://cdn2.suno.ai/image_${sunoMatch[1]}.jpeg`;
    }
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

  return new NextResponse(html, {
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
