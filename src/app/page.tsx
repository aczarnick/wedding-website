'use client'

import { useCallback, useState } from "react";
import Hero from "./components/Hero";
import EventDetails from "./components/EventDetails";
import Accommodations from "./components/Accommodations";
import Footer from "./components/Footer";

const NAV_ITEMS = [
  { label: 'Details', href: '#details' },
  { label: 'Accommodations', href: '#accommodations' },
  { label: 'Contact', href: '#contact' }
];

export default function Home(){
  const content = getProps();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleCtaClick = useCallback(() => {
    const detailsSection = document.querySelector('#details');
    detailsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const toggleMobileNav = () => setMobileNavOpen((prev) => !prev);

  return (
    <>
      <div className="relative bg-background min-h-screen">
        <nav className="fixed inset-x-0 top-0 z-30 bg-white/90 shadow-md border-b border-[#e5ded6] backdrop-blur-lg" aria-label="Primary">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4 sm:px-10">
            <a href="#hero" className="font-serif text-2xl font-semibold tracking-wide text-[#3a2c1a] hover:text-[#bfa76a] transition-colors duration-200">
              Alex &amp; Claire
            </a>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-[#e7cfa4] px-3 py-2 text-sm text-[#3a2c1a] bg-white shadow-xs sm:hidden"
              onClick={toggleMobileNav}
              aria-expanded={mobileNavOpen}
              aria-controls="primary-navigation"
            >
              <span className="sr-only">Open navigation</span>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="hidden gap-8 sm:flex">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="font-body text-base text-[#7d6a4d] hover:text-[#bfa76a] transition-colors duration-200 px-2 py-1 rounded-sm"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
          {mobileNavOpen && (
            <div id="primary-navigation" className="border-t border-[#e7cfa4] bg-white px-6 py-4 sm:hidden shadow-md">
              <div className="flex flex-col gap-3">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="font-body text-base text-[#7d6a4d] hover:text-[#bfa76a] transition-colors duration-200 px-2 py-1 rounded-sm"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </nav>

        <main className="flex flex-col">
          <div className="h-20" aria-hidden="true" />
          <Hero
            headline={content.sections.hero.headline}
            subheadline={content.sections.hero.subheadline}
            ctaText={content.sections.hero.ctaText}
            heroImageUrl={content.sections.hero.heroImageUrl}
            onCtaClick={handleCtaClick}
          />
          <EventDetails
            ceremony={{
              time: content.sections.details.ceremonyTime,
              location: content.sections.details.ceremonyLocationName
            }}
            reception={{
              time: content.sections.details.receptionTime,
              location: content.sections.details.receptionLocationName
            }}
            dressCode={content.sections.details.dressCode}
            notes={content.sections.details.additionalNotes}
          />
          <Accommodations
            hotels={content.sections.accommodations.hotels}
            notes={content.sections.accommodations.notes}
          />
        </main>
        <Footer email={content.sections.contact.email} siteTitle={content.global.siteTitle} />
      </div>
    </>
  );
}

export function getProps() {
  const content = {
    global: {
      siteTitle: "Alex & Claire's Wedding",
      siteDescription: "Alex & Claire are getting married — October 10, 2026 — Boone, Iowa",
      contactEmail: 'czarnickwedding@gmail.com'
    },
    sections: {
      hero: {
        headline: 'Alex & Claire',
        subheadline: 'October 10, 2026 — Boone, Iowa',
        ctaText: 'View Details',
        heroImageUrl: '/images/bar-wide-crop.jpeg'
      },
      details: {
        ceremonyTime: 'TBD',
        ceremonyLocationName: 'Grandma\'s Farm',
        receptionTime: 'TBD',
        receptionLocationName: 'Grandma\'s Farm',
        dressCode: 'Formal',
        additionalNotes: 'More details to come soon!'
      },
      accommodations: {
        hotels: [
          {
            name: 'Cobblestone Inn & Suites',
            address: '1900 Lakewood Drive Boone, IA 50036',
            link: "https://staycobblestone.com/ia/boone",
            additionalDetails: 'Must call to join room block. If you have issues booking, ask for Autumn, the event coordinator.'
          },
          {
            name: 'Baymont by Wyndham Boone',
            address: '1745 SE Marshall St, Boone, IA 50036',
            link: 'https://www.wyndhamhotels.com/baymont/boone-iowa/baymont-inn-suites-boone/overview'
          },
        ],
        notes: 'We recommend booking early. Feel free to reach out if you would like additional suggestions.'
      },
      rsvp: {
        confirmationMessage: 'Thank you for your RSVP! We can’t wait to celebrate with you.'
      },
      registry: {
        entries: [],
        notes: 'Your presence is the greatest gift! If you would like to contribute, our registry links will be added here soon.'
      },
      gallery: {
        images: [],
        lightbox: true
      },
      contact: {
        email: 'czarnickwedding@gmail.com'
      }
    }
  };

  return content;
}
