#!/bin/bash
# Fix horizontal scroll on all blog posts for mobile/tablet
# Run from the root of your GitHub repo
# Usage: bash fix-blog-mobile-scroll.sh

BLOG_DIR="blog"

if [ ! -d "$BLOG_DIR" ]; then
  echo "Error: blog/ directory not found. Run this from your repo root."
  exit 1
fi

count=0

for file in "$BLOG_DIR"/*.html; do
  [ -f "$file" ] || continue
  
  echo "Processing: $file"
  
  # 1. Add overflow-x:hidden to html,body (after the * reset rule)
  # Only if not already present
  if ! grep -q 'overflow-x:hidden\|overflow-x: hidden' "$file"; then
    # Insert html,body{overflow-x:hidden} after the *{...} reset line
    sed -i 's/\*{margin:0;padding:0;box-sizing:border-box}/\*{margin:0;padding:0;box-sizing:border-box}\n    html,body{overflow-x:hidden}/' "$file"
    # Also handle spaced version
    sed -i 's/\* { margin: 0; padding: 0; box-sizing: border-box; }/\* { margin: 0; padding: 0; box-sizing: border-box; }\n    html, body { overflow-x: hidden; }/' "$file"
  fi
  
  # 2. Add max-width:100% to images/iframes/videos in article content
  # Only if not already present
  if ! grep -q 'article-content img.*max-width' "$file"; then
    # Insert before the closing </style> tag
    sed -i 's|</style>|    .article-content img,.article-content iframe,.article-content video,.article-content embed{max-width:100%;height:auto}\n  </style>|' "$file"
  fi
  
  # 3. Wrap any bare <table class="compare-table"> in a scrollable div
  # Only if not already wrapped in table-wrap
  if grep -q '<table class="compare-table">' "$file" && ! grep -q 'class="table-wrap"' "$file"; then
    sed -i 's|<table class="compare-table">|<div class="table-wrap"><table class="compare-table">|' "$file"
    sed -i 's|</table>|</table></div>|' "$file"
    
    # Add .table-wrap CSS if not present
    if ! grep -q 'table-wrap' "$file"; then
      sed -i 's|.compare-table{|.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:28px 0}\n    .compare-table{min-width:520px;|' "$file"
      # Remove duplicate margin from compare-table since table-wrap handles it
      sed -i 's|.compare-table{min-width:520px;width:100%;border-collapse:collapse;margin:28px 0|.compare-table{min-width:520px;width:100%;border-collapse:collapse|' "$file"
    fi
  fi
  
  # 4. Fix nav padding on mobile if missing
  if ! grep -q 'max-width:768px.*nav.*padding:0 16px' "$file" && ! grep -q 'max-width: 768px' "$file"; then
    # Check if there's already a media query - if not, add one before </style>
    if ! grep -q '@media' "$file"; then
      sed -i 's|</style>|    @media(max-width:768px){nav{padding:0 16px}.nav-links{gap:14px}.article-header{padding:60px 16px 32px}.article-content{padding:0 16px 60px}}\n  </style>|' "$file"
    fi
  fi
  
  count=$((count + 1))
done

echo ""
echo "Done! Fixed $count blog posts."
echo "Changes made:"
echo "  1. Added overflow-x:hidden on html,body"
echo "  2. Added max-width:100% on images/iframes/videos" 
echo "  3. Wrapped compare tables in scrollable div"
echo "  4. Checked mobile media queries"
echo ""
echo "Test on mobile before pushing to GitHub!"
