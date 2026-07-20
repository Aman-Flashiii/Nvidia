/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

const nextConfig = {
  reactStrictMode: true,
  env: {
    // NEXT_PUBLIC_ vars are inlined into the browser bundle.
    // We intentionally leave NEXT_PUBLIC_API_BASE_URL empty so
    // axios uses the same-origin Next.js proxy routes instead of
    // hitting the C++ server directly from the browser.
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || '',
  },
  /**
   * Rewrites act as a fallback proxy: if an API route file doesn't exist,
   * Next.js forwards the request to the C++ backend transparently.
   * The API route files (src/app/api/*) take precedence and do shape
   * translation before hitting the backend.
   */
  async rewrites() {
    return [
      {
        source: '/api/search',
        destination: `${BACKEND_URL}/search`,
      },
      {
        source: '/api/metrics',
        destination: `${BACKEND_URL}/metrics`,
      },
      {
        source: '/api/ingest',
        destination: `${BACKEND_URL}/ingest`,
      },
    ];
  },
};

module.exports = nextConfig;
