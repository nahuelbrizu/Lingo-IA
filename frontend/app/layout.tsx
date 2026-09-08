import type { Metadata } from 'next';
import { Inter, Lexend } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const lexend = Lexend({
  subsets: ['latin'],
  variable: '--font-lexend',
  weight: ['500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Lingo-IA',
  description: 'Tu tutor de idiomas inteligente',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${lexend.variable} ${inter.className} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
