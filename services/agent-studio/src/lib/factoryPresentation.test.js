import { describe, it, expect } from 'vitest';
import { factoryPreview } from './factoryPresentation.js';
const result = (title, body) => ({ result: { type: 'social_pack', pack: { title, platformCopy: { xhs: { body } } } } });
describe('factory result presentation', () => {
  it('uses configured human label and only suppresses an exactly repeated first title line', () => {
    const input = result('Member renewal', 'Member renewal\r\n\r\nReview actual usage.\nMember renewal remains mentioned here.');
    expect(factoryPreview(input, 'xhs', [{ id: 'social_pack', label: '社媒文案包' }])).toEqual({ title: 'Member renewal', body: 'Review actual usage.\nMember renewal remains mentioned here.', type: 'social_pack', label: '社媒文案包' });
    expect(input.result.pack.platformCopy.xhs.body).toMatch(/^Member renewal/);
  });
  it('retains independent title and body content without fuzzy deletion', () => {
    expect(factoryPreview(result('Title', 'Title expanded\nBody'), 'xhs').body).toBe('Title expanded\nBody');
  });
  it('handles title-only and malformed legacy fields without throwing', () => {
    expect(factoryPreview(result('Title', undefined), 'xhs').body).toBe('');
    expect(factoryPreview(result(42, { text: 'No string body' }), 'xhs').title).toBe('');
    expect(factoryPreview(result('Title', 'Title'), 'xhs').body).toBe('');
  });
});
