import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Simple edge check for supabase auth cookie
  const authCookie = request.cookies.get('sb-access-token') || request.cookies.get('sb-refresh-token');
  
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    // If no cookies are present, redirect to login
    // Note: This is a basic check. True validation happens client-side, 
    // but this prevents the UI from flickering for obviously unauthenticated users.
    const hasAnySupabaseCookie = Array.from(request.cookies.getAll()).some(c => c.name.startsWith('sb-'));
    if (!hasAnySupabaseCookie) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*']
}
