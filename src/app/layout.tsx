import "./globals.css";

export default function RootLayout({ children } : { children: React.ReactNode; }) {
  return (
    <html lang="en">
      <head>
        <title>A&amp;C 10.10.2026</title>
        <meta
          name="description"
          content="Alex & Claire Wedding — October 10, 2026 — Boone, Iowa"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <meta property="og:title" content="Alex & Claire&apos;s Wedding" />
        {/* <meta property="og:description" content={content.global.siteDescription} /> */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://czarnickwedding.com" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={`antialiased`} >
        <main>{children}</main>
      </body>
    </html>
  );
}
