/**
 * Resolves the caller's address from the proxy headers. Cloudflare fronts the
 * site, so its header is authoritative; the Container App's forwarded-for
 * chain is the fallback and its first entry is the original client.
 */
export function clientIpAddress(request: Request): string | null {
  const cloudflareAddress = request.headers.get('cf-connecting-ip')?.trim();

  if (cloudflareAddress) {
    return cloudflareAddress;
  }

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  return forwarded || null;
}
