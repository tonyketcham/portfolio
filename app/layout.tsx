import type { Metadata } from 'next';
import { Chivo_Mono, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { FilterDefinitions } from '@/app/filters/FilterDefinitions';

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
        {children}
        <FilterDefinitions />
      </body>
    </html>
  );
}
