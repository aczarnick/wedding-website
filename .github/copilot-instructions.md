# Copilot Instructions for Wedding Website

## Build & Validation Commands

Always run `npm install` before building if dependencies may be out of date.

- **Start dev server:** `npm run dev` → http://localhost:3000
- **Build for production:** `npm run build` (must pass with zero errors before any PR)
- **Run production build:** `npm run start`
- **Lint code:** `npm run lint` (uses ESLint via `eslint-config-next`; add `--fix` to auto-correct)

No test suite is currently configured. Validate changes by running `npm run build` and `npm run lint`.

## High-Level Architecture

**Stack:** Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS v4

**Project Type:** Multi-page wedding website with a scrollable main page and separate subpages.

**Pages (Next.js App Router):**
- `/` → `src/app/page.tsx` – Main landing page (server component); renders hero, details, travel, FAQs, and footer
- `/gallery` → `src/app/gallery/page.tsx` – Gallery page (coming soon placeholder)
- `/registry` → `src/app/registry/page.tsx` – Registry page (coming soon placeholder)

**Key Files & Directories:**
- `src/app/layout.tsx` – Root layout; metadata, Playfair Display font variable, global CSS import
- `src/app/globals.css` – Tailwind CSS v4 import + `@theme inline` block defining the sage color palette and font variable
- `src/components/Header.tsx` – Sticky nav bar with mobile drawer (`'use client'`); reads `NAV_LINKS` from constants
- `src/components/HeroSection.tsx` – Hero with countdown; receives `daysToGo` prop from server component
- `src/components/EventSection.tsx` – Reusable card for ceremony/reception; driven by `EventDetails` type
- `src/components/TravelSection.tsx` – Hotel recommendation card; driven by `HotelDetails` type
- `src/components/FAQSection.tsx` – FAQ list section; reads from `src/constants/faqs.ts`
- `src/components/Footer.tsx` – Site footer
- `src/components/MobileNavLink.tsx` – Anchor/Link item for the mobile drawer
- `src/components/dividers/` – Section divider wrappers (`GradientGlowDivider`, `SideLinesDivider`, `BottomGradientDivider`); each accepts an `id` prop used as the scroll anchor target
- `src/constants/events.ts` – `EVENTS` record (`ceremony`, `reception`) and `NAV_LINKS` array
- `src/constants/faqs.ts` – `FAQS` data array
- `src/constants/hotels.ts` – `HOTELS` record (`cobblestone`, `baymont`)
- `src/utils/dateUtils.ts` – `DaysUntilWedding()` function (returns a formatted string)
- `public/images/` – Static images: `trees-handhold.jpg`, `ring-shot.jpg`, `lift-bar.jpg`
- `next.config.ts` – `output: 'standalone'` for containerization

## Key Conventions

### Styling & Layout
- **Tailwind CSS v4** – utility classes only; no custom CSS components
- **Custom colors** defined in `globals.css` via `@theme inline`: `sage-50`, `sage-100`, `sage-200`, `sage-700`, `sage-800`
- **Font:** Only Playfair Display (`--font-playfair-display`); applied as `font-serif` via `@theme inline`
- **Responsive:** Mobile-first; `md:` breakpoint for desktop nav visibility (`hidden md:contents` / `md:hidden`)

### Component & Data Patterns
- **`'use client'` directive:** Only on components that use React state/hooks (e.g., `Header.tsx`)
- **`page.tsx` is a server component** – no `'use client'`; calls `DaysUntilWedding()` directly
- **Module path alias:** `@/` resolves to `src/` (e.g., `import { Header } from '@/components/Header'`)
- **Images:** Always use Next.js `Image` component with `alt` text; use `StaticImageData` imports for local images in constants
- **Navigation:** `NAV_LINKS` in `src/constants/events.ts` drives both desktop and mobile nav. `Registry` and `Gallery` route to `/registry` and `/gallery`; all others use `/#SectionId` hash links matching divider `id` props
- **Section IDs:** `Details`, `Travel`, `FAQs` — these must match the `id` props on the divider components in `page.tsx`

### TypeScript & Code Quality
- **Strict mode** enabled in `tsconfig.json`; no `any` types without justification
- **Path alias:** `"@/*": ["./src/*"]`
- **No unused imports** (ESLint enforces via `eslint-config-next`)

### Project Structure
```
src/
  app/
    layout.tsx          # Root layout, font, metadata
    page.tsx            # Main landing page (server component)
    globals.css         # Tailwind v4 + sage color theme
    gallery/page.tsx    # Gallery placeholder page
    registry/page.tsx   # Registry placeholder page
  components/
    Header.tsx          # Sticky nav + mobile drawer
    HeroSection.tsx     # Hero with countdown
    EventSection.tsx    # Ceremony/Reception card
    TravelSection.tsx   # Hotel recommendation card
    FAQSection.tsx      # FAQ accordion
    Footer.tsx
    MobileNavLink.tsx
    dividers/
      GradientGlowDivider.tsx
      SideLinesDivider.tsx
      BottomGradientDivider.tsx
      index.ts
  constants/
    events.ts           # EVENTS record + NAV_LINKS
    faqs.ts             # FAQS array
    hotels.ts           # HOTELS record
  utils/
    dateUtils.ts        # DaysUntilWedding()
public/
  images/
    trees-handhold.jpg
    ring-shot.jpg
    lift-bar.jpg
  favicon.ico
```

## Runtime Notes

- **Node.js:** ≥20 (as per `package.json` `engines.node`)
- **No backend API:** Fully static server-rendered Next.js app
- **Standalone output:** `next.config.ts` sets `output: 'standalone'`; Docker support via `Dockerfile` and `docker-compose.yml`
- **Wedding date:** October 10, 2026 — hardcoded in `src/utils/dateUtils.ts`
- **Gallery & Registry pages** are "Coming Soon" placeholders; `NAV_LINKS` already includes them

## Development Tips

- To add a new section to the main page: create a divider component wrapping the content with an `id` prop, add that `id` string to `NAV_LINKS` in `src/constants/events.ts`, and update `Header.tsx`'s `getHref`/`isRouteLink` helpers if it needs a route instead of a hash link
- To add a new page route: create `src/app/<name>/page.tsx`, add the capitalized name to `NAV_LINKS`, and update the `isRouteLink` helper in `Header.tsx`
- Always run `npm run build` to catch TypeScript and Next.js errors before finalizing changes
