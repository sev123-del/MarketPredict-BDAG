// convertWIFtoHex_nopkg.js
// Usage (PowerShell): $env:PRIVATE_KEY="C0a..." ; node convertWIFtoHex_nopkg.js
// Usage (cmd): set PRIVATE_KEY=C0a... && node convertWIFtoHex_nopkg.js
// Usage (Unix): PRIVATE_KEY="C0a..." node convertWIFtoHex_nopkg.js

const crypto = require('crypto');

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s) {
  const base = BigInt(58);
  let num = BigInt(0);
  for (let i = 0; i < s.length; ++i) {
    const ch = s[i];
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base58 character: " + ch);
    num = num * base + BigInt(idx);
  }
  // convert bigint to Buffer
  let hex = num.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let buf = Buffer.from(hex, 'hex');

  // handle leading zeros (base58 '1' => 0x00)
  let leadingOnes = 0;
  for (let i = 0; i < s.length && s[i] === '1'; i++) leadingOnes++;
  if (leadingOnes > 0) {
    buf = Buffer.concat([Buffer.alloc(leadingOnes), buf]);
  }
  return buf;
}

function doubleSHA256(buf) {
  return crypto.createHash('sha256').update(
    crypto.createHash('sha256').update(buf).digest()
  ).digest();
}

function wifToHex(wifString) {
  // decode base58check
  const decoded = base58Decode(wifString);
  if (decoded.length < 5) throw new Error("Decoded WIF too short");

  const payload = decoded.slice(0, decoded.length - 4);
  const checksum = decoded.slice(decoded.length - 4);

  const actualChecksum = doubleSHA256(payload).slice(0, 4);
  if (!actualChecksum.equals(checksum)) throw new Error("Invalid WIF checksum");

  // WIF structure: [version(1)] + privateKey(32) [+ 0x01 if compressed]
  const version = payload[0];
  if (!(version === 0x80 || version === 0xEF || version === 0xC0 || version === 0x23 || version === 0xB0)) {
    // common versions: 0x80 (BTC mainnet), 0xEF (BTC testnet), but some altchains use other prefixes.
    // We'll not fail hard here; just warn.
    // (BlockDAG or others may use different prefix — still we can extract privateKey if layout matches.)
    // continue
  }

  // determine if compressed (last byte === 0x01)
  let privateKey;
  if (payload.length === 34 && payload[payload.length - 1] === 0x01) {
    // prefix + 32 + compressed flag
    privateKey = payload.slice(1, 33);
  } else if (payload.length === 33) {
    // prefix + 32
    privateKey = payload.slice(1, 33);
  } else {
    // Some formats might include extra prefix sizes; try to be permissive:
    // If payload length >= 33, extract bytes 1..32
    if (payload.length >= 33) {
      privateKey = payload.slice(1, 33);
    } else {
      throw new Error("Unexpected WIF payload length: " + payload.length);
    }
  }

  return "0x" + privateKey.toString('hex');
}

// Main
try {
  const WIF = process.env.PRIVATE_KEY;
  if (!WIF) {
    console.error("ERROR: set environment variable PRIVATE_KEY (the WIF string) before running.");
    console.error('PowerShell example: $env:PRIVATE_KEY="C0a..." ; node convertWIFtoHex_nopkg.js');
    process.exit(1);
  }
  const hex = wifToHex(WIF.trim());
  console.log("✅ Raw hex private key (paste this into your .env as PRIVATE_KEY):");
  console.log(hex);
} catch (e) {
  console.error("❌ Conversion failed:", e.message);
  process.exit(2);
}
