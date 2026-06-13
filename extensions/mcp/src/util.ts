export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export function isAuthError(e: unknown) { const m = e instanceof Error ? e.message : String(e); return /unauthori[sz]ed|401|oauth|authorization|required/i.test(m); }
export function isClientRegistrationError(e: unknown) { const m = e instanceof Error ? e.message : String(e); return /client.?registration|client_id|invalid_client/i.test(m); }
export function asError(e: unknown) { return e instanceof Error ? e.message : String(e); }
