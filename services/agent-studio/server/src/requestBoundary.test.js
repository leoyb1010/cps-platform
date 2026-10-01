import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createHmac } from 'node:crypto';
import { enforceRequestBoundary } from './requestBoundary.js';

afterEach(()=>vi.unstubAllEnvs());
const app=()=>{const a=new Hono();a.use('/api/*',enforceRequestBoundary);a.all('/api/*',c=>c.json({ok:true}));return a};
describe('legacy Studio gateway boundary',()=>{
  it('configured service rejects unsigned mutations before handlers',async()=>{
    vi.stubEnv('AIGC_INTERNAL_SECRET','fixture-secret');expect((await app().request('http://localhost/api/autopilot/tick',{method:'POST'})).status).toBe(401);
  });
  it('signed tenant may use factory but not shared legacy state',async()=>{
    const secret='fixture-secret';vi.stubEnv('AIGC_INTERNAL_SECRET',secret);
    const headers={'x-internal-workspace-id':'brand-one','x-internal-user-id':'fixture','x-internal-sign':createHmac('sha256',secret).update('brand-one\nfixture').digest('hex')};
    expect((await app().request('http://localhost/api/factory/jobs',{headers})).status).toBe(200);
    expect((await app().request('http://localhost/api/autopilot',{headers})).status).toBe(403);
  });
  it('local demo rejects cross-origin simple requests and rebinding hosts',async()=>{
    vi.stubEnv('AIGC_INTERNAL_SECRET','');vi.stubEnv('NODE_ENV','test');
    expect((await app().request('http://localhost/api/autopilot/tick',{method:'POST',headers:{origin:'https://evil.example'}})).status).toBe(403);
    expect((await app().request('http://evil.example/api/autopilot')).status).toBe(403);
    expect((await app().request('http://localhost/api/autopilot',{headers:{origin:'http://localhost:45173'}})).status).toBe(200);
  });
});
