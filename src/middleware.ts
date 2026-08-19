import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "hairtopia_session";

function getSecret() {
  const secret = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
  return new TextEncoder().encode(secret);
}

const ROLE_PREFIXES: Record<string, string[]> = {
  "/stylist": ["stylist", "manager", "owner"],
  "/admin": ["manager", "owner"],
  "/owner": ["owner"],
  "/account": ["customer", "stylist", "manager", "owner"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const matchedPrefix = Object.keys(ROLE_PREFIXES).find((p) => pathname.startsWith(p));
  if (!matchedPrefix) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    const allowed = ROLE_PREFIXES[matchedPrefix];
    if (!allowed.includes(role)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  } catch {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/stylist/:path*", "/admin/:path*", "/owner/:path*", "/account/:path*"],
};
