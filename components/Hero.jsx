import Image from 'next/image';

const BLUR_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPU2u3fHwAFNQKRnu1jXQAAAABJRU5ErkJggg==';

export default function Hero({ headline, subheadline, ctaText, heroImageUrl, onCtaClick }) {
  const imageSrc = '/assets/images/bar-wide-crop.jpeg';

  return (
    <header id="hero" className="relative isolate overflow-hidden bg-background flex items-stretch -mt-20">
      <div className="absolute inset-0">
        <Image
          src={imageSrc}
          alt="Wedding venue inspiration"
          fill
          priority
          className="object-cover object-top"
          sizes="100vw"
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
        />
        <div className="absolute inset-0 bg-[#f8f5f2]/80" aria-hidden="true" />
      </div>
      <div className="relative mx-auto flex flex-col items-center justify-center w-full max-w-3xl px-6 py-16 text-[#3a2c1a] sm:px-10 min-h-screen">
        {/* <span className="mb-4 inline-flex items-center rounded-full border border-[#e7cfa4] bg-white/80 px-5 py-1 text-xs tracking-[0.25em] uppercase text-[#bfa76a] shadow-sm">
          October 10, 2026 · Boone, Iowa
        </span> */}
        <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-bold text-center leading-tight text-[#3a2c1a] drop-shadow-md">
          {headline}
        </h1>
        <div className="w-16 h-1 bg-gradient-to-r from-[#e7cfa4] to-[#f8f5f2] rounded-full my-6" />
        <p className="mt-2 max-w-xl text-lg sm:text-xl text-center text-[#7d6a4d] italic">
          {subheadline}
        </p>
        <button
          type="button"
          onClick={onCtaClick}
          className="mt-10 inline-flex items-center rounded-full bg-[#bfa76a] px-10 py-3 text-base font-semibold text-white shadow-lg shadow-[#bfa76a]/20 transition hover:bg-[#a88c4a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e7cfa4]"
        >
          {ctaText}
        </button>
      </div>
    </header>
  );
}
