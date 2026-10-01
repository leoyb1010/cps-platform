import { describe, expect, it } from 'vitest';
import { createToast, expireToast } from './toast.js';
describe('explicit notification status',()=>{
  it('preserves the default and never guesses severity from localized message text',()=>{
    expect(createToast('素材生成失败')).toEqual({message:'素材生成失败',variant:'success'});
    expect(createToast('Temporary outage','error')).toEqual({message:'Temporary outage',variant:'error'});
  });
  it('does not let an older expiry erase a newer failure notification',()=>{
    const older=createToast('Copied');const latest=createToast('Unavailable','error');
    expect(expireToast(latest,older)).toBe(latest);
    expect(expireToast(latest,latest)).toBeNull();
  });
});
