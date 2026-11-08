/**
 * QQ Bot HTTP API 客户端
 * 获取 Token → 发送消息
 */

export interface QQBotToken {
  access_token: string;
  expires_in: number;
  fetched_at: number;
}

export interface SendMessagePayload {
  content: string;
  msg_type?: number;       // 0=文本, 2=Markdown
  msg_id?: string;
  msg_seq?: number;
  image?: string;          // 图片URL
  event_id?: string;       // 被动回复时需要
}

export class QQBotAPIClient {
  private token: QQBotToken | null = null;
  private baseUrl = 'https://api.sgroup.qq.com';
  // 同一个 msg_id 的多条被动回复必须让 msg_seq 递增；相同 msg_id + msg_seq
  // 会被平台判为重复消息（40054005 / 消息被去重），表现为「第二条回复发不出去」。
  private msgSeqByMsgId = new Map<string, number>();

  private nextMsgSeq(msgId?: string): number {
    if (!msgId) return 1;
    const next = (this.msgSeqByMsgId.get(msgId) || 0) + 1;
    this.msgSeqByMsgId.set(msgId, next);
    if (this.msgSeqByMsgId.size > 500) {
      const oldest = this.msgSeqByMsgId.keys().next().value;
      if (oldest !== undefined) this.msgSeqByMsgId.delete(oldest);
    }
    return next;
  }

  constructor(
    private appId: string,
    private clientSecret: string
  ) {}

  // ===== Token 管理 =====

  private async getAccessToken(): Promise<string> {
    // 缓存未过期直接用
    if (this.token && !this.isTokenExpired()) {
      return this.token.access_token;
    }

    console.log('[QQBot API] Fetching access token...');
    const res = await fetch('https://bots.qq.com/app/getAppAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: this.appId,
        clientSecret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      throw new Error(`获取 Token 失败: ${res.status} ${await res.text()}`);
    }

    const data = await res.json() as any;
    this.token = {
      access_token: data.access_token,
      expires_in: data.expires_in || 7200,
      fetched_at: Date.now(),
    };

    console.log('[QQBot API] Token obtained, expires in', data.expires_in, 's');
    return this.token.access_token;
  }

  private isTokenExpired(): boolean {
    if (!this.token) return true;
    const elapsed = (Date.now() - this.token.fetched_at) / 1000;
    return elapsed > (this.token.expires_in - 60); // 提前 60s 刷新
  }

  // ===== 发送消息 =====

  /**
   * 发送私聊消息
   */
  async sendC2CMessage(openId: string, content: string, msgId?: string): Promise<any> {
    return this.sendMessage(`/v2/users/${openId}/messages`, content, msgId);
  }

  /**
   * 发送群聊消息
   */
  async sendGroupMessage(groupOpenId: string, content: string, msgId?: string): Promise<any> {
    return this.sendMessage(`/v2/groups/${groupOpenId}/messages`, content, msgId);
  }

  /**
   * 发送私聊图片
   */
  async sendC2CImage(openId: string, imageUrl: string, msgId?: string): Promise<any> {
    return this.sendImageMessage(`/v2/users/${openId}`, imageUrl, msgId);
  }

  /**
   * 发送群聊图片
   */
  async sendGroupImage(groupOpenId: string, imageUrl: string, msgId?: string): Promise<any> {
    return this.sendImageMessage(`/v2/groups/${groupOpenId}`, imageUrl, msgId);
  }

  /**
   * 被动回复（无需主动获取 Token，直接回复 Webhook 请求）
   */
  async sendPassiveReply(openId: string, content: string, msgId: string): Promise<any> {
    return this.sendMessage(`/v2/users/${openId}/messages`, content, msgId);
  }

  // ===== 底层发送 =====

  private async sendMessage(path: string, content: string, msgId?: string): Promise<any> {
    const token = await this.getAccessToken();

    const body: any = {
      content,
      msg_type: 0,
      msg_seq: this.nextMsgSeq(msgId),
    };
    if (msgId) body.msg_id = msgId;

    console.log(`[QQBot API] Sending to ${path}`);

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `QQBot ${token}`,
      },
      body: JSON.stringify(body),
    });

    // 2xx 但响应体为空/非 JSON 时，res.json() 会抛错。旧代码在这里抛出去会让
    // deliverReply 误判「被动回复失败」并降级为主动消息再发一遍 —— 用户就会收到
    // 两条一模一样的回复。发送是否成功只看 HTTP 状态，响应体解析失败不影响结论。
    let result: any = {};
    try { result = await res.json() as any; } catch { /* 空响应也算发送成功 */ }
    console.log(`[QQBot API] Response ${res.status}:`, JSON.stringify(result).substring(0, 200));
    if (!res.ok) {
      // 必须抛出：否则调用方会误以为消息已送达，日志里还会打印 "Reply sent OK"，
      // 平台返回 40034105/40034005 之类的错误时表现为「机器人完全不回」。
      const detail = result?.message || result?.msg || result?.code || JSON.stringify(result);
      throw new Error(`QQ 消息发送失败 ${res.status}: ${detail}`);
    }
    return result;
  }

  // ===== 图片发送（富媒体 msg_type=7，两步式）=====

  /**
   * 发送图片消息
   * 官方协议两步走：
   * 1) POST {basePath}/files  —— 把图片 URL 提交给平台，平台下载并存储，返回 file_info
   * 2) POST {basePath}/messages —— 携带 file_info 发送 msg_type=7 的富媒体消息
   * 注意：imageUrl 必须是 QQ 平台服务器能公网访问的 HTTPS 直链（jpg/png）
   */
  private async sendImageMessage(basePath: string, imageUrl: string, msgId?: string): Promise<any> {
    const token = await this.getAccessToken();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `QQBot ${token}`,
    };

    // 第一步：上传媒体文件
    const uploadBody: any = {
      file_type: 1,          // 1=图片
      url: imageUrl,
      srv_send_msg: false,   // 不立即发送，仅存储
    };
    if (msgId) uploadBody.msg_id = msgId;

    console.log(`[QQBot API] Uploading image to ${basePath}/files:`, imageUrl);
    const upRes = await fetch(`${this.baseUrl}${basePath}/files`, {
      method: 'POST',
      headers,
      body: JSON.stringify(uploadBody),
    });
    const upResult = await upRes.json() as any;
    console.log(`[QQBot API] Upload response ${upRes.status}:`, JSON.stringify(upResult).substring(0, 200));
    if (!upRes.ok || !upResult.file_info) {
      throw new Error(`图片上传失败: ${upRes.status} ${JSON.stringify(upResult)}`);
    }

    // 第二步：发送富媒体消息
    const body: any = {
      msg_type: 7,
      msg_seq: this.nextMsgSeq(msgId),
      media: { file_info: upResult.file_info },
    };
    if (msgId) body.msg_id = msgId;

    console.log(`[QQBot API] Sending image message to ${basePath}/messages`);
    const res = await fetch(`${this.baseUrl}${basePath}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const result = await res.json() as any;
    console.log(`[QQBot API] Image response ${res.status}:`, JSON.stringify(result).substring(0, 200));
    if (!res.ok) {
      throw new Error(`图片消息发送失败: ${res.status} ${JSON.stringify(result)}`);
    }
    return result;
  }
}