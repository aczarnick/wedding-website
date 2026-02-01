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

const Home = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const daysToGo = DaysUntilWedding();

  return (
    <div className='flex flex-col max-h-screen overflow-x-hidden overflow-y-scroll snap-y'>
      <HeroSection 
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        daysToGo={daysToGo}
      />
      <div className='bg-zinc-50'>
        <div id='Details'>
          <EventSection {...EVENTS.ceremony} />
          <EventSection {...EVENTS.reception} />
        </div>

        <div id="Travel">
          <h1 className="text-3xl text-center mt-10">Travel Recomendations</h1>
          <TravelSection {...HOTELS.cobblestone} />
          <TravelSection {...HOTELS.baymont} />
          <h1 className="text-xl text-center mt-10">Issues with booking? Let us know!</h1>
        </div>

        <div id="FAQs">
          <FAQSection />
          <Footer />
        </div>
      </div>
    </div>
  );
};

export default Home;