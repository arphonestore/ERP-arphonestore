import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { authSecret } from "@/lib/auth-secret";

const protectedRoutes = [
  "/dashboard",
  "/stock",
  "/barang-masuk",
  "/barang-keluar",
  "/laporan",
  "/profil",
];

function isProtectedRoute(pathname: string) {
  return protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/apple-icon")
  ) {
    return NextResponse.next();
  }

  let token = null;

  try {
    token = await getToken({
      req: request,
      secret: authSecret,
    });
  } catch {
    const response = NextResponse.redirect(new URL("/auth/login", request.url));
    const staleCookies = [
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
      "next-auth.callback-url",
      "__Secure-next-auth.callback-url",
      "next-auth.csrf-token",
      "__Host-next-auth.csrf-token",
    ];

    staleCookies.forEach((cookieName) => {
      response.cookies.delete(cookieName);
    });

    return response;
  }

  if (pathname === "/" && !token) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  if (pathname === "/auth/login" && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedRoute(pathname) && !token) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image).*)"],
};
