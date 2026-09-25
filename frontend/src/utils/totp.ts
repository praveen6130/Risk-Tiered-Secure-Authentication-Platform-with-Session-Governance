import QRCode from 'qrcode';

// Standard SHA-1 implementation
function sha1(data: Uint8Array): Uint8Array {
  const originalBitLen = data.length * 8;
  const withOne = new Uint8Array(data.length + 1);
  withOne.set(data);
  withOne[data.length] = 0x80;

  let newLen = withOne.length;
  while (newLen % 64 !== 56) {
    newLen++;
  }
  const padded = new Uint8Array(newLen + 8);
  padded.set(withOne);
  const view = new DataView(padded.buffer);
  view.setUint32(newLen, Math.floor(originalBitLen / 0x100000000), false);
  view.setUint32(newLen + 4, originalBitLen >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (v << 1) | (v >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f = 0;
      let k = 0;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const result = new Uint8Array(20);
  const outView = new DataView(result.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  return result;
}

// Standard HMAC-SHA1
function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;
  let formattedKey = key;
  if (formattedKey.length > blockSize) {
    formattedKey = sha1(formattedKey);
  }
  if (formattedKey.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(formattedKey);
    formattedKey = padded;
  }

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = formattedKey[i] ^ 0x5c;
    iKeyPad[i] = formattedKey[i] ^ 0x36;
  }

  const inner = new Uint8Array(iKeyPad.length + message.length);
  inner.set(iKeyPad);
  inner.set(message, iKeyPad.length);
  const innerHash = sha1(inner);

  const outer = new Uint8Array(oKeyPad.length + innerHash.length);
  outer.set(oKeyPad);
  outer.set(innerHash, oKeyPad.length);
  return sha1(outer);
}

// Base32 decode
export function base32ToBytes(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = (base32 || '').toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Generate standard RFC 6238 TOTP code (matches Google Authenticator & pyotp)
 */
export function generateTOTPCode(secret: string = 'JBSWY3DPEHPK3PXP', offsetSteps: number = 0): string {
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30) + offsetSteps;

  const msg = new Uint8Array(8);
  const view = new DataView(msg.buffer);
  view.setUint32(0, Math.floor(timeStep / 0x100000000), false);
  view.setUint32(4, timeStep >>> 0, false);

  const key = base32ToBytes(secret);
  const hash = hmacSha1(key, msg);

  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Get current TOTP info including seconds remaining in 30s period
 */
export function getCurrentTOTP(secret: string = 'JBSWY3DPEHPK3PXP'): {
  code: string;
  seconds_remaining: number;
  secret: string;
} {
  const epoch = Math.floor(Date.now() / 1000);
  const secondsRemaining = 30 - (epoch % 30);
  const code = generateTOTPCode(secret, 0);
  return {
    code,
    seconds_remaining: secondsRemaining === 0 ? 30 : secondsRemaining,
    secret,
  };
}

/**
 * Verify a TOTP code against a secret with window tolerance (default +-1 step = +-30s)
 */
export function verifyTOTPCode(secret: string, inputCode: string, window: number = 1): boolean {
  if (!inputCode || inputCode.length !== 6) return false;
  const cleanCode = inputCode.trim();

  for (let offset = -window; offset <= window; offset++) {
    if (generateTOTPCode(secret, offset) === cleanCode) {
      return true;
    }
  }
  return false;
}

/**
 * Build standard otpauth URI for TOTP
 */
export function buildTOTPUri(secret: string, email: string = 'user@example.com', issuer: string = 'RiskAuth'): string {
  const encodedEmail = encodeURIComponent(email);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generate QR code data URL (PNG) from an otpauth URI
 */
export async function generateQRCodeDataUrl(uri: string): Promise<string> {
  try {
    return await QRCode.toDataURL(uri, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.error('Failed to generate QR code data URL:', err);
    return generateQRCodeSvgDataUri(uri);
  }
}

/**
 * Synchronous QR code generator that produces a crisp SVG data URI
 */
export function generateQRCodeSvgDataUri(uri: string): string {
  try {
    const qr = QRCode.create(uri, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const data = qr.modules.data;
    let path = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (data[r * size + c]) {
          path += `M${c + 4} ${r + 4}h1v1h-1z `;
        }
      }
    }
    const total = size + 8;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path.trim()}" fill="#000000"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch (err) {
    console.error('Failed to generate QR code SVG:', err);
    return '';
  }
}

