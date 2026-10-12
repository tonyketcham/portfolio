import type { Metadata, Viewport } from 'next';
import { Chivo_Mono, Geist, Geist_Mono, Jacquarda_Bastarda_9, Pixelify_Sans } from 'next/font/google';
import './globals.css';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SupportedFilterDefinitionsProvider } from '@/app/filters/SupportedFilterDefinitionsProvider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const chivoMono = Chivo_Mono({
  variable: '--font-chivo-mono',
  subsets: ['latin'],
});

const pixel = Pixelify_Sans({
  variable: '--font-pixel',
  subsets: ['latin'],
});

const blackletter = Jacquarda_Bastarda_9({
  variable: '--font-blackletter',
  weight: '400',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Tony Ketcham',
  description: 'Design engineer building design tools. Tea collector. Generative artist.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#09090b',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${chivoMono.variable} ${pixel.variable} ${blackletter.variable} antialiased`}
      >
        <SupportedFilterDefinitionsProvider>
          {children}
        </SupportedFilterDefinitionsProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
