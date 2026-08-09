import { ed25519 } from '@noble/curves/ed25519';

/**
 * 将十六进制字符串转换为 Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  hex = hex.replace(/^0x/, '').trim();
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * 将 Uint8Array 转换为十六进制字符串
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export class Ed25519 {
  private publicKey: Uint8Array;
  private privateKey: Uint8Array; // 32 字节种子

  constructor(secret: string) {
    // 官方算法（见 QQ 开放平台 webhook 文档 Go 示例）：
    // 将 secret 的 UTF-8 字节【重复】填充至 >=32 字节，再截断为 32 字节作为 Ed25519 种子。
    // 注意：不足 32 字节时是"重复自身"而不是"补零"，否则生成的密钥对与平台不一致。
    const bytes = new TextEncoder().encode(secret);
    if (bytes.length === 0) {
      throw new Error('Ed25519: secret must not be empty');
    }
    let expanded = new Uint8Array(0);
    while (expanded.length < 32) {
      const tmp = new Uint8Array(expanded.length + bytes.length);
      tmp.set(expanded);
      tmp.set(bytes, expanded.length);
      expanded = tmp;
    }
    const seed = expanded.slice(0, 32);
    this.privateKey = seed;
    // 从种子生成公钥
    this.publicKey = ed25519.getPublicKey(this.privateKey);
  }

  /**
   * 验证 Webhook 事件签名（OpCode 0 推送）
   * 官方规则：对 `timestamp + body` 原文做 Ed25519 验签
   * （timestamp 取请求头 X-Signature-Timestamp，签名取 X-Signature-Ed25519）
   */
  verifyWebhookSignature(signature: string, timestamp: string, body: string): boolean {
    try {
      const signatureBytes = hexToBytes(signature);
      const messageBytes = new TextEncoder().encode(timestamp + body);
      const valid = ed25519.verify(signatureBytes, messageBytes, this.publicKey);
      if (!valid) {
        console.error('[Ed25519] ❌ Signature invalid');
        console.error('[Ed25519] Timestamp:', timestamp);
        console.error('[Ed25519] Body (first 200):', body.substring(0, 200));
      }
      return valid;
    } catch (error) {
      console.error('[Ed25519] ❌ Verification error:', error);
      return false;
    }
  }

  /**
   * 签名消息（用于 OpCode 13 回调验证）
   */
  sign(message: string): string {
    const messageBytes = new TextEncoder().encode(message);
    const sig = ed25519.sign(messageBytes, this.privateKey);
    return bytesToHex(sig);
  }
}