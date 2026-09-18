# BookHaven

Online bookstore with a static HTML/CSS/JS storefront and a Node.js (Express)
backend. All 5,720 books are seeded automatically on first boot.

## Tech stack

- **Backend:** Node.js + Express (`server.js`), database layer in `db.js`
- **Database:** local SQLite (`books.db`, dev default) **or** Supabase
  (PostgreSQL) when `DATABASE_URL` is set — the app auto-detects either
- **Frontend:** vanilla HTML/CSS/JS pages in the project root (served for a
  static-host fallback, e.g. GitHub Pages, which is why pages live at root)
- **Auth:** email+password (scrypt) + optional Google / Facebook / Twitter
  (OAuth 2.0) sign-in
- **Email:** contact-form forwarding via SMTP (Gmail App Password), optional

## Quick start

```
npm install
npm start
```

Open http://localhost:3000. On first boot the catalogue (5,720 books) and the
admin account (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) are created automatically.
The admin panel is hidden at http://localhost:3000/admin (footer logo link).

## Configuration

Copy `.env.example` to `.env` and fill in the secrets you need. Key options:

| Variable | Purpose |
| --- | --- |
| `PORT` | Server port (default 3000) |
| `NODE_ENV` | `production` refuses to start without admin secrets |
| `SITE_URL` | Public URL, shown in frontend error banners |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Admin account (required in production) |
| `DATABASE_URL` | Set to your Supabase connection string to use Postgres |
| `SMTP_USER` / `SMTP_PASS` | Enables contact-message email forwarding |
| `CONTACT_RECIPIENT` | Where contact messages are emailed (default `Bookhaven41@gmail.com`) |
| `GOOGLE_*` / `FACEBOOK_*` / `TWITTER_*` | Social sign-in credentials (blank = hidden) |

### Using Supabase (recommended for the live site)

1. Create a project at https://supabase.com.
2. **SQL Editor → New query → paste `supabase/schema.sql` → Run.** (Creates
   `books`, `users`, `sessions`, `orders`, `contact_messages`.)
3. Copy the connection string (Project Settings → Database → Session pooler)
   into `DATABASE_URL`.
4. Start the server — it seeds the catalogue and admin into Supabase on first
   boot. Without `DATABASE_URL`, the local SQLite file is used instead.

## Deployment

- **`render.yaml`** — Render blueprint (Node service + persistent disk for
  uploads). Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, optionally `DATABASE_URL`,
  SMTP and OAuth secrets in *Settings → Environment*.
- **GitHub Pages** — the static storefront has a built-in fallback
  (`js/bookhaven-static-data.js`) so the catalog renders without a backend,
  but dynamic features (orders, contact, auth) need the Node server.

## Project structure

```
BookHaven/
├── server.js            # Express app + REST API
├── db.js                # SQLite ⇄ Postgres adapter (uses DATABASE_URL)
├── package.json
├── render.yaml          # Render.com deploy blueprint
├── supabase/
│   └── schema.sql       # Paste this into the Supabase SQL Editor
├── docs/
│   └── project.md       # Original project spec
├── scripts/             # Seed data + maintenance tools
├── logs/                # Server logs (gitignored)
├── *.html               # Storefront pages (kept at root for static hosting)
├── css/  js/  assets/   # Storefront styles, scripts, images
└── uploads/             # Admin-uploaded cover images (gitignored)
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/books` | List all books |
| GET | `/api/books/:id` | One book |
| POST / PUT / DELETE | `/api/books[/:id]` | Admin book CRUD |
| GET | `/api/categories` | Categories + subgenres |
| POST | `/api/orders` | Place an order (public) |
| GET | `/api/orders/lookup` | Track an order by ref + email |
| GET | `/api/orders` | List orders (admin) |
| POST | `/api/contact` | Send a contact message (public) |
| GET / DELETE | `/api/contact[/:id]` | Admin messages |
| POST | `/api/auth/register` / `login` / `logout` | Account sessions |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/{google,facebook,twitter}` | Social sign-in redirect |