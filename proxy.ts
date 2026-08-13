import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

import { authSecret } from "@/lib/auth-secret";

const protectedRoutes = [
  "/dashboard",
  "/stock",
  "/barang-masuk",
  "/barang-keluar",
  "/laporan",
  "/profil",
  "/activity",
];

const staleCookies = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
];

function isProtectedRoute(pathname: string) {
  return protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function clearStaleCookies(response: NextResponse) {
  staleCookies.forEach((cookieName) => {
    response.cookies.delete(cookieName);
  });

  return response;
}

function redirectToLogin(request: NextRequest, includeCallback = false) {
  const loginUrl = new URL("/auth/login", request.url);

  if (includeCallback) {
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  }

  return NextResponse.redirect(loginUrl);
}

function isValidToken(token: Awaited<ReturnType<typeof getToken>>) {
  return (
    token !== null &&
    typeof token !== "string" &&
    typeof token.id === "string" &&
    token.id.length > 0 &&
    Number.isSafeInteger(token.sessionVersion) &&
    (token.sessionVersion as number) >= 0
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let token: Awaited<ReturnType<typeof getToken>> = null;

  try {
    token = await getToken({
      req: request,
      secret: authSecret,
    });
  } catch {
    return clearStaleCookies(redirectToLogin(request));
  }

  if (token && !isValidToken(token)) {
    return clearStaleCookies(redirectToLogin(request));
  }

  if (pathname === "/" && !token) {
    return redirectToLogin(request);
  }

  if (pathname === "/auth/login" && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedRoute(pathname) && !token) {
    return redirectToLogin(request, true);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/auth/login",
    "/dashboard/:path*",
    "/stock/:path*",
    "/barang-masuk/:path*",
    "/barang-keluar/:path*",
    "/laporan/:path*",
    "/profil/:path*",
    "/activity/:path*",
  ],
};
