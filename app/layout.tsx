import type { Metadata } from 'next';
import { Chivo_Mono, Geist, Geist_Mono } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'Tony Ketcham',
  description: 'Design engineer building design tools',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${chivoMono.variable} antialiased`}
      >
        <SupportedFilterDefinitionsProvider>
          {children}
        </SupportedFilterDefinitionsProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
