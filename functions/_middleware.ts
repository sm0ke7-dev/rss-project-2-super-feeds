// Cloudflare Pages middleware — HTTP Basic Auth gate
// Set ADMIN_USER and ADMIN_PASS as environment variables in
// Cloudflare Pages → Settings → Environment variables (encrypted).

interface Env {
  ADMIN_USER?: string;
  ADMIN_PASS?: string;
}

const REALM = "RSS Super Feed Admin";

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}"` },
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  const expectedUser = env.ADMIN_USER ?? "admin";
  const expectedPass = env.ADMIN_PASS;

  // If no password is configured, skip auth (local dev / first deploy)
  if (!expectedPass) {
    return context.next();
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return unauthorized();
  }

  const encoded = authHeader.slice(6);
  const decoded = atob(encoded);
  const [user, pass] = decoded.split(":");

  if (user !== expectedUser || pass !== expectedPass) {
    return unauthorized();
  }

  return context.next();
};
