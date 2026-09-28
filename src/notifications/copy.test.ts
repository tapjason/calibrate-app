import { digestBody, reminderBody } from './copy';

describe('reminderBody', () => {
  // The stated confidence rides along so a resolve from the notification
  // still sees what was said before the outcome (DESIGN_SYSTEM §7.10).
  it('carries the stated confidence', () => {
    expect(reminderBody('Ship the beta', 70)).toBe('Ship the beta · You said 70%');
  });

  it('trims the title, never the confidence, to stay within 80 chars', () => {
    const body = reminderBody('a'.repeat(200), 85);
    expect(body.length).toBeLessThanOrEqual(80);
    expect(body.endsWith('… · You said 85%')).toBe(true);
  });
});

describe('digestBody', () => {
  it('never mentions the streak or tells the user what to tap', () => {
    for (const n of [0, 1, 5]) {
      expect(digestBody(n)).not.toMatch(/streak|tap/i);
    }
  });

  it('counts open predictions in plain sentences', () => {
    expect(digestBody(1)).toBe('1 prediction is open.');
    expect(digestBody(3)).toBe('3 predictions are open.');
  });
});
