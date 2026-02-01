import { FAQS } from '@/constants/faqs';

export const FAQSection: React.FC = () => {
  return (
    <>
      <p className="text-3xl font-serif text-center my-10">FAQs</p>
      <div className='flex flex-col gap-2.5 px-7.5 text-sm sm:px-30 md:px-40 lg:px-50 xl:px-60 2xl:px-80'>
        {FAQS.map((faq, index) => (
          <div key={index}>
            <p className="underline font-black">Q: {faq.question}</p>
            <p>A: {faq.answer}</p>
          </div>
        ))}
      </div>
      <p className="text-xl text-center mt-10">Come back for more updates!</p>
    </>
  );
};
