# VoteMyAI

AI Music Voting Platform - Submit your AI-generated tracks. The community votes. The best rise to the top.

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Domain:** votemyai.com

## Features

- 🎵 Submit AI-generated music tracks
- 🗳️ Community voting system
- 🔥 Trending tracks leaderboard
- 🎨 Clean, modern UI
- ⚡ Fast and lightweight

## Local Development

1. Clone the repo
2. Open `index.html` in your browser
3. That's it! No build step required.

## Database Schema

```sql
CREATE TABLE tracks (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  yt_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  genre TEXT NOT NULL,
  votes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Contributing

This is a personal project, but suggestions are welcome!

## License

MIT
