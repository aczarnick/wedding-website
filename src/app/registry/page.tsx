import { Header } from '@/components/Header';

const RegistryPage = () => {
  return (
    <div className='min-h-screen flex flex-col bg-sage-50/30'>
      <Header />
      
      <div className='flex-1 flex flex-col items-center justify-center px-6'>
        <h1 className='text-4xl sm:text-5xl text-sage-800 text-center'>Registry</h1>
        <p className='text-xl sm:text-2xl text-sage-700 mt-6 text-center'>Coming Soon</p>
      </div>
    </div>
  );
};

export default RegistryPage;
