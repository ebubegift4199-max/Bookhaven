# BookHaven — Project Spec

A single-page online bookstore landing page (hero + category grid + featured books), built with HTML/CSS (or React) and Tailwind-style utility spacing. Static/frontend only — no backend required unless noted.

## Tech Stack (suggested)
- HTML5 + CSS3 (or React + Tailwind CSS)
- Icon set: Lucide or Feather icons (book, flask, briefcase, monitor, heart, smile, search, cart, heart-outline, user)
- Google Fonts: a bold grotesk/sans-serif (e.g. "Inter" or "Poppins") for headings, regular weight for body
- Font Awesome / Lucide star icons for ratings

## Global Design Tokens

| Token | Value |
|---|---|
| Primary accent (orange/gold) | `#F5A623` (buttons, badges, links) |
| Dark navy/black (header, hero overlay, buttons) | `#14161A` / `#0F1115` |
| Background (page) | `#F7F7F5` (soft off-white) |
| Card background | `#FFFFFF` |
| Card border | `#E5E5E5` |
| Text primary | `#111111` |
| Text secondary/muted | `#6B7280` |
| Star rating color | `#F5A623` |
| Border radius | `8px` cards, `6px` buttons, full-pill search bar |
| Font | Inter, sans-serif |

---

## 1. Header / Navbar
Fixed/sticky, dark background (`#14161A`), full width, height ~64px, white text.

**Left:** Logo — open book icon (yellow/orange, `#F5A623`) + wordmark "**Book**Haven" (Book = white bold, Haven = white bold, no color split needed but keep bold single weight).

**Center nav links** (white text, medium weight, hover → orange):
- Home
- Categories
- Best Sellers
- New Releases
- Deals

**Right side (left to right):**
1. Search bar — pill-shaped, dark input (`#1F2226`), placeholder "Search books or authors...", magnifying-glass icon button on the right end (orange circular button).
2. Wishlist — heart outline icon + "Wishlist" label (white text).
3. Cart — cart icon + "Cart" label (white text) with a small orange circular badge showing count (e.g. "2") positioned top-right of the icon.
4. Account — user icon + "Account" label (white text).

---

## 2. Hero Section
Full-width banner (~430px tall), background image: a cozy bookstore/bookshelf photo with a stack of books and a coffee mug on a wooden table (right side of image), dark gradient overlay on the left ~60% for text legibility (linear-gradient left dark → transparent right).

**Left-aligned content, vertically centered:**
- H1 headline, white, extra bold, large (~48–56px), two lines:
  "Discover Your
  Next Favorite Book"
- Subtext, light gray/white ~90% opacity, 2 lines:
  "Explore thousands of books across all genres.
  Find the perfect book for every mood and occasion."
- CTA button: "Shop Now →" — solid orange (`#F5A623`) background, black/dark text, bold, rounded (6–8px), padding ~14px 28px, with a dashed orange outline/border box surrounding it (offset ~6px) as a decorative focus frame.

**Background image (right ~40%):** stacked hardcover books (titles visible: "The Seven Husbands of Evelyn Hugo", "Atomic Habits", "Anxious People", "It Ends With Us"), small potted succulent plant, dark ceramic coffee mug, blurred bookshelf background.

---

## 3. Interaction Demo Callouts (annotation overlay — optional/for prototype only)
These are UX-flow annotation markers overlaid on the design to demonstrate a click-and-scroll interaction. Only include if building an interactive walkthrough/demo:
- **Badge "1"** (black circle, yellow border) positioned under the Shop Now button, with a black label pill: **"User clicks 'Shop Now'"** and an arrow pointing up to the button.
- **Badge "2"** (yellow circle) positioned near "Browse Categories" section, with white label pill: **"The page scrolls down to the Featured Books section"** (with "Featured Books" underlined in yellow).
- A curved yellow arrow connects badge 1's action down to badge 2, ending with an arrowhead pointing down into the Featured Books area.

Implementation: clicking "Shop Now" should smooth-scroll the page down to the `#featured-books` section.

---

## 4. Browse Categories Section
Background: page background color. Section heading: "Browse Categories" (bold, ~24px, left-aligned, black).

Grid of **6 category cards**, equal width, single row (responsive: wrap to 2–3 columns on smaller screens). Each card: white background, thin gray border, rounded corners (~8px), centered content, padding ~24px, icon on top + label below, subtle hover (border → orange, slight lift/shadow).

| Icon | Label | Icon color |
|---|---|---|
| Open book | Fiction | Purple `#7C3AED` |
| Flask/beaker | Science | Green `#10B981` |
| Briefcase | Business | Orange `#F59E0B` |
| Monitor/desktop | Technology | Blue `#3B82F6` |
| Heart outline | Romance | Pink/Red `#EF4444` |
| Smiley face | Children's Books | Yellow `#F5C518` |

Label text: bold, black, centered below icon.

---

## 5. Featured Books Section
`id="featured-books"` (scroll target). Header row: "Featured Books" (bold, ~24px, left) and "View All →" link (right-aligned, gray text, orange chevron, hover → orange).

Grid of **4 book cards** (responsive: 4 columns desktop → 2 → 1), each in a white rounded card with light border/shadow, padding ~16px, containing:

- **Book cover image** (top, portrait aspect ~3:4, rounded corners top)
- **Wishlist heart icon** — outline heart, top-right corner overlaid on/near the card, toggles filled on click
- **Title** — bold black, ~16px
- **Author** — gray, ~13px, below title
- **Star rating row** — 5 star icons (filled orange stars, partial fill supported for .5 ratings) + numeric rating in parentheses, gray text
- **Price** — bold black, ~18px, e.g. "$15.99"
- **"Add to Cart" button** — full width, solid black/dark background, white bold text, rounded (~6px), hover → slightly lighter black

**Featured books data:**

| Cover | Title | Author | Rating | Price |
|---|---|---|---|---|
| Atomic Habits (tan/cream cover) | Atomic Habits | James Clear | 4.8 ★ | $15.99 |
| The Silent Patient (dark cover, red text) | The Silent Patient | Alex Michaelides | 4.5 ★ | $12.99 |
| The Midnight Library (dark blue, illustrated building) | The Midnight Library | Matt Haig | 4.7 ★ | $14.99 |
| It Ends With Us (pink cover, floral) | It Ends With Us | Colleen Hoover | 4.6 ★ | $11.99 |

---

## 6. Responsive Behavior
- **Desktop (≥1024px):** nav fully horizontal, 6-column category grid, 4-column book grid.
- **Tablet (768–1023px):** category grid 3 columns, book grid 2 columns, nav links may collapse behind a menu icon.
- **Mobile (<768px):** hamburger menu replaces nav links, search bar collapses to icon, hero text stacks and shrinks (~32px headline), category grid 2 columns, book grid 1–2 columns, hero image height reduces (~300px).

## 7. Interactions / JS Behavior
- Smooth scroll from "Shop Now" → `#featured-books`.
- Wishlist heart icons toggle filled/outline state and increment a wishlist counter (optional, could badge next to "Wishlist" in nav).
- "Add to Cart" increments the cart badge count in the header and could show a small toast/confirmation.
- Card hover states: slight `translateY(-2px)` + shadow increase on category and book cards.
- Search input: basic client-side filter (optional) or just UI placeholder.

## 8. Assets Needed
- Logo icon (open book, orange)
- Hero background photo (bookshelf + book stack + coffee mug, warm lighting)
- 4 book cover images matching titles above
- 6 category icons (book, flask, briefcase, monitor, heart, smiley) — Lucide/Feather icon set works well
- Star icon (filled + outline for partial ratings)