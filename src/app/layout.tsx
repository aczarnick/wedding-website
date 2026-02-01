import type { Metadata } from "next";
import { Cinzel, Playfair_Display} from "next/font/google";
import "./globals.css";

const cinzel = Cinzel
({
  variable: "--font-cinzel-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const playfair = Playfair_Display(
  {
    variable: "--font-playfair-serif",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    display: "swap",
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
        className={`${cinzel.variable} ${playfair.variable} font-main antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
