function toUtf8Bytes(str) {
  const bytes = [];
  const text = String(str || '');

  for (let index = 0; index < text.length; index++) {
    let code = text.charCodeAt(index);

    if (code < 0x80) {
      bytes.push(code);
      continue;
    }

    if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
      continue;
    }

    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index++;
        bytes.push(0xf0 | (code >> 18));
        bytes.push(0x80 | ((code >> 12) & 0x3f));
        bytes.push(0x80 | ((code >> 6) & 0x3f));
        bytes.push(0x80 | (code & 0x3f));
        continue;
      }
    }

    bytes.push(0xe0 | (code >> 12));
    bytes.push(0x80 | ((code >> 6) & 0x3f));
    bytes.push(0x80 | (code & 0x3f));
  }

  return bytes;
}

function leftRotate(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function sha1(inputBytes) {
  const bytes = Array.isArray(inputBytes) ? inputBytes.slice() : [];
  const bitLength = bytes.length * 8;

  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }

  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  bytes.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff);
  bytes.push((low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array(80);

    for (let i = 0; i < 16; i++) {
      const start = offset + i * 4;
      words[i] = (
        (bytes[start] << 24) |
        (bytes[start + 1] << 16) |
        (bytes[start + 2] << 8) |
        bytes[start + 3]
      ) >>> 0;
    }

    for (let i = 16; i < 80; i++) {
      words[i] = leftRotate(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
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
        f = (b & c) | ((~b) & d);
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

      const temp = (leftRotate(a, 5) + f + e + k + words[i]) >>> 0;
      e = d;
      d = c;
      c = leftRotate(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = [h0, h1, h2, h3, h4];
  const result = [];
  digest.forEach(word => {
    result.push((word >>> 24) & 0xff);
    result.push((word >>> 16) & 0xff);
    result.push((word >>> 8) & 0xff);
    result.push(word & 0xff);
  });
  return result;
}

function bytesToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index];
    const byte2 = index + 1 < bytes.length ? bytes[index + 1] : NaN;
    const byte3 = index + 2 < bytes.length ? bytes[index + 2] : NaN;
    const chunk = ((byte1 || 0) << 16) | ((byte2 || 0) << 8) | (byte3 || 0);

    output += chars[(chunk >> 18) & 0x3f];
    output += chars[(chunk >> 12) & 0x3f];
    output += Number.isNaN(byte2) ? '=' : chars[(chunk >> 6) & 0x3f];
    output += Number.isNaN(byte3) ? '=' : chars[chunk & 0x3f];
  }

  return output;
}

function hmacSha1Base64(key, message) {
  let keyBytes = toUtf8Bytes(key);
  const messageBytes = toUtf8Bytes(message);
  const blockSize = 64;

  if (keyBytes.length > blockSize) {
    keyBytes = sha1(keyBytes);
  }

  while (keyBytes.length < blockSize) {
    keyBytes.push(0);
  }

  const innerPad = [];
  const outerPad = [];
  for (let index = 0; index < blockSize; index++) {
    innerPad.push(keyBytes[index] ^ 0x36);
    outerPad.push(keyBytes[index] ^ 0x5c);
  }

  const innerHash = sha1(innerPad.concat(messageBytes));
  const finalHash = sha1(outerPad.concat(innerHash));
  return bytesToBase64(finalHash);
}

module.exports = {
  hmacSha1Base64
};
