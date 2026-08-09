import { Ed25519 } from './ed25519.bundle.mjs';

// 1) 官方文档示例：secret=DG5g3B4j9X2KOErG, 对 event_ts+plain_token 签名
const e = new Ed25519('DG5g3B4j9X2KOErG');
const expected = '87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706';
const sig = e.sign('1725442341' + 'Arq0D5A61EgUu4OxUvOp');
console.log('OpCode 13 签名与官方示例一致:', sig === expected ? '✅ PASS' : '❌ FAIL\n' + sig);

// 2) 模拟平台推送 op 0 事件：平台用同密钥签 timestamp+body，Worker 应验签通过
const body = JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { content: '你好' } });
const ts = '1725442400';
const eventSig = e.sign(ts + body);
console.log('op 0 事件验签(正确密钥):', e.verifyWebhookSignature(eventSig, ts, body) ? '✅ PASS' : '❌ FAIL');

// 3) 篡改 body 应验签失败
console.log('篡改 body 应被拒绝:', e.verifyWebhookSignature(eventSig, ts, body + ' ') === false ? '✅ PASS' : '❌ FAIL');

// 4) 16 字节与超长 secret 的种子派生
const long = new Ed25519('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghij'); // 46 字节，应截断
const s2 = long.sign('msg');
console.log('长 secret 签名/验签往返:', long.verifyWebhookSignature(s2, '', 'msg') ? '✅ PASS' : '❌ FAIL');
