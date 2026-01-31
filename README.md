# Alex & Claire's Wedding

A refined, mobile-first wedding website built with Next.js 16, React 19, and Tailwind CSS v4.
## Prerequisites

- Node.js ≥20
- npm 9+

## Getting Started

```bash
npm install
npm run dev
```

Development server runs at http://localhost:3000

## Features

- **Responsive Design:** Mobile-first approach with Tailwind CSS utility classes; optimized for all screen sizes.
- **Snap Scroll Navigation:** Full-page sections with smooth scroll snapping for an immersive experience.
- **Next.js App Router:** Modern React 19 with TypeScript strict mode for type safety and performance.
- **Image Optimization:** All images use Next.js `Image` component with lazy loading and responsive sizing.

## Development

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Run production build
npm run lint     # Lint with ESLint
```

### Project Structure

- `/src/app/page.tsx` – Main page component (page orchestrator)
- `/src/app/layout.tsx` – Root layout with fonts and metadata
- `/src/app/globals.css` – Tailwind CSS v4 theme configuration
- `/src/components/` – Reusable React components:
  - `Header.tsx` – Navigation bar and mobile menu
  - `EventSection.tsx` – Reusable ceremony/reception section component
  - `SectionContainer.tsx` – Layout wrapper with snap-scroll styling
  - `MobileNavLink.tsx` – Styled mobile navigation link
- `/src/utils/` – Utility functions:
  - `dateUtils.ts` – Wedding countdown calculator
- `/src/constants/` – Application constants:
  - `events.ts` – Event data (Ceremony, Reception) and navigation links
- `/public/images/` – Optimized images for sections and hero

### Code Standards

- **TypeScript:** Strict mode enabled; all types must be properly defined
- **Styling:** Tailwind CSS utilities only; no CSS-in-JS or custom components
- **Components:** Use `'use client'` directive for interactive components; path alias `@/` for imports
- **Images:** Always use Next.js `Image` component with explicit `width` and `height` props
- **Accessibility:** Meaningful alt text, semantic HTML, WCAG AA contrast ratios

## Deployment

```bash
npm run build
npm run start
```

Next.js standalone output (`next.config.ts`) is configured for containerization:

```bash
docker build -t czarnickwedding:latest .
docker run -d -p 80:80 --name czarnickwedding czarnickwedding:latest
```

Or with docker-compose:

```bash
docker-compose up --build -d
```
