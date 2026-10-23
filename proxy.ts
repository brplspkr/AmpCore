import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales } from "@/lib/i18n/config";

function getLocale(request: NextRequest) {
  const preferred = request.cookies.get("preferred-locale")?.value;
  if (preferred && locales.includes(preferred as (typeof locales)[number])) {
    return preferred;
  }

  return defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const pathnameHasLocale = locales.some((locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`);

  if (pathnameHasLocale) {
    return NextResponse.next();
  }

  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ["/((?!api|remote|_next/static|_next/image|favicon.ico|logo.ico|.*\\..*).*)"]
};
