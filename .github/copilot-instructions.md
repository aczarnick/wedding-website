# Copilot Instructions for Wedding Website

## Build & Test Commands

### Development
- **Start dev server:** `npm run dev` → http://localhost:3000
- **Build for production:** `npm run build`
- **Run production build:** `npm run start`
- **Lint code:** `eslint` (add `--fix` to auto-correct)

### No test suite currently configured

## High-Level Architecture

**Stack:** Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS v4

**Project Type:** Single-page wedding website with snap-scroll sections and responsive mobile/desktop layouts

**Key Files & Directories:**
- `/src/app/page.tsx` – Main page component (`'use client'`), contains all sections and mobile menu state
- `/src/app/layout.tsx` – Root layout with metadata, font configuration (Cinzel, Playfair Display)
- `/src/components/` – Reusable components:
  - `MobileNavLink.tsx` – Styled anchor for mobile navigation overlay
  - `SectionContainer.tsx` – Wrapper component with snap-scroll styling
- `/src/app/globals.css` – Tailwind CSS v4 theme config (custom theme using `@theme inline`)
- `/public/images/` – Hero and section images (trees-handhold.jpg, ring-shot.jpg, lift-bar.jpg)
- Next.js Config: `next.config.ts` (output: standalone)

**Design Pattern:**
- Full page is a single client component (`page.tsx`) with `snap-y snap-mandatory` scroll container
- Sections use `SectionContainer` wrapper with `snap-center min-h-screen` (full-height sections)
- Mobile menu: overlapping slide-in drawer with backdrop overlay
- Responsive design: `md:` and `lg:` breakpoints; mobile-first approach

## Key Conventions

### Styling & Layout
- **Tailwind CSS v4** – use only utility classes (no custom CSS components)
- **CSS-in-JS via `@theme inline`** in `globals.css` for theme variables
- **Font system:** Cinzel (secondary) and Playfair Display (serif) imported as Google Fonts; variables defined in `layout.tsx` and consumed via CSS
- **Color palette:** Uses `bg-zinc-100`, `bg-white/70`, `bg-black/50`, etc.; no custom color extension
- **Snap scroll:** Container has `snap-y snap-mandatory`; sections have `snap-center min-h-screen`
- **Responsive:** Mobile-first; `hidden md:flex`, `flex md:hidden` for layout switching; also `basis-1/2` for flex column alignment on desktop

### Component Patterns
- **`'use client'` directive:** Required at top of interactive components (e.g., `page.tsx` for state and event handlers)
- **Module path alias:** `@/` resolves to `src/` (e.g., `import { SectionContainer } from '@/components/SectionContainer'`)
- **Images:** Always use Next.js `Image` component:
  - Local: `src="/images/..."`, `fill` with object-cover for backgrounds
  - Responsive widths: Define explicit `width` and `height` props for sized images
  - Alt text required for accessibility
- **Navigation:** Anchor links (`href="#SectionId"`) scroll to matching `id` attributes

### TypeScript & Code Quality
- **Strict mode enabled** in `tsconfig.json`
- **Target:** ES2017 with bundler module resolution
- **Path alias:** `"@/*": ["./src/*"]` (configured in `tsconfig.json`)
- **No `any` types** without justification
- No unused imports (ESLint enforces via `eslint-config-next`)

### Accessibility & Performance
- **WCAG AA intent:** Contrast ratios suitable for readability (see palette choices)
- **Mobile-first:** Ensures keyboard navigation and touch targets on smaller screens
- **Image optimization:** All images use `next/image` for automatic optimization and lazy loading
- **Lazy loading:** By default, off-screen images load on demand

### Project Structure
```
src/
  app/
    layout.tsx       # Root layout, fonts, metadata
    page.tsx         # Main page (all sections)
    globals.css      # Tailwind + theme config
  components/
    MobileNavLink.tsx
    SectionContainer.tsx
public/
  images/
    trees-handhold.jpg
    ring-shot.jpg
    lift-bar.jpg
  favicon.ico
```

## Runtime Notes

- **Node.js:** ≥20 (as per `package.json` engines)
- **No backend API:** Currently static rendering only
- **Standalone output:** `next.config.ts` sets `output: 'standalone'` for containerization
- **Future feature hint:** RSVP button placeholder exists in hero section (not yet wired)
- **Font loading:** Google Fonts configured with `display: "swap"` for best performance

## Development Tips

- Mobile menu state lives in `page.tsx` via `useState(false)` (visible on md breakpoint)
- To add a section: Create a `SectionContainer id="..."` with content; add matching link in nav
- Dates hardcoded: Wedding date is October 10, 2026 (used for countdown calculation)
- Image dimensions: See `page.tsx` for responsive sizing patterns (246×164 mobile, 342×512 desktop)
