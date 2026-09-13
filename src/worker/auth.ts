/** Compare a configured bearer credential without leaking its length or prefix. */
export async function verifyBearerToken(authorization: string | null, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  // The app build also loads DOM crypto declarations, which omit the Workers
  // constant-time extension even though the generated runtime types include it.
  const subtle=crypto.subtle as SubtleCrypto & {
    timingSafeEqual(a:ArrayBuffer|ArrayBufferView,b:ArrayBuffer|ArrayBufferView):boolean;
  };
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([
    subtle.digest('SHA-256', encoder.encode(authorization ?? '')),
    subtle.digest('SHA-256', encoder.encode(`Bearer ${token}`)),
  ]);
  return subtle.timingSafeEqual(actual, expected);
}
