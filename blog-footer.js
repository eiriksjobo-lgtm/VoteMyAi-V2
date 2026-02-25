/* blog-footer.js — Auto-injects share buttons + related posts
   Usage: Add <script src="/blog-footer.js"></script> before </body> in each blog post */

(function(){
  const posts = [
    { url:'/blog/state-of-ai-music-2026.html', emoji:'🌐', tag:'Industry', title:'The State of AI Music in 2026' },
    { url:'/blog/suno-v5-vs-v4-5.html', emoji:'🆚', tag:'Review', title:'Suno v5 vs v4.5 — What Changed?' },
    { url:'/blog/what-makes-a-top-rated-ai-song.html', emoji:'⭐', tag:'Creator Guide', title:'What Makes a Top-Rated AI Song?' },
    { url:'/blog/can-ai-music-win-a-grammy.html', emoji:'🏆', tag:'Industry', title:'Can AI Music Win a Grammy?' },
    { url:'/blog/ai-music-copyright-ownership-2026.html', emoji:'⚖️', tag:'Legal Guide', title:'AI Music Copyright & Ownership 2026' },
    { url:'/blog/suno-vs-udio-vs-elevenlabs.html', emoji:'🎵', tag:'Comparison', title:'Suno vs Udio vs ElevenLabs' },
    { url:'/blog/how-to-make-ai-music.html', emoji:'🚀', tag:'Guide', title:'How to Make AI Music — Beginner\'s Guide' },
    { url:'/blog/best-free-ai-music-generators.html', emoji:'🆓', tag:'Roundup', title:'5 Best Free AI Music Generators' },
    { url:'/blog/ai-music-prompt-tips.html', emoji:'✍️', tag:'Tips', title:'10 Tips for Better AI Music Prompts' },
    { url:'/blog/what-is-ai-music.html', emoji:'🤖', tag:'Explainer', title:'What is AI-Generated Music?' }
  ];

  const related = {
    '/blog/state-of-ai-music-2026.html': [1,3,4],
    '/blog/suno-v5-vs-v4-5.html': [5,8,0],
    '/blog/what-makes-a-top-rated-ai-song.html': [8,5,6],
    '/blog/can-ai-music-win-a-grammy.html': [4,0,2],
    '/blog/ai-music-copyright-ownership-2026.html': [3,0,7],
    '/blog/suno-vs-udio-vs-elevenlabs.html': [1,7,6],
    '/blog/how-to-make-ai-music.html': [8,5,9],
    '/blog/best-free-ai-music-generators.html': [5,6,8],
    '/blog/ai-music-prompt-tips.html': [6,2,5],
    '/blog/what-is-ai-music.html': [6,4,5]
  };

  var path = window.location.pathname;
  var current = posts.find(function(p){ return path.endsWith(p.url) || path.endsWith(p.url.replace('/blog/','')); });
  if(!current) return;

  var ids = related[current.url];
  if(!ids) return;

  var pageUrl = encodeURIComponent(window.location.href);
  var pageTitle = encodeURIComponent(document.title);

  /* Inject CSS */
  var style = document.createElement('style');
  style.textContent = '\
.bf-share{margin:48px 0 0;padding:32px 0 0;border-top:1px solid var(--border)}\
.bf-label{font-family:"Bebas Neue",sans-serif;font-size:1.1rem;letter-spacing:1.5px;color:var(--muted);margin-bottom:16px}\
.bf-buttons{display:flex;gap:10px;flex-wrap:wrap}\
.bf-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;font-size:.82rem;font-weight:600;text-decoration:none;transition:transform .2s,box-shadow .2s;border:1px solid var(--border);color:var(--text-secondary);background:var(--surface);cursor:pointer;font-family:inherit}\
.bf-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.3);color:var(--text)}\
.bf-btn.x{border-color:#1d9bf0;color:#1d9bf0}.bf-btn.x:hover{background:rgba(29,155,240,0.1)}\
.bf-btn.reddit{border-color:#ff4500;color:#ff4500}.bf-btn.reddit:hover{background:rgba(255,69,0,0.1)}\
.bf-btn.copy{border-color:var(--accent);color:var(--accent)}.bf-btn.copy:hover{background:var(--accent-dim)}\
.bf-related{margin:48px 0 0}\
.bf-rlabel{font-family:"Bebas Neue",sans-serif;font-size:1.3rem;letter-spacing:1.5px;color:var(--text);margin-bottom:20px}\
.bf-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}\
.bf-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;text-decoration:none;color:inherit;transition:transform .2s,border-color .2s,box-shadow .2s;display:flex;flex-direction:column}\
.bf-card:hover{transform:translateY(-3px);border-color:#2a2a3e;box-shadow:0 8px 24px rgba(0,0,0,0.3)}\
.bf-card .bf-em{font-size:1.8rem;margin-bottom:10px}\
.bf-card .bf-tg{font-size:.65rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent);margin-bottom:6px}\
.bf-card .bf-tt{font-size:.88rem;font-weight:700;line-height:1.4;color:var(--text)}\
.bf-card:hover .bf-tt{color:var(--accent)}\
@media(max-width:768px){.bf-grid{grid-template-columns:1fr}}\
';
  document.head.appendChild(style);

  /* Build HTML */
  var html = '\
<div class="bf-share">\
  <div class="bf-label">SHARE THIS ARTICLE</div>\
  <div class="bf-buttons">\
    <a class="bf-btn x" href="https://twitter.com/intent/tweet?url='+pageUrl+'&text='+pageTitle+'" target="_blank" rel="noopener">\ud835\udd4f Post</a>\
    <a class="bf-btn reddit" href="https://reddit.com/submit?url='+pageUrl+'&title='+pageTitle+'" target="_blank" rel="noopener">\u2b06 Reddit</a>\
    <button class="bf-btn copy" id="bfCopy">\ud83d\udccb Copy link</button>\
  </div>\
</div>\
<div class="bf-related">\
  <div class="bf-rlabel">KEEP READING</div>\
  <div class="bf-grid">';

  ids.forEach(function(i){
    var p = posts[i];
    html += '\
    <a href="'+p.url+'" class="bf-card">\
      <div class="bf-em">'+p.emoji+'</div>\
      <div class="bf-tg">'+p.tag+'</div>\
      <div class="bf-tt">'+p.title+'</div>\
    </a>';
  });

  html += '</div></div>';

  /* Inject into page — after cta-box or at end of article-content */
  var target = document.querySelector('.cta-box');
  if(target && target.parentNode){
    target.insertAdjacentHTML('afterend', html);
  } else {
    var content = document.querySelector('.article-content');
    if(content) content.insertAdjacentHTML('beforeend', html);
  }

  /* Copy link handler */
  var copyBtn = document.getElementById('bfCopy');
  if(copyBtn){
    copyBtn.addEventListener('click', function(){
      navigator.clipboard.writeText(window.location.href).then(function(){
        copyBtn.textContent = '\u2713 Copied!';
        setTimeout(function(){ copyBtn.textContent = '\ud83d\udccb Copy link'; }, 2000);
      });
    });
  }
})();
