import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Manager Panel',
  description: 'Manage & Inject Secure Web Session Cookies',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}