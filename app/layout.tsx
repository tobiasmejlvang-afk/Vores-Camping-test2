import type { Metadata, Viewport } from 'next';
import PwaRegister from './PwaRegister';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://vores-camping-20260823.tobias-mejlvang.chatgpt.site'),
  title: { default: 'Vores Camping', template: '%s · Vores Camping' },
  description: 'Din personlige campingapp til ferier, steder, ruter og minder.',
  applicationName: 'Vores Camping',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-512.png', apple: '/icon-512.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Vores Camping' },
  openGraph: {
    type: 'website',
    url: '/',
    locale: 'da_DK',
    siteName: 'Vores Camping',
    title: 'Vores Camping',
    description: 'Ferier, steder, ruter og minder.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Vores Camping ved en nordisk skovsø' }],
  },
  twitter: { card: 'summary_large_image', title: 'Vores Camping', description: 'Ferier, steder, ruter og minder.', images: ['/og.png'] },
};

export const viewport: Viewport = { themeColor: '#233B2E', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="da"><body><PwaRegister />{children}</body></html>;
}
