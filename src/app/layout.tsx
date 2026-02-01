import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display(
  {
    variable: "--font-playfair-display",
    subsets: ["latin"],
  }
)

export const metadata: Metadata = {
  title: "Alex & Claire's Wedding",
  description: "Claire and Alex are getting married!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${playfair.variable} font-serif antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
