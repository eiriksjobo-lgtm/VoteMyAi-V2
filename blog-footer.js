/* blog-footer.js — Auto-injects share buttons + related posts
   Reads blog.html automatically — never needs manual updating.
   Usage: Add <script src="/blog-footer.js"></script> before </body> in each blog post */

(function(){
  /* Inject CSS immediately */
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

  /* Inject share buttons immediately (no fetch needed) */
  var pageUrl = encodeURIComponent(window.location.href);
  var pageTitle = encodeURIComponent(document.title);

  var shareHtml = '\
<div class="bf-share">\
  <div class="bf-label">SHARE THIS ARTICLE</div>\
  <div class="bf-buttons">\
    <a class="bf-btn x" href="https://twitter.com/intent/tweet?url='+pageUrl+'&text='+pageTitle+'" target="_blank" rel="noopener">\ud835\udd4f Post</a>\
    <a class="bf-btn reddit" href="https://reddit.com/submit?url='+pageUrl+'&title='+pageTitle+'" target="_blank" rel="noopener">\u2b06 Reddit</a>\
    <button class="bf-btn copy" id="bfCopy">\ud83d\udccb Copy link</button>\
  </div>\
</div>\
<div class="bf-related" id="bfRelated"></div>';

  var target = document.querySelector('.cta-box');
  if(target && target.parentNode){
    target.insertAdjacentHTML('afterend', shareHtml);
  } else {
    var content = document.querySelector('.article-content');
    if(content) content.insertAdjacentHTML('beforeend', shareHtml);
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

  /* Fetch blog.html and parse all posts */
  fetch('/blog.html')
    .then(function(r){ return r.text(); })
    .then(function(html){
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');
      var cards = doc.querySelectorAll('.blog-card');
      var posts = [];
      var currentPath = window.location.pathname;

      cards.forEach(function(card){
        var link = card.querySelector('a');
        var tagEl = card.querySelector('.blog-card-tag');
        var titleEl = card.querySelector('.blog-card-title');
        var imgEl = card.querySelector('.blog-card-img');
        if(!link || !titleEl) return;

        var href = link.getAttribute('href');
        posts.push({
          url: href,
          tag: tagEl ? tagEl.textContent.trim() : '',
          title: titleEl.textContent.trim(),
          emoji: imgEl ? imgEl.textContent.trim() : '📄'
        });
      });

      /* Find current post */
      var current = null;
      var currentIndex = -1;
      posts.forEach(function(p, i){
        if(currentPath.endsWith(p.url) || currentPath.endsWith(p.url.replace('/blog/',''))){
          current = p;
          currentIndex = i;
        }
      });

      if(!current || posts.length < 2) return;

      /* Pick 3 related posts: prioritize same tag, then nearest in list */
      var others = [];
      posts.forEach(function(p, i){
        if(i === currentIndex) return;
        others.push({
          post: p,
          score: (p.tag.toLowerCase() === current.tag.toLowerCase()) ? 10 : 0,
          dist: Math.abs(i - currentIndex)
        });
      });

      /* Sort: same tag first, then closest in list order */
      others.sort(function(a, b){
        if(b.score !== a.score) return b.score - a.score;
        return a.dist - b.dist;
      });

      var picked = others.slice(0, 3);

      /* Render related posts */
      var container = document.getElementById('bfRelated');
      if(!container || picked.length === 0) return;

      var relHtml = '<div class="bf-rlabel">KEEP READING</div><div class="bf-grid">';
      picked.forEach(function(item){
        var p = item.post;
        relHtml += '\
        <a href="'+p.url+'" class="bf-card">\
          <div class="bf-em">'+p.emoji+'</div>\
          <div class="bf-tg">'+p.tag+'</div>\
          <div class="bf-tt">'+p.title+'</div>\
        </a>';
      });
      relHtml += '</div>';
      container.innerHTML = relHtml;
    })
    .catch(function(e){
      /* Silent fail — share buttons still work */
    });
})();
