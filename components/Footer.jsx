export default function Footer({ email, siteTitle }) {
  return (
    <footer id="contact" className="bg-[#f8f5f2] text-[#3a2c1a] border-t border-[#e5ded6]">
      <div className="mx-auto max-w-4xl px-6 py-12 flex flex-col items-center gap-6">
        <div className="flex flex-col items-center">
          <p className="font-serif text-2xl font-semibold tracking-wide text-[#3a2c1a]">{siteTitle}</p>
          <div className="w-12 h-1 bg-gradient-to-r from-[#e7cfa4] to-[#f8f5f2] rounded-full my-3" />
          <p className="mt-1 text-base text-[#7d6a4d] italic text-center max-w-xs">
            Questions? You've got our numbers, just ask!
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 text-sm">
          <a href={`mailto:${email}`} className="text-[#bfa76a] hover:text-[#a88c4a] underline underline-offset-4 transition-colors duration-200">
            {email}
          </a>
          <p className="text-[#bfa76a] text-xs mt-2">© {new Date().getFullYear()} Alex &amp; Claire</p>
        </div>
      </div>
    </footer>
  );
}
