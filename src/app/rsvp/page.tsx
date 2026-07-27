import { Header } from '@/components/Header';
import { GradientGlowDivider } from '@/components/dividers';
import { RsvpWizard } from '@/components/rsvp/RsvpWizard';

const RsvpPage = () => {
  return (
    <div className='min-h-screen flex flex-col bg-sage-50/70'>
      <Header />

      <GradientGlowDivider className='flex-1 flex flex-col' glowPosition='top'>
        <main className='flex-1 flex flex-col items-center px-5 py-12 sm:px-6 sm:py-16'>
          <div className='w-full max-w-xl rounded-2xl border border-sage-200/70 bg-white/80 px-6 py-10 shadow-sm backdrop-blur-sm sm:px-10 sm:py-12'>
            <RsvpWizard />
          </div>
        </main>
      </GradientGlowDivider>
    </div>
  );
};

export default RsvpPage;
