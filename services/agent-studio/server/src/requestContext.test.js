import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { resolveRequestContext } from './requestContext.js';

afterEach(()=>vi.unstubAllEnvs());
const context=headers=>({req:{header:name=>headers[name]}});
describe('gateway identity boundaries',()=>{
  it('configured gateway rejects missing, forged and malformed signature',()=>{
    vi.stubEnv('AIGC_INTERNAL_SECRET','synthetic-test-secret');
    for(const headers of [{},{'x-internal-workspace-id':'victim','x-internal-user-id':'user','x-internal-sign':'a'.repeat(64)}])
      expect(()=>resolveRequestContext(context(headers))).toThrow('Valid gateway identity required');
  });
  it('signed tenants stay separate and unsigned production fails closed',()=>{
    const secret='synthetic-test-secret';
    vi.stubEnv('AIGC_INTERNAL_SECRET',secret);
    for(const workspace of ['brand-one','brand-two']){
      const signature=createHmac('sha256',secret).update(`${workspace}\nuser`).digest('hex');
      expect(resolveRequestContext(context({'x-internal-workspace-id':workspace,'x-internal-user-id':'user','x-internal-sign':signature})))
        .toMatchObject({workspaceId:workspace,isAuthenticated:true});
      expect(()=>resolveRequestContext(context({'x-internal-workspace-id':workspace,'x-internal-user-id':'user','x-internal-sign':signature+'zz'}))).toThrow();
    }
    vi.stubEnv('AIGC_INTERNAL_SECRET','');vi.stubEnv('NODE_ENV','production');
    expect(()=>resolveRequestContext(context({}))).toThrow('Gateway identity is not configured');
  });
  it('nonproduction local demo ignores client-selected tenant fields',()=>{
    vi.stubEnv('AIGC_INTERNAL_SECRET','');vi.stubEnv('NODE_ENV','test');
    expect(resolveRequestContext(context({'x-workspace-id':'victim'}),{workspaceId:'victim'}))
      .toMatchObject({workspaceId:'default',isAuthenticated:false});
  });
});
