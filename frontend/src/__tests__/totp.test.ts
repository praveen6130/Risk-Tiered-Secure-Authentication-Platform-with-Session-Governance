import { describe, it, expect } from 'vitest';
import { generateTOTPCode, verifyTOTPCode, getCurrentTOTP, buildTOTPUri, generateQRCodeDataUrl } from '../utils/totp';

describe('TOTP Utility', () => {
  it('generates a 6-digit numeric TOTP code', () => {
    const code = generateTOTPCode('JBSWY3DPEHPK3PXP');
    expect(code).toMatch(/^\d{6}$/);
  });

  it('verifies the current code successfully', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const code = generateTOTPCode(secret, 0);
    expect(verifyTOTPCode(secret, code)).toBe(true);
  });

  it('verifies code within window tolerance', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const previousCode = generateTOTPCode(secret, -1);
    const nextCode = generateTOTPCode(secret, 1);
    expect(verifyTOTPCode(secret, previousCode)).toBe(true);
    expect(verifyTOTPCode(secret, nextCode)).toBe(true);
  });

  it('rejects invalid codes', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(verifyTOTPCode(secret, '000000')).toBe(false);
    expect(verifyTOTPCode(secret, '12345')).toBe(false);
  });

  it('returns current TOTP with seconds remaining', () => {
    const info = getCurrentTOTP('JBSWY3DPEHPK3PXP');
    expect(info.code).toMatch(/^\d{6}$/);
    expect(info.seconds_remaining).toBeGreaterThanOrEqual(1);
    expect(info.seconds_remaining).toBeLessThanOrEqual(30);
  });

  it('generates a valid QR code data URL', async () => {
    const uri = buildTOTPUri('JBSWY3DPEHPK3PXP', 'test@example.com');
    const dataUrl = await generateQRCodeDataUrl(uri);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
