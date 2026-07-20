import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jbmono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'p-Adic Ultrametric Vector Search Engine',
  description:
    'GPU-accelerated nearest-neighbor search over p-Adic quantized embeddings, with a live ultrametric dendrogram, CUDA kernel profiling, and shared-memory bank verification.',
  icons: { icon: '/logo.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className="font-sans bg-bg-0 text-ink-hi antialiased min-w-[1400px] min-h-[900px]">
        {children}
      </body>
    </html>
  );
}
