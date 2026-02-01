'use client';

import { useState } from 'react';
import { HeroSection } from '@/components/HeroSection';
import { EventSection } from '@/components/EventSection';
import { FAQSection } from '@/components/FAQSection';
import { Footer } from '@/components/Footer';
import { EVENTS } from '@/constants/events';
import { HOTELS } from '@/constants/hotels';
import { DaysUntilWedding } from '@/utils/dateUtils';
import { TravelSection } from '@/components/TravelSection';
import { SectionDivider } from '@/components/SectionDivider';

const Home = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const daysToGo = DaysUntilWedding();

  return (
    <div className='flex flex-col overflow-x-hidden'>
      <HeroSection 
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        daysToGo={daysToGo}
      />
      <div className='bg-sage-50/70'>
        <SectionDivider id='Details'>
          <EventSection {...EVENTS.ceremony} />
          <EventSection {...EVENTS.reception} />
        </SectionDivider>

        <SectionDivider id="Travel">
          <h1 className="text-3xl text-center text-sage-800">Travel Recommendations</h1>
          <p className="text-center text-sm uppercase tracking-[0.3em] text-sage-700/70 mt-3">Stay nearby</p>
          <div className="mt-10 space-y-10 pb-16">
            <TravelSection {...HOTELS.cobblestone} />
            <TravelSection {...HOTELS.baymont} />
          </div>
          <h1 className="text-lg text-center pb-16 text-sage-700">Issues with booking? Let us know!</h1>
        </SectionDivider>

        <SectionDivider id="FAQs">
          <FAQSection />
          <Footer />
        </SectionDivider>
      </div>
    </div>
  );
};

export default Home;
