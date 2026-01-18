import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export default async function proxy(request: NextRequest) {
  // ✅ Never touch API routes (prevents 404/route weirdness)
  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // refresh auth session for Server Components
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // ✅ exclude /api and next assets
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
