import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
function loadSecret(): string {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  const file = resolve('.juniper-secret');
  try { writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  return readFileSync(file, 'utf8');
}
// Persist locally so API restarts don't invalidate invitation links. Never publish this file.
const secret = loadSecret();
if (secret.length < 32) throw new Error('APP_SECRET or .juniper-secret must contain at least 32 characters.');
function signature(value: string): string { return createHmac('sha256', secret).update(value).digest('base64url'); }
export function signToken(kind: string, id: string): string {
  const payload = Buffer.from(JSON.stringify({ kind, id })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
export function readToken(token: string, kind: string): string | undefined {
  const [payload, supplied, extra] = token.split('.');
  if (!payload || !supplied || extra) return;
  const expected = signature(payload);
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return;
  try { const value = JSON.parse(Buffer.from(payload, 'base64url').toString()); return value.kind === kind && typeof value.id === 'string' ? value.id : undefined; } catch { return; }
}
export function staffCookie(): string { return `juniper_session=${signToken('staff', String(Date.now() + 8 * 3_600_000))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`; }
export function validSession(cookie = ''): boolean {
  const token = cookie.split(';').map(part => part.trim()).find(part => part.startsWith('juniper_session='))?.slice('juniper_session='.length);
  const deadline = token ? readToken(token, 'staff') : undefined;
  return !!deadline && Number(deadline) > Date.now();
}
