import { NextResponse } from 'next/server';
import { clearSenderCookieHeader } from '@/utils/senderCookie';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.headers.set('Set-Cookie', clearSenderCookieHeader());
  return res;
}
