# Alex & Claire's Wedding

Elegant, mobile-first wedding website built with Next.js and Tailwind CSS. The site mirrors the calm, refined tone of the Squarespace Soria demo while remaining lightweight and self-hostable. RSVP submissions are written to a local SQLite database using a secure API route.

## Prerequisites

- Node.js 18.x (required for native `better-sqlite3` bindings)
- npm 9+
- SQLite3 CLI (optional, for inspecting the database)

## Getting Started

```bash
npm install
npm run migrate
npm run dev
```

- Development server: http://localhost:3000
- Content lives in `pages/index.jsx` via static props.

## Database & Migrations

The RSVP API persists to `./data/rsvps.db`.

- Apply migrations locally: `npm run migrate`
- Migration files reside in `data/migrations`.
- The API automatically ensures migrations are applied on first write.

To inspect RSVP data:

```bash
sqlite3 data/rsvps.db "SELECT * FROM rsvps ORDER BY created_at DESC;"
```

## Testing the API Quickly

```bash
curl -X POST http://localhost:3000/api/rsvp \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "attending": "Yes",
    "numGuests": 2,
    "mealPreference": "Vegetarian",
    "message": "Looking forward to it!"
  }'
```

Successful submissions return HTTP 201 with `{ ok: true, message: "RSVP recorded" }`.

## Production Build

```bash
npm run build
npm run start
```

- The build output supports `next export` (`npm run export`) for static hosting of the marketing site.
- To keep the RSVP API active in production, run `npm run start` (serves the site and API together).

## Docker Deployment

The provided multi-stage Dockerfile builds and runs the app on port 80.

```bash
docker build -t czarnickwedding:latest .
docker run -d -p 80:80 -v $(pwd)/data:/app/data --name czarnickwedding czarnickwedding:latest
```

Or use docker-compose:

```bash
docker-compose up --build -d
```

### Container Notes

- `/app/data` is declared as a volume. Bind mount it to persist `rsvps.db`.
- Supply `NODE_ENV=production` (already defaulted in compose file).

## Static Asset Generation

- Favicon (`public/favicon.ico`) and Apple touch icon (`public/apple-touch-icon.png`) are procedurally generated ring glyphs aligned with the brand palette.
- Remote images are served from Unsplash and optimized via `next/image`.

## Deployment Checklist

1. Run `npm run migrate` once in the target environment.
2. Back up `data/rsvps.db` regularly.
3. Behind nginx, proxy `czarnickwedding.com` to the container (`proxy_pass http://localhost:3000;` or expose port 80 directly).
4. Ensure HTTPS termination via your load balancer / reverse proxy.

## Static Export (Optional)

```
npm run export
```

- Outputs the statically rendered site to `/out` (marketing pages only).
- Pair the static assets with a lightweight Node or serverless function hosting `/api/rsvp` to retain RSVP functionality.

## Accessibility & Performance Highlights

- Anchored navigation with keyboard-friendly mobile toggle.
- High-contrast palette meeting WCAG AA.
- Responsive hero imagery with blur-up placeholders and lazy-loaded gallery.

## Maintenance

- Periodically prune rate-limit in-memory cache if the API process is long-running (process restart will reset it).
- Avoid logging RSVP payload contents in production; only minimal error logs are emitted.
