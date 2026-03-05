const https = require('https');

const SUPABASE_URL = 'https://gezijezmsecbtzytotax.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  const trackId = req.query.id;

  if (!trackId || !UUID_RE.test(trackId)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('<html><head><script>window.location.replace("https://www.votemyai.com/")</script></head></html>');
  }

  const shareUrl = 'https://www.votemyai.com/share/' + trackId;
  const pageUrl = 'https://www.votemyai.com/?track=' + trackId;

  let title = 'VoteMyAI — Rate the Best AI-Generated Music';
  let desc = 'Listen and rate AI-generated music on VoteMyAI.';
  let image = 'https://www.votemyai.com/og-image.png';

  try {
    const data = await fetchJSON(
      SUPABASE_URL + '/rest/v1/tracks?id=eq.' + trackId + '&select=id,title,tool,genre,thumbnail_url,embed_url,avg_rating,rating_count'
    );
    if (data && data.length > 0) {
      const track = data[0];
      title = track.title + ' — VoteMyAI';
      desc = 'Made with ' + (track.tool || 'AI') +
        (track.genre ? ' · ' + track.genre : '') +
        (track.avg_rating ? ' · ' + track.avg_rating.toFixed(1) + '★' : '') +
        '. Listen and rate on VoteMyAI.';

      if (track.thumbnail_url) {
        image = track.thumbnail_url;
      } else if (track.embed_url && track.embed_url.includes('suno.com')) {
        const m = track.embed_url.match(/suno\.com\/(?:song|embed)\/([a-f0-9-]{36})/);
        if (m) image = 'https://cdn2.suno.ai/image_' + m[1] + '.jpeg';
      }
    }
  } catch (e) {}

  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta property="og:type" content="music.song">\n' +
    '<meta property="og:url" content="' + esc(shareUrl) + '">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n' +
    '<meta property="og:description" content="' + esc(desc) + '">\n' +
    '<meta property="og:image" content="' + esc(image) + '">\n' +
    '<meta property="og:image:width" content="1200">\n' +
    '<meta property="og:image:height" content="630">\n' +
    '<meta property="og:site_name" content="VoteMyAI">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + esc(title) + '">\n' +
    '<meta name="twitter:description" content="' + esc(desc) + '">\n' +
    '<meta name="twitter:image" content="' + esc(image) + '">\n' +
    '<script>window.location.replace("' + pageUrl + '");<\/script>\n' +
    '</head>\n<body>\n' +
    '<p>Loading <a href="' + esc(pageUrl) + '">' + esc(title) + '</a>...</p>\n' +
    '</body>\n</html>';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return res.status(200).send(html);
};

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      }
    };
    https.get(url, options, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}
