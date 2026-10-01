import { createHmac, timingSafeEqual } from 'node:crypto';

// Preserve the historical storage keys for CPS's real A-<digits> and U-<hex>
// namespaces, but reserve their lowercase aliases so a second identity cannot
// claim the same key. Other IDs must already be canonical: no lossy transform.
function storageIdentity(value, kind) {
  if (typeof value !== 'string' || !value || value.length > 80) return null;
  if (kind === 'workspace' && /^agent-A-[0-9]+$/.test(value)) return value.toLowerCase();
  if (kind === 'user' && /^U-[0-9a-f]+$/.test(value)) return value.toLowerCase();
  if (kind === 'workspace' && /^agent-a-[0-9]+$/.test(value)) return null;
  if (kind === 'user' && /^u-[0-9a-f]+$/.test(value)) return null;
  if (!/^[a-z0-9_.-]+$/.test(value) || value.includes('--') || value === '.' || value === '..') return null;
  return value;
}

export function decodeGatewayIdentity(secret, workspace, user, signature) {
  if (!secret || !workspace || !user || !/^[a-f0-9]{64}$/i.test(String(signature || ''))) return null;
  const expected = createHmac('sha256', secret).update(`${workspace}\n${user}`).digest();
  const received = Buffer.from(signature, 'hex');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  const workspaceId = storageIdentity(workspace, 'workspace');
  const userId = storageIdentity(user, 'user');
  if (!workspaceId || !userId) throw new Error('Noncanonical gateway identity');
  return { workspaceId, userId };
}
