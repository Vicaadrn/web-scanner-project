// frontend/middleware.ts - Versi Sangat Sederhana
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Hanya tambah security headers
  const response = NextResponse.next();
  
  // Basic security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  
  // Log untuk debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`➡️ ${request.method} ${request.nextUrl.pathname}`);
  }
  
  return response;
}

// Hanya apply ke API routes
export const config = {
  matcher: '/api/:path*',
};