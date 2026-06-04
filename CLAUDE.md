# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — dev server at http://localhost:3000
- `npm run build` — production build; must pass with zero errors before any PR
- `npm run lint` — ESLint (`eslint-config-next`); add `--fix` to auto-correct
- `npm run start` — run production build

There is no test suite. Validate changes with `npm run build` and `npm run lint`.

Deployment uses Next.js standalone output (`output: 'standalone'` in `next.config.ts`) for Docker (`Dockerfile`, `docker-compose.yml`).

## Architecture

Wedding website (wedding date: October 10, 2026, hardcoded in `src/utils/dateUtils.ts`) built with Next.js 16 App Router + React 19 + TypeScript strict mode + Tailwind CSS v4. No backend API — all content is static data in `src/constants/*`.

### Data-driven page composition

`src/app/page.tsx` (server component) is the main landing page. It composes presentational components fed entirely by typed constants:

- `src/constants/events.ts` — `EVENTS` record (ceremony, reception) rendered via `EventSection`; also exports `NAV_LINKS`
- `src/constants/hotels.ts` — `HOTELS` record rendered via `TravelSection`
- `src/constants/faqs.ts` — `FAQS` array rendered via `FAQSection`

To change site content, edit the constants — not the components.

### Navigation ↔ section ID coupling

`NAV_LINKS` in `src/constants/events.ts` drives both desktop and mobile nav in `Header.tsx`. `Registry` and `Gallery` are route links (`/registry`, `/gallery` — currently "Coming Soon" placeholder pages); all other links are `/#SectionId` hash links that must match the `id` props on the divider components in `page.tsx` (`Details`, `Travel`, `FAQs`). The dividers (`src/components/dividers/`) are layout wrappers whose `id` prop doubles as the scroll anchor target.

Adding a section: wrap content in a divider with an `id`, add that id string to `NAV_LINKS`. Adding a page route: create `src/app/<name>/page.tsx`, add the capitalized name to `NAV_LINKS`, and update the `isRouteLink` helper in `Header.tsx`.

### Client/server boundary

`'use client'` only on components using state/hooks: `Header.tsx` (mobile drawer) and `HeroSection.tsx`. The countdown (`DaysUntilWedding()`) is deliberately computed client-side in a `useEffect` inside `HeroSection` — initial state is a non-breaking space — to avoid both hydration mismatches and a stale build-time value. Don't move it to the server or call it during render.

## Conventions

- Tailwind utility classes only; no custom CSS components. Custom sage palette (`sage-50`…`sage-800`) and the Playfair Display font (`font-serif`) are defined in `src/app/globals.css` via `@theme inline`
- Path alias `@/` → `src/`
- Images: always Next.js `Image` with meaningful `alt`; local images imported as `StaticImageData` (see `HeroSection` and constants)
- Mobile-first responsive design; `md:` breakpoint toggles desktop vs. mobile nav
