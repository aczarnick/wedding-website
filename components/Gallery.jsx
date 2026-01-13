import { useState } from 'react';
import Image from 'next/image';

const FALLBACK_IMAGES = [
  {
    src: 'https://images.unsplash.com/photo-1520854221050-0f4caff449fb?auto=format&fit=crop&w=1200&q=80',
    alt: 'Wedding ceremony inspiration'
  },
  {
    src: 'https://images.unsplash.com/photo-1525182008055-f88b95ff7980?auto=format&fit=crop&w=1200&q=80',
    alt: 'Reception dining table inspiration'
  },
  {
    src: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
    alt: 'Elegant floral arrangement inspiration'
  },
  {
    src: 'https://images.unsplash.com/photo-1520854221052-070ee4b3b3f4?auto=format&fit=crop&w=1200&q=80',
    alt: 'Outdoor celebration inspiration'
  }
];

export default function Gallery({ images, lightboxEnabled = true }) {
  const [activeImage, setActiveImage] = useState(null);
  const galleryImages = images.length > 0 ? images : FALLBACK_IMAGES;

  const closeLightbox = () => setActiveImage(null);

  return (
    <section id="gallery" className="bg-background px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-3xl tracking-tight text-text sm:text-[1.75rem]">Moments to Come</h2>
        <p className="mt-4 text-base text-text/80">
          A peek at the mood we&apos;re dreaming up for the celebration. We&apos;ll update with photos after the wedding!
        </p>
        <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3">
          {galleryImages.map((image, index) => (
            <button
              type="button"
              key={`${image.src}-${index}`}
              className="group relative mb-4 w-full overflow-hidden rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
              onClick={() => lightboxEnabled && setActiveImage(image)}
              aria-label={`View larger ${image.alt}`}
              disabled={!lightboxEnabled}
            >
              <Image
                src={image.src}
                alt={image.alt}
                width={600}
                height={800}
                className="h-auto w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                loading="lazy"
                sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
              />
            </button>
          ))}
        </div>
      </div>

      {lightboxEnabled && activeImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-w-3xl">
            <Image
              src={activeImage.src}
              alt={activeImage.alt}
              width={1200}
              height={1600}
              className="h-auto w-full rounded-3xl object-contain"
              sizes="(min-width: 1024px) 60vw, 90vw"
            />
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute right-4 top-4 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-text shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
