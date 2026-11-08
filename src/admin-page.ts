/**
 * 管理后台单页 HTML（内联 CSS/JS，无外部资源，遵守 admin.ts 的 CSP）。
 * 以字符串形式导出，由 handleAdmin 的 GET /admin 直接返回。
 * 注意：这里刻意不使用 JS 模板字符串，避免与外层 TS 模板字符串的插值语法冲突。
 */
export const ADMIN_PAGE_HTML = `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title>昔涟 · 控制台</title>
<style>
:root{
  --bg:#0a0d16;--bg2:#0e1320;--surface:#151c2c;--surface2:#1a2335;--surface3:#222d43;
  --border:#27324a;--border2:#33415e;--text:#e9eefb;--muted:#93a0bb;--faint:#64718c;
  --accent:#8b7cf6;--accent2:#54c8c0;--grad:linear-gradient(120deg,#8b7cf6,#54c8c0);
  --ok:#4ec9a0;--warn:#e8b465;--danger:#ef7b88;--shadow:0 12px 40px rgba(0,0,0,.30);
  --r:14px;--r-sm:9px;
}
html[data-theme="light"]{
  --bg:#f4f6fc;--bg2:#eef1f9;--surface:#fff;--surface2:#f7f9fd;--surface3:#eef2fa;
  --border:#e0e6f1;--border2:#ccd6e8;--text:#1a2338;--muted:#5f6d88;--faint:#8a97ad;
  --accent:#6d5be0;--accent2:#189e97;--ok:#1d9c72;--warn:#b9832c;--danger:#d4516a;
  --shadow:0 10px 32px rgba(30,45,90,.09);
}
*{box-sizing:border-box}
/* 必须带 !important：下面 .login-wrap / .shell / .modal 都显式写了 display，
   浏览器默认的 [hidden]{display:none} 会被作者样式覆盖。缺这条规则时全屏 modal
   遮罩会一直挡住页面（登录框点不到、输不了字），登录成功后登录卡片也不会消失。 */
[hidden]{display:none!important}
html,body{margin:0;min-height:100%}
body{font:14px/1.6 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}
button,input,textarea,select{font:inherit;color:inherit}
button{cursor:pointer}
a{color:var(--accent)}
::selection{background:rgba(139,124,246,.35)}
::-webkit-scrollbar{width:9px;height:9px}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:8px}
::-webkit-scrollbar-track{background:transparent}

/* ---------- 登录 ---------- */
.login-wrap{min-height:100vh;display:grid;place-items:center;padding:24px;position:relative;overflow:hidden;
  background:radial-gradient(900px 520px at 15% -10%,rgba(139,124,246,.20),transparent 60%),
             radial-gradient(760px 480px at 90% 110%,rgba(84,200,192,.16),transparent 60%),var(--bg)}
.login-wrap:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.35;
  background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:44px 44px}
html[data-theme="light"] .login-wrap:before{background-image:linear-gradient(rgba(30,45,90,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(30,45,90,.045) 1px,transparent 1px)}
.login-card{position:relative;width:min(420px,100%);padding:38px 34px 30px;border:1px solid var(--border);border-radius:20px;
  background:var(--surface);box-shadow:var(--shadow);animation:rise .45s cubic-bezier(.2,.8,.2,1)}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.brand-mark{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--grad);color:#fff;font-size:26px;
  box-shadow:0 8px 24px rgba(139,124,246,.35);margin-bottom:20px}
.login-card h1{font-size:23px;margin:0 0 6px;letter-spacing:.5px}
.login-card .sub{color:var(--muted);margin:0 0 26px;font-size:13px}
.field-label{display:block;font-size:12px;color:var(--muted);margin:0 0 8px;font-weight:600;letter-spacing:.3px}
.pw-row{display:flex;gap:8px;margin-bottom:10px}
.pw-row input{flex:1;min-width:0}
.pw-toggle{padding:0 14px;border-radius:var(--r-sm);border:1px solid var(--border2);background:var(--surface2);color:var(--muted);font-size:12px;white-space:nowrap}
.pw-toggle:hover{color:var(--text);border-color:var(--accent)}
.login-err{min-height:20px;color:var(--danger);font-size:12px;margin:2px 0 8px}
.login-hint{font-size:11.5px;color:var(--faint);line-height:1.7;margin:20px 0 0;padding-top:16px;border-top:1px solid var(--border)}

/* ---------- 控件 ---------- */
input[type=text],input[type=password],input[type=number],textarea,select{width:100%;padding:10px 12px;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r-sm);outline:none;transition:border-color .15s,box-shadow .15s}
input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(139,124,246,.16)}
textarea{resize:vertical;line-height:1.7;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px}
input::placeholder,textarea::placeholder{color:var(--faint)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 16px;border-radius:var(--r-sm);border:1px solid var(--border2);
  background:var(--surface2);color:var(--text);font-size:13px;font-weight:600;white-space:nowrap;transition:transform .12s,border-color .15s,background .15s,opacity .15s}
.btn:hover{border-color:var(--accent);transform:translateY(-1px)}
.btn:active{transform:none}
.btn:disabled{opacity:.55;cursor:wait;transform:none}
.btn.primary{background:var(--grad);border:none;color:#fff;box-shadow:0 6px 20px rgba(139,124,246,.28)}
.btn.danger{color:var(--danger);border-color:rgba(239,123,136,.4)}
.btn.danger:hover{background:rgba(239,123,136,.12);border-color:var(--danger)}
.btn.ghost{background:transparent}
.btn.sm{padding:6px 11px;font-size:12px}
.btn.block{width:100%;padding:12px}
.btn svg,.nav-item svg,.stat-ico svg{width:16px;height:16px;flex:none}
.spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:600;
  background:var(--surface2);border:1px solid var(--border);color:var(--muted);white-space:nowrap}
.badge.ok{color:var(--ok);border-color:rgba(78,201,160,.3);background:rgba(78,201,160,.1)}
.badge.warn{color:var(--warn);border-color:rgba(232,180,101,.3);background:rgba(232,180,101,.1)}
.badge.off{color:var(--faint)}
.badge.free{color:var(--ok);border-color:rgba(78,201,160,.3);background:rgba(78,201,160,.1)}
.badge.danger{color:var(--danger);border-color:rgba(239,123,136,.3);background:rgba(239,123,136,.1)}
.dot{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px rgba(78,201,160,.16);display:inline-block}

/* ---------- 布局 ---------- */
.shell{display:flex;min-height:100vh}
.sidebar{width:238px;flex:none;display:flex;flex-direction:column;padding:22px 14px 16px;border-right:1px solid var(--border);
  background:var(--bg2);position:sticky;top:0;height:100vh}
.side-brand{display:flex;align-items:center;gap:10px;padding:0 10px 10px;font-size:15px;font-weight:700;letter-spacing:.4px}
.side-brand .m{width:30px;height:30px;border-radius:10px;background:var(--grad);display:grid;place-items:center;color:#fff;font-size:16px;flex:none}
.side-version{font-size:10.5px;color:var(--faint);padding:0 10px 8px;letter-spacing:.3px}
.nav{display:flex;flex-direction:column;gap:3px;flex:1;overflow-y:auto}
.side-label{font-size:10px;letter-spacing:1.3px;color:var(--faint);font-weight:700;padding:14px 12px 5px}
.side-label:first-child{padding-top:2px}
.nav-item{display:flex;align-items:center;gap:11px;width:100%;padding:9px 12px;border:1px solid transparent;border-radius:var(--r-sm);
  background:transparent;color:var(--muted);font-size:13px;font-weight:600;text-align:left;transition:background .15s,color .15s}
.nav-item:hover{background:var(--surface2);color:var(--text)}
.nav-item.active{background:linear-gradient(90deg,rgba(139,124,246,.18),rgba(84,200,192,.08));color:var(--text);border-color:rgba(139,124,246,.22)}
.nav-item.active svg{color:var(--accent)}
.nav-item .cnt{margin-left:auto;font-size:11px;color:var(--faint);font-weight:500}
.side-foot{border-top:1px solid var(--border);padding-top:14px;display:flex;flex-direction:column;gap:9px;font-size:12px;color:var(--muted)}
.side-foot .row{display:flex;align-items:center;gap:8px;padding:0 6px}
.side-foot .links{display:flex;gap:6px;padding:0 4px}
.side-foot .links button{flex:1;padding:6px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:11.5px}
.side-foot .links button:hover{color:var(--text);border-color:var(--accent)}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 28px 16px;border-bottom:1px solid var(--border);
  background:var(--bg);position:sticky;top:0;z-index:5}
.topbar h2{margin:0;font-size:19px;letter-spacing:.3px}
.topbar p{margin:3px 0 0;color:var(--faint);font-size:12px}
.crumb{font-size:10.5px;color:var(--faint);letter-spacing:.6px;margin-bottom:4px}
.top-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;justify-content:flex-end}
.content{padding:24px 28px 60px;max-width:1360px;width:100%;margin:0 auto}
.view{animation:fade .25s ease}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* ---------- 卡片 / 网格 ---------- */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;box-shadow:var(--shadow)}
.card + .card{margin-top:18px}
.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px;flex-wrap:wrap}
.card-head h3{margin:0;font-size:15px;letter-spacing:.2px}
.card-head p{margin:4px 0 0;color:var(--faint);font-size:12px;line-height:1.6}
.grid{display:grid;gap:16px}
.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.g3{grid-template-columns:repeat(3,minmax(0,1fr))}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}
.stat{position:relative;overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px 18px 16px}
.stat:before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:var(--grad);opacity:.7}
.stat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.stat-top .lb{font-size:12px;color:var(--muted);font-weight:600}
.stat-ico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--surface3);color:var(--accent)}
.stat-num{font-size:27px;font-weight:700;letter-spacing:-.5px;line-height:1.2;font-variant-numeric:tabular-nums}
.stat-sub{font-size:11.5px;color:var(--faint);margin-top:5px}

/* ---------- 表格 ---------- */
.tbl-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface)}
table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:520px}
th{text-align:left;padding:11px 14px;background:var(--surface2);color:var(--muted);font-size:11.5px;font-weight:600;letter-spacing:.3px;white-space:nowrap;border-bottom:1px solid var(--border)}
td{padding:11px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tbody tr:hover{background:var(--surface2)}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;word-break:break-all}
.muted{color:var(--muted)}
.faint{color:var(--faint)}
.empty{padding:38px 20px;text-align:center;color:var(--faint);font-size:13px;border:1px dashed var(--border2);border-radius:var(--r-sm)}
.bar{height:6px;border-radius:6px;background:var(--surface3);overflow:hidden;min-width:90px}
.bar > i{display:block;height:100%;border-radius:6px;background:var(--grad)}
.row-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}

/* ---------- 开关 / 表单 ---------- */
.switch{display:inline-flex;align-items:center;gap:10px;cursor:pointer;user-select:none;flex:none}
.switch input{position:absolute;opacity:0;width:0;height:0}
.switch .track{width:38px;height:22px;border-radius:99px;background:var(--surface3);border:1px solid var(--border2);position:relative;transition:background .2s;flex:none}
.switch .track:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--muted);transition:transform .2s,background .2s}
.switch input:checked + .track{background:linear-gradient(120deg,rgba(139,124,246,.85),rgba(84,200,192,.85));border-color:transparent}
.switch input:checked + .track:after{transform:translateX(16px);background:#fff}
.tool-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 0;border-bottom:1px solid var(--border)}
.tool-row:last-child{border-bottom:none}
.tool-row .name{font-weight:600;font-size:13.5px}
.tool-row .desc{font-size:12px;color:var(--faint);margin-top:3px;line-height:1.6}
.hint-box{background:var(--surface2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--r-sm);padding:13px 15px;font-size:12.5px;color:var(--muted);line-height:1.8}
.hint-box b{color:var(--text)}
.kv{display:grid;grid-template-columns:150px 1fr;gap:10px 16px;font-size:12.5px}
.kv dt{color:var(--muted)}
.kv dd{margin:0;word-break:break-all}
.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{padding:5px 10px;border-radius:7px;background:var(--surface2);border:1px solid var(--border);font-size:11.5px;font-family:ui-monospace,Consolas,monospace}
.chip.alt{border-style:dashed;color:var(--muted)}

/* ---------- 用量图 ---------- */
.provider-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-4px 0 18px}
.provider-line .pl-label{font-size:12px;color:var(--faint)}
.chart{display:flex;align-items:flex-end;gap:10px;height:120px;padding:8px 2px 0}
.chart .col{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:7px;height:100%;justify-content:flex-end}
.chart .stick{width:100%;max-width:38px;border-radius:6px 6px 2px 2px;background:var(--grad);min-height:3px;transition:height .4s}
.chart .lb{font-size:10.5px;color:var(--faint);white-space:nowrap}
.chart .vl{font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums}

/* ---------- 分栏选择 ---------- */
.split{display:grid;grid-template-columns:274px minmax(0,1fr);gap:18px;align-items:start}
.list-pane{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;position:sticky;top:88px}
.list-head{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px}
.list-head b{font-size:13px}
.list-scroll{max-height:min(62vh,580px);overflow-y:auto}
.list-item{width:100%;display:flex;gap:11px;align-items:flex-start;padding:12px 14px;border:none;border-bottom:1px solid var(--border);background:transparent;text-align:left;color:var(--text);transition:background .15s}
.list-item:last-child{border-bottom:none}
.list-item:hover{background:var(--surface2)}
.list-item.active{background:linear-gradient(90deg,rgba(139,124,246,.16),transparent);box-shadow:inset 3px 0 0 var(--accent)}
.avatar{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none;background:var(--surface3);color:var(--accent)}
.list-item .li-main{min-width:0;flex:1}
.list-item .li-title{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.list-item .li-sub{font-size:11px;color:var(--faint);margin-top:3px;display:flex;gap:7px;flex-wrap:wrap}
.detail-pane{min-width:0;display:flex;flex-direction:column;gap:18px}
.detail-pane .card + .card{margin-top:0}
.detail-head{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.detail-head .dh-main{min-width:0;flex:1}
.detail-head h3{margin:0;font-size:16px}
.detail-head p{margin:4px 0 0;font-size:11.5px;color:var(--faint);word-break:break-all}
.detail-stats{display:flex;gap:20px;flex-wrap:wrap}
.detail-stats .ds{min-width:72px}
.detail-stats .ds b{display:block;font-size:19px;font-variant-numeric:tabular-nums}
.detail-stats .ds span{font-size:11px;color:var(--faint)}

/* ---------- 设置行 / 滑块 ---------- */
.setting-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 0;border-bottom:1px solid var(--border)}
.setting-row:last-child{border-bottom:none}
.setting-row .sr-main{min-width:0}
.setting-row .sr-title{font-size:13.5px;font-weight:600}
.setting-row .sr-desc{font-size:11.5px;color:var(--faint);margin-top:3px;line-height:1.6}
.range-wrap{display:flex;align-items:center;gap:12px;flex-wrap:wrap;max-width:420px;width:100%}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;max-width:240px;height:6px;border-radius:99px;background:var(--surface3);outline:none;padding:0;border:none;box-shadow:none}
input[type=range]:focus{box-shadow:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--accent);border:3px solid var(--surface);box-shadow:0 1px 6px rgba(0,0,0,.35);cursor:pointer}
input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:var(--accent);border:3px solid var(--surface);cursor:pointer}
.range-num{min-width:56px;text-align:center;font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--accent)}
.presets{display:flex;gap:6px;flex-wrap:wrap}
.presets button{padding:5px 11px;border-radius:7px;border:1px solid var(--border2);background:var(--surface2);font-size:11.5px;color:var(--muted)}
.presets button:hover{color:var(--text);border-color:var(--accent)}
.presets button.on{background:rgba(139,124,246,.18);border-color:var(--accent);color:var(--text)}
.seg{display:inline-flex;padding:3px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);gap:2px}
.seg button{padding:6px 14px;border:none;border-radius:7px;background:transparent;color:var(--muted);font-size:12px;font-weight:600}
.seg button.on{background:var(--surface3);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.12)}
.mono-btn{font-family:ui-monospace,Consolas,monospace;font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--muted)}
.mono-btn:hover{color:var(--text);border-color:var(--accent)}
.aff-num{font-size:44px;font-weight:700;letter-spacing:-1px;line-height:1;font-variant-numeric:tabular-nums}
.aff-num small{font-size:15px;color:var(--faint);font-weight:500;margin-left:6px}

/* ---------- 消息时间线 ---------- */
.msgs{max-height:460px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:2px}
.msg-row{display:flex;gap:11px;align-items:flex-start;padding:11px;border:1px solid var(--border);border-radius:11px;background:var(--surface2)}
.msg-row.assistant{background:rgba(139,124,246,.07);border-color:rgba(139,124,246,.22)}
.msg-idx{font-size:10.5px;color:var(--faint);font-family:ui-monospace,Consolas,monospace;min-width:30px;padding-top:3px}
.msg-main{flex:1;min-width:0}
.msg-meta{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;color:var(--faint)}
.msg-body{font-size:12.5px;line-height:1.75;white-space:pre-wrap;word-break:break-word}
.msg-tools{display:flex;gap:5px;flex:none}
.msg-tools button{padding:4px 8px;font-size:11px;border-radius:6px;border:1px solid var(--border2);background:var(--surface);color:var(--muted)}
.msg-tools button:hover{color:var(--text);border-color:var(--accent)}

/* ---------- 工具卡 ---------- */
.tool-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.tool-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);padding:16px;display:flex;flex-direction:column;gap:10px}
.tool-card .tc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.tool-card .tc-name{font-size:13.5px;font-weight:700}
.tool-card .tc-desc{font-size:11.5px;color:var(--faint);line-height:1.7}
.tool-card .tc-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--border);padding-top:10px}
.quick-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.quick{display:flex;align-items:center;gap:9px;padding:12px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface2);color:var(--text);font-size:12px;font-weight:600;text-align:left}
.quick:hover{border-color:var(--accent)}

/* ---------- Toast / Modal ---------- */
.toasts{position:fixed;top:18px;right:18px;z-index:99;display:flex;flex-direction:column;gap:9px;pointer-events:none}
.toast{min-width:230px;max-width:360px;padding:12px 15px;border-radius:11px;background:var(--surface);border:1px solid var(--border2);
  border-left:3px solid var(--accent);box-shadow:var(--shadow);font-size:12.5px;animation:slide .25s ease;word-break:break-word}
@keyframes slide{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
.toast.ok{border-left-color:var(--ok)}
.toast.err{border-left-color:var(--danger)}
.modal{position:fixed;inset:0;z-index:50;background:rgba(4,7,14,.68);display:grid;place-items:center;padding:20px;backdrop-filter:blur(4px)}
.modal-box{width:min(720px,100%);max-height:84vh;overflow:auto;background:var(--surface);border:1px solid var(--border2);border-radius:16px;box-shadow:var(--shadow);padding:22px}
.modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}
.modal-head h3{margin:0;font-size:16px;word-break:break-all}
.modal-head p{margin:4px 0 0;color:var(--faint);font-size:12px;word-break:break-all}

@media(max-width:1100px){.g4{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(2,minmax(0,1fr))}.split{grid-template-columns:1fr}.list-pane{position:static}.list-scroll{max-height:220px}}
@media(max-width:860px){
  .shell{flex-direction:column}
  .sidebar{width:100%;height:auto;position:static;padding:14px;border-right:none;border-bottom:1px solid var(--border)}
  .side-brand{padding:0 4px 6px}.side-version{display:none}
  .nav{flex-direction:row;overflow-x:auto;gap:5px;padding-bottom:4px}
  .side-label{display:none}
  .nav-item{width:auto;white-space:nowrap;padding:8px 12px}
  .nav-item .cnt{display:none}
  .side-foot{flex-direction:row;align-items:center;justify-content:space-between;padding-top:10px}
  .side-foot .links{width:auto}.side-foot .links button{flex:none;padding:5px 12px}
  .topbar{padding:15px 18px 13px}.content{padding:18px 18px 48px}
  .g2,.g3,.tool-grid,.quick-grid{grid-template-columns:1fr}
}
@media(max-width:520px){.g4,.tool-grid,.quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.stat-num{font-size:22px}.card{padding:16px}.kv{grid-template-columns:110px 1fr}}
</style>
</head>
<body>

<div id="login" class="login-wrap">
  <div class="login-card">
    <div class="brand-mark">&#10022;</div>
    <h1>昔涟 · 控制台</h1>
    <p class="sub">QQ 机器人管理后台</p>
    <form id="loginForm" autocomplete="off">
      <label class="field-label" for="pw">管理员密码</label>
      <div class="pw-row">
        <input id="pw" type="password" autocomplete="current-password" placeholder="请输入 ADMIN_PASSWORD" required>
        <button type="button" class="pw-toggle" id="pwToggle">显示</button>
      </div>
      <div class="login-err" id="loginErr"></div>
      <button type="submit" class="btn primary block" id="loginBtn">进入控制台</button>
    </form>
    <p class="login-hint">密码来自 <code>.dev.vars</code> 中 <code>ADMIN_PASSWORD</code> 的明文值，仅保存在当前页面内存中，不会写入浏览器存储或日志。连续输错 8 次将按 IP 锁定 10 分钟。</p>
  </div>
</div>

<div id="shell" class="shell" hidden>
  <aside class="sidebar">
    <div class="side-brand"><span class="m">&#10022;</span><span>昔涟控制台</span></div>
    <div class="side-version">Cloudflare Workers · D1</div>
    <nav class="nav" id="nav"></nav>
    <div class="side-foot">
      <div class="row"><span class="dot"></span><span>已连接 · Worker 在线</span></div>
      <div class="links">
        <button type="button" id="themeBtn">切换浅色</button>
        <button type="button" id="logoutBtn">退出登录</button>
      </div>
    </div>
  </aside>
  <main class="main">
    <header class="topbar">
      <div><div class="crumb" id="crumb">工作台 / 概览</div><h2 id="pageTitle">概览</h2><p id="pageSub">正在载入数据…</p></div>
      <div class="top-actions"><span class="badge" id="modelBadge"></span><button type="button" class="btn ghost sm" id="refreshBtn">&#8635; 刷新</button></div>
    </header>
    <div class="content" id="content"></div>
  </main>
</div>

<div id="toasts" class="toasts"></div>
<div id="modal" class="modal" hidden><div class="modal-box" id="modalBox"></div></div>

<script>
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
var state={password:'',data:null,view:'overview',busy:false,promptDirty:false,promptCache:null,
  selectedGroup:null,selectedUser:null,convFilter:'all',editCtx:null,groupMsgsToken:0};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function num(n){return Number(n||0).toLocaleString('zh-CN')}
function when(ms){if(!ms)return '—';var d=new Date(Number(ms));if(isNaN(d.getTime()))return '—';return d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function shortId(s){s=String(s||'');return s.length>24?s.slice(0,10)+'…'+s.slice(-7):s}
function initials(s){s=String(s||'?').replace(/^(group|c2c):/,'');return s.slice(0,2).toUpperCase()}

var I={
  overview:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  prompt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5M8 12h8M8 16h6"/></svg>',
  tools:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  groups:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.5a3 3 0 0 1 0 5.8M18 14.5c2 .8 3 2.6 3 5.5"/></svg>',
  people:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M2.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 7h5M16 12h5M16 17h5"/></svg>',
  conversations:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  system:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--surface)"/><circle cx="15" cy="12" r="2" fill="var(--surface)"/><circle cx="8" cy="18" r="2" fill="var(--surface)"/></svg>'
};
var VIEWS=[
  {id:'overview',name:'概览',sub:'机器人运行概况与资源用量',icon:I.overview,group:'工作台'},
  {id:'groups',name:'群聊',sub:'按群独立配置，查看并编辑群内记录',icon:I.groups,group:'工作台'},
  {id:'people',name:'用户',sub:'好感度与访问权限，点选即可编辑',icon:I.people,group:'工作台'},
  {id:'conversations',name:'会话记录',sub:'按类型筛选上下文，逐条查看与维护',icon:I.conversations,group:'数据'},
  {id:'tools',name:'工具开关',sub:'控制 AI 可调用的外部工具',icon:I.tools,group:'配置'},
  {id:'prompt',name:'系统提示词',sub:'调整昔涟的人格与回复规则',icon:I.prompt,group:'配置'},
  {id:'settings',name:'全局设置',sub:'AI 总开关与新群默认策略',icon:I.settings,group:'配置'},
  {id:'system',name:'系统信息',sub:'配置状态、指令全集与安全说明',icon:I.system,group:'系统'}
];

function toast(msg,kind){
  var d=document.createElement('div');d.className='toast '+(kind||'');d.textContent=msg;
  $('toasts').appendChild(d);
  setTimeout(function(){d.style.opacity='0';d.style.transform='translateX(16px)';d.style.transition='all .25s';setTimeout(function(){d.remove()},260)},3200);
}
function busy(on){state.busy=on;var b=$('refreshBtn');if(b){b.disabled=on;b.innerHTML=on?'<span class="spin"></span> 载入中':'&#8635; 刷新'}}

async function api(action,data){
  var payload=Object.assign({password:state.password,action:action},data||{});
  var r=await fetch('/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  var j=await r.json().catch(function(){return {}});
  if(!r.ok)throw new Error(j.error||('HTTP '+r.status));
  return j;
}
async function load(){
  busy(true);
  try{state.data=await api('overview');render();}
  catch(e){toast('载入失败：'+e.message,'err');}
  finally{busy(false);}
}
async function act(action,data,msg){
  try{await api(action,data);toast(msg||'已保存','ok');await load();return true;}
  catch(e){toast('操作失败：'+e.message,'err');return false;}
}

function renderNav(){
  var d=state.data||{},counts={groups:(d.groups||[]).length,people:(d.users||[]).length,conversations:(d.conversations||[]).length};
  var html='',last='';
  VIEWS.forEach(function(v){
    if(v.group!==last){html+='<div class="side-label">'+esc(v.group)+'</div>';last=v.group}
    var c=counts[v.id]!=null?'<span class="cnt">'+counts[v.id]+'</span>':'';
    html+='<button type="button" class="nav-item'+(state.view===v.id?' active':'')+'" data-nav="'+v.id+'">'+v.icon+'<span>'+v.name+'</span>'+c+'</button>';
  });
  $('nav').innerHTML=html;
}
function render(){
  renderNav();
  var v=VIEWS.filter(function(x){return x.id===state.view})[0]||VIEWS[0];
  $('pageTitle').textContent=v.name;$('pageSub').textContent=v.sub;
  $('crumb').textContent=v.group+' / '+v.name;
  var d=state.data;
  if(d&&d.config)$('modelBadge').innerHTML='&#9679; '+esc(d.config.model);
  $('content').innerHTML='<div class="view">'+({
    overview:viewOverview,prompt:viewPrompt,tools:viewTools,groups:viewGroups,
    people:viewPeople,conversations:viewConversations,settings:viewSettings,system:viewSystem
  })[v.id](d)+'</div>';
  afterRender();
}
function afterRender(){
  if(state.view==='prompt'&&state.promptDirty){
    var t=$('promptText');if(t&&state.promptCache!=null){t.value=state.promptCache;updatePromptCount()}
  }
  if(state.view==='groups'&&state.selectedGroup)loadGroupMessages(state.selectedGroup);
}

function statCard(label,value,sub,icon){
  return '<div class="stat"><div class="stat-top"><span class="lb">'+esc(label)+'</span><span class="stat-ico">'+icon+'</span></div><div class="stat-num">'+esc(value)+'</div><div class="stat-sub">'+esc(sub||'')+'</div></div>';
}
function empty(text){return '<div class="empty">'+esc(text)+'</div>'}
function table(head,rows){
  if(!rows.length)return empty('暂无数据');
  return '<div class="tbl-wrap"><table><thead><tr>'+head.map(function(h){return '<th>'+esc(h)+'</th>'}).join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
}
function settingRow(title,desc,control){
  return '<div class="setting-row"><div class="sr-main"><div class="sr-title">'+esc(title)+'</div><div class="sr-desc">'+esc(desc)+'</div></div>'+control+'</div>';
}
function switchControl(attr,checked){
  return '<label class="switch"><input type="checkbox" '+attr+(checked?' checked':'')+'><span class="track"></span></label>';
}
function rangeControl(attr,value,id){
  return '<div class="range-wrap"><input type="range" min="0" max="100" step="1" value="'+Number(value)+'" '+attr+'><span class="range-num" id="'+id+'">'+Number(value)+'</span></div>';
}
function presetRow(attr,vals,current){
  return '<div class="presets">'+vals.map(function(v){
    return '<button type="button" '+attr+'="' + v[0] + '"'+(Number(current)===v[0]?' class="on"':'')+'>'+esc(v[1])+'</button>';
  }).join('')+'</div>';
}

function viewOverview(d){
  if(!d)return '<div class="card">'+empty('正在载入…')+'</div>';
  var s=d.stats,u=d.usage,c=d.config,g=d.global||{};
  var stats='<div class="grid g4" style="margin-bottom:18px">'+
    statCard('用户总数',num(s.users),'有好感度记录',I.people)+
    statCard('群聊',num(s.groups),'每个群可独立配置',I.groups)+
    statCard('会话',num(s.conversations),'累计 '+num(s.messages)+' 条上下文',I.conversations)+
    statCard('黑名单',num(s.blacklist),'被屏蔽的用户',I.system)+'</div>';
  var quick='<div class="card"><div class="card-head"><div><h3>快捷入口</h3><p>常用操作一键直达，无需手输任何 ID</p></div></div>'+
    '<div class="quick-grid">'+
      '<button type="button" class="quick" data-nav="groups">'+I.groups+'<span>分群设置</span></button>'+
      '<button type="button" class="quick" data-nav="people">'+I.people+'<span>用户好感</span></button>'+
      '<button type="button" class="quick" data-nav="tools">'+I.tools+'<span>工具开关</span></button>'+
      '<button type="button" class="quick" data-nav="conversations">'+I.conversations+'<span>会话记录</span></button>'+
    '</div></div>';
  var days=u.days||[],max=1;
  days.forEach(function(x){if(x.calls>max)max=x.calls});
  var chart=days.length?('<div class="chart">'+days.map(function(x){
    var h=Math.max(3,Math.round(x.calls/max*84));
    return '<div class="col"><span class="vl">'+num(x.calls)+'</span><div class="stick" style="height:'+h+'px"></div><span class="lb">'+esc(String(x.date).slice(5))+'</span></div>';
  }).join('')+'</div>'):empty('还没有用量记录');
  var pu=u.todayProviders||{nvidiaNim:0,'workers-ai':0};
  var usage='<div class="card"><div class="card-head"><div><h3>API 用量</h3><p>调用与 Token 来自 api_usage 表，模型次数按北京时间（UTC+8）计日</p></div></div>'+
    '<div class="grid g4" style="margin-bottom:20px">'+
      statCard('今日调用',num(u.todayCalls),'次请求',I.tools)+
      statCard('今日 Token',num(u.todayTokens),'估算值',I.prompt)+
      statCard('累计调用',num(u.totalCalls),'次请求',I.overview)+
      statCard('累计 Token',num(u.totalTokens),'估算值',I.system)+'</div>'+
    '<div class="provider-line"><span class="pl-label">今日模型调用（全站）</span>'+
      '<span class="badge ok">NVIDIA NIM '+num(pu.nvidiaNim||0)+' 次</span>'+
      '<span class="badge">Workers AI '+num(pu['workers-ai']||0)+' 次</span>'+
      '<span class="pl-label">主模型失败时自动兜底</span></div>'+chart+'</div>';
  var lastTool=c.lastToolCall;
  var toolLine=lastTool?('<span class="badge ok">最近工具 '+esc(lastTool.name||'unknown')+'</span> <span class="faint" style="margin-left:8px">'+esc(when(lastTool.at))+'</span>'):'<span class="faint">暂无工具调用记录</span>';
  var side='<div class="card"><div class="card-head"><div><h3>运行状态</h3><p>密钥只显示是否就绪，不会返回值</p></div></div>'+
    '<dl class="kv">'+
      '<dt>主模型</dt><dd class="mono">'+esc(c.model)+'</dd>'+
      '<dt>AI 总开关</dt><dd>'+(g.aiEnabled===false?'<span class="badge warn">已关闭</span>':'<span class="badge ok">已开启</span>')+'</dd>'+
      '<dt>免密钥工具</dt><dd><span class="badge free">'+num(c.freeToolCount||0)+' 个可用</span></dd>'+
      '<dt>工具开关来源</dt><dd>'+(c.toolsSource==='admin'?'<span class="badge">后台手动设置</span>':'<span class="badge ok">按 API Key 自动启用</span>')+'</dd>'+
      '<dt>QQ 凭据</dt><dd>'+(c.keys.appId&&c.keys.secret?'<span class="badge ok">已配置</span>':'<span class="badge warn">缺失</span>')+'</dd>'+
      '<dt>NVIDIA NIM / Workers AI</dt><dd>'+(c.keys.nvidia?'<span class="badge ok">NVIDIA NIM 已配置</span> ':'<span class="badge warn">NVIDIA NIM 缺失</span> ')+(c.keys.ai?'<span class="badge ok">AI 绑定就绪</span>':'<span class="badge warn">AI 未绑定</span>')+'</dd>'+
      '<dt>最近工具调用</dt><dd>'+toolLine+'</dd>'+
    '</dl></div>';
  var recent=(d.conversations||[]).slice(0,6);
  var convRows=recent.map(function(x){
    var tag=x.kind==='group'?'<span class="badge">群聊</span>':'<span class="badge off">私聊</span>';
    return '<tr><td>'+tag+'</td><td class="mono">'+esc(shortId(x.conversation_id))+'</td><td>'+esc(when(x.last_message_at))+'</td><td>'+num(x.messageCount)+'</td><td class="muted">'+esc(x.preview||'—')+'</td></tr>';
  });
  var conv='<div class="card"><div class="card-head"><div><h3>最近会话</h3><p>查看完整内容请前往「会话记录」</p></div><button type="button" class="btn sm" data-nav="conversations">查看全部</button></div>'+
    table(['类型','会话 ID','最后活动','消息数','最后一条预览'],convRows)+'</div>';
  var glist=(d.groups||[]).slice(0,5);
  var groupCard='<div class="card"><div class="card-head"><div><h3>群聊概览</h3><p>点击群名直接跳转到该群的独立设置</p></div><button type="button" class="btn sm" data-nav="groups">全部群</button></div>'+
    (glist.length?('<div class="chips">'+glist.map(function(g){
      return '<button type="button" class="chip" data-jump-group="'+esc(g.group_id)+'">'+esc(shortId(g.group_id))+' · '+Number(g.reply_probability)+'%</button>';
    }).join('')+'</div>'):empty('还没有群聊记录，群里发一条消息后会自动出现'))+'</div>';
  return stats+quick+'<div class="grid g2" style="align-items:start">'+usage+side+'</div>'+groupCard+conv;
}

function viewPrompt(d){
  var p=d?d.prompt:'',custom=d&&d.promptIsCustom;
  return '<div class="card"><div class="card-head"><div><h3>系统提示词</h3><p>保存后立即对新一轮对话生效；留空或点「恢复内置」将使用 persona.ts 的默认人格</p></div>'+
    '<span class="badge '+(custom?'ok':'off')+'">'+(custom?'自定义':'内置默认')+'</span></div>'+
    '<textarea id="promptText" rows="20" spellcheck="false" placeholder="在这里编辑系统提示词…">'+esc(p)+'</textarea>'+
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;flex-wrap:wrap">'+
      '<span class="faint" id="promptCount">0 / 30000 字符</span>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-act="prompt-reset">恢复内置提示词</button>'+
      '<button type="button" class="btn primary" data-act="prompt-save">保存提示词</button></div></div></div>'+
    '<div class="card"><div class="hint-box"><b>提示：</b>提示词里不要写死「最新版本号」「当前日期」等实时信息，模型会把它当成事实复述。涉及实时信息应让 AI 调用已启用的工具查询。每个群还可以在「群聊」页单独叠加一层语气设定。</div></div>';
}
function updatePromptCount(){var t=$('promptCount'),v=$('promptText');if(t&&v)t.textContent=num(v.value.length)+' / 30000 字符'}

function viewTools(d){
  var t=d?d.tools:{},c=d?d.config:{},cat=d?d.toolCatalog:[];
  if(!cat.length)cat=[{key:'tavily',name:'Tavily 网页搜索',desc:'唯一的联网搜索工具',free:false,needsKey:'TAVILY_API_KEY'},{key:'wget',name:'网页抓取',desc:'抓取公开网页正文',free:true}];
  var cards=cat.map(function(item){
    return '<div class="tool-card"><div class="tc-top"><div><div class="tc-name">'+esc(item.name)+'</div>'+
      '<div class="tc-desc">'+esc(item.desc)+'</div></div>'+
      '<span class="badge '+(item.free?'free':'warn')+'">'+(item.free?'免费':'需 Key')+'</span></div>'+
      '<div class="tc-foot"><span class="faint" style="font-size:11px">'+(item.free?'无需 API Key，默认开启':esc(item.needsKey||''))+'</span>'+
      switchControl('data-tool="'+esc(item.key)+'"',!!t[item.key])+'</div></div>';
  }).join('');
  return '<div class="card"><div class="card-head"><div><h3>AI 工具</h3><p>开关变动立即保存。工具由 Worker 执行，最多三轮；关闭后模型不会收到该工具</p></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" data-tool-preset="all">全部开启</button>'+
    '<button type="button" class="btn sm" data-tool-preset="free">仅免费工具</button>'+
    '<button type="button" class="btn sm" data-tool-preset="none">全部关闭</button></div></div>'+
    '<div class="tool-grid">'+cards+'</div></div>'+
    '<div class="card"><div class="hint-box"><b>说明：</b><b>维基百科、时间、天气、网页抓取</b>完全免费、无需任何 API Key，默认开启；旧版后台保存过的开关里没有这些键时也会自动按默认开启。联网搜索统一由 Tavily 承担；从未保存过开关时，需要 Key 的工具按已配置的 Key 自动启用；一旦在此保存，就以后台设置为准。群里还可以单独关掉「允许 AI 调用工具」。模型看不到 Worker 的执行记录，真实调用记录在「系统信息」页与 <code>/工具状态</code> 指令里。</div></div>';
}

/** 群聊：左侧选择群，右侧该群独立的全部设置 + 该群消息记录。 */
function viewGroups(d){
  var groups=d?(d.groups||[]):[];
  var sel=state.selectedGroup;
  if(!sel||!groups.some(function(g){return g.group_id===sel}))sel=groups.length?groups[0].group_id:null;
  state.selectedGroup=sel;
  var listHtml=groups.length?groups.map(function(g){
    var o=g.options||{};
    return '<button type="button" class="list-item'+(g.group_id===sel?' active':'')+'" data-pick-group="'+esc(g.group_id)+'">'+
      '<span class="avatar">'+esc(initials(g.group_id))+'</span><span class="li-main">'+
      '<span class="li-title">'+esc(shortId(g.group_id))+'</span>'+
      '<span class="li-sub"><span>'+num(g.messageCount)+' 条记录</span><span>'+Number(g.reply_probability)+'%</span>'+
      (o.aiEnabled===false?'<span class="badge warn" style="padding:1px 6px">AI 关</span>':'')+
      (o.atOnly?'<span class="badge off" style="padding:1px 6px">仅 @</span>':'')+'</span></span></button>';
  }).join(''):empty('还没有群聊记录。群里发一条消息（或 @ 机器人）后，这个群会自动出现在这里，无需手输群 ID。');
  var pane='<div class="list-pane"><div class="list-head"><b>群列表</b><span class="badge">'+groups.length+' 个群</span></div>'+
    '<div class="list-scroll">'+listHtml+'</div></div>';
  var current=groups.filter(function(g){return g.group_id===sel})[0];
  return '<div class="split">'+pane+'<div class="detail-pane">'+(current?groupDetail(current,d):('<div class="card">'+empty('从左侧选择一个群，即可查看并修改该群的独立设置与消息记录')+'</div>'))+'</div></div>';
}
function groupDetail(g,d){
  var o=Object.assign({replyProbability:g.reply_probability,aiEnabled:true,atOnly:false,allowTools:true,tone:'default'},g.options||{});
  var tones=d&&d.tones?d.tones:[{value:'default',label:'继承全局',hint:''}];
  var toneOpts=tones.map(function(t){return '<option value="'+esc(t.value)+'"'+(t.value===o.tone?' selected':'')+'>'+esc(t.label)+'</option>'}).join('');
  var toneHint=tones.filter(function(t){return t.value===o.tone})[0];
  var head='<div class="card"><div class="detail-head"><span class="avatar" style="width:44px;height:44px;font-size:14px">'+esc(initials(g.group_id))+'</span>'+
    '<div class="dh-main"><h3>群 '+esc(shortId(g.group_id))+'</h3><p>'+esc(g.group_id)+'</p></div>'+
    '<div class="detail-stats"><div class="ds"><b>'+num(g.messageCount)+'</b><span>上下文条数</span></div>'+
    '<div class="ds"><b>'+Number(g.reply_probability)+'%</b><span>回复概率</span></div>'+
    '<div class="ds"><b>'+esc(g.lastMessageAt?when(g.lastMessageAt):'—')+'</b><span>最后活动</span></div></div></div></div>';
  var settings='<div class="card"><div class="card-head"><div><h3>本群独立设置</h3><p>所有控件即时保存，只影响这一个群；固定指令始终 100% 回复，不受这些开关影响</p></div>'+
    '<button type="button" class="btn sm" data-act="group-reset">恢复默认</button></div>'+
    settingRow('AI 回复','关闭后本群只回固定指令，@ 机器人也不再触发 AI，且不写入上下文',
      switchControl('data-group-opt="aiEnabled"',o.aiEnabled))+
    settingRow('仅回复 @ 消息','开启后普通群消息一律不回，只有 @ 机器人和固定指令会回',
      switchControl('data-group-opt="atOnly"',o.atOnly))+
    settingRow('允许 AI 调用工具','关闭后本群的 AI 问答不会调用任何搜索 / 百科 / 天气工具',
      switchControl('data-group-opt="allowTools"',o.allowTools))+
    settingRow('回复概率','非 @ 消息被回复的概率；0 = 只回固定指令与 @，100 = 每条都回',
      rangeControl('data-group-prob="1"',o.replyProbability,'groupProbNum'))+
    '<div style="margin:12px 0 4px">'+presetRow('data-prob-preset',[[0,'安静 0'],[30,'默认 30'],[60,'活跃 60'],[100,'全回 100']],o.replyProbability)+'</div>'+
    settingRow('本群语气','在系统提示词之上叠加一层群专属语气',
      '<select id="groupTone" data-group-opt="tone" style="width:auto;min-width:150px">'+toneOpts+'</select>')+
    (toneHint&&toneHint.hint?'<div class="hint-box" style="margin-top:12px">'+esc(toneHint.hint)+'</div>':'')+
    '</div>';
  var msgs='<div class="card"><div class="card-head"><div><h3>本群消息记录</h3><p>按时间顺序展示该群上下文，可逐条编辑或删除；修改后下一轮 AI 对话立即采用新内容</p></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" data-act="group-msg-reload">&#8635; 刷新</button>'+
    '<button type="button" class="btn sm danger" data-act="group-msg-clear" data-id="'+esc(g.conversation_id)+'">清空会话</button></div></div>'+
    '<div id="groupMsgs">'+empty('正在载入…')+'</div></div>';
  return head+settings+msgs;
}
async function loadGroupMessages(groupId){
  var token=++state.groupMsgsToken,convId='group:'+groupId;
  try{
    var r=await api('conversation',{conversationId:convId});
    var box=$('groupMsgs');
    if(box&&token===state.groupMsgsToken&&state.selectedGroup===groupId){
      box.innerHTML=renderMessages(r.messages||[],convId,'group');
    }
  }catch(e){
    var b=$('groupMsgs');if(b&&token===state.groupMsgsToken)b.innerHTML=empty('读取失败：'+e.message);
  }
}
function renderMessages(msgs,convId,scope){
  if(!msgs.length)return empty('这个会话还没有消息');
  return '<div class="msgs">'+msgs.map(function(m,i){
    var role=m.role==='assistant'?'assistant':'user';
    var text=String(m.content==null?'':m.content);
    return '<div class="msg-row '+role+'"><span class="msg-idx">#'+(i+1)+'</span>'+
      '<div class="msg-main"><div class="msg-meta"><span class="badge '+(role==='assistant'?'':'ok')+'">'+(role==='assistant'?'昔涟':'用户')+'</span>'+
      '<span>第 '+(i+1)+' 条 · '+num(text.length)+' 字</span></div>'+
      '<div class="msg-body">'+esc(text)+'</div></div>'+
      '<div class="msg-tools"><button type="button" data-act="msg-edit" data-idx="'+i+'" data-conv="'+esc(convId)+'" data-scope="'+scope+'">编辑</button>'+
      '<button type="button" data-act="msg-del" data-idx="'+i+'" data-conv="'+esc(convId)+'" data-scope="'+scope+'">删除</button></div></div>';
  }).join('')+'</div>';
}
async function saveGroupOptions(extra){
  var id=state.selectedGroup;if(!id)return;
  var opts=extra||{};
  if(!extra){
    var ai=document.querySelector('[data-group-opt="aiEnabled"]'),at=document.querySelector('[data-group-opt="atOnly"]'),
        tl=document.querySelector('[data-group-opt="allowTools"]'),tone=$('groupTone'),prob=document.querySelector('[data-group-prob]');
    opts={aiEnabled:ai?ai.checked:true,atOnly:at?at.checked:false,allowTools:tl?tl.checked:true,
      tone:tone?tone.value:'default',replyProbability:prob?Number(prob.value):30};
  }
  try{await api('group-options',{groupId:id,options:opts});toast('本群设置已保存','ok');await load()}
  catch(e){toast('保存失败：'+e.message,'err')}
}

/** 用户：左侧列表选择，右侧好感度滑块 + 预设按钮 + 黑名单开关。 */
function viewPeople(d){
  var users=d?(d.users||[]):[];
  var sel=state.selectedUser;
  if(!sel||!users.some(function(u){return u.user_id===sel}))sel=users.length?users[0].user_id:null;
  state.selectedUser=sel;
  var listHtml=users.length?users.map(function(u){
    return '<button type="button" class="list-item'+(u.user_id===sel?' active':'')+'" data-pick-user="'+esc(u.user_id)+'">'+
      '<span class="avatar">'+esc(initials(u.user_id))+'</span><span class="li-main">'+
      '<span class="li-title">'+esc(shortId(u.user_id))+'</span>'+
      '<span class="li-sub"><span>好感 '+Number(u.affection)+'</span>'+
      (u.blocked?'<span class="badge danger" style="padding:1px 6px">黑名单</span>':'<span>正常</span>')+
      '<span>'+esc(when(u.updated_at))+'</span></span></span></button>';
  }).join(''):empty('还没有用户记录。有人和机器人对话后会自动出现在这里，无需手输用户 ID。');
  var pane='<div class="list-pane"><div class="list-head"><b>用户列表</b><span class="badge">'+users.length+' 位</span></div><div class="list-scroll">'+listHtml+'</div></div>';
  var current=users.filter(function(u){return u.user_id===sel})[0];
  var detail=current?userDetail(current):('<div class="card">'+empty('从左侧选择一位用户，即可用滑块和预设按钮调整好感度')+'</div>');
  return '<div class="split">'+pane+'<div class="detail-pane">'+detail+'</div></div>';
}
function userDetail(u){
  var a=Number(u.affection);
  return '<div class="card"><div class="card-head"><div><h3>用户档案</h3><p>所有修改即时生效，无需输入用户 ID</p></div>'+
    (u.blocked?'<span class="badge danger">已拉黑</span>':'<span class="badge ok">正常</span>')+'</div>'+
    '<div class="detail-head" style="margin-bottom:18px"><span class="avatar" style="width:44px;height:44px;font-size:14px">'+esc(initials(u.user_id))+'</span>'+
    '<div class="dh-main"><h3>'+esc(shortId(u.user_id))+'</h3><p>'+esc(u.user_id)+'</p></div>'+
    '<button type="button" class="mono-btn" data-act="copy" data-id="'+esc(u.user_id)+'">复制 ID</button></div>'+
    '<div style="display:flex;align-items:baseline;gap:14px;margin-bottom:16px"><div class="aff-num" id="affNum">'+a+'<small>/ 100</small></div>'+
    '<span class="faint">最近更新 '+esc(when(u.updated_at))+'</span></div>'+
    rangeControl('data-aff-range="1"',a,'affRangeNum')+
    '<div style="margin-top:14px">'+presetRow('data-aff-preset',[[20,'陌生 20'],[50,'普通 50'],[70,'友好 70'],[90,'亲密 90'],[100,'满值 100']],a)+'</div></div>'+
    '<div class="card"><div class="card-head"><div><h3>访问权限</h3><p>黑名单用户不触发 AI 回复、不写入上下文，但固定指令仍然 100% 回复</p></div></div>'+
    settingRow('加入黑名单','开启后该用户的普通消息会被直接忽略',switchControl('data-block-toggle="1"',!!u.blocked))+'</div>';
}
async function saveAffection(value){
  var id=state.selectedUser;if(!id)return;
  await act('affection',{userId:id,affection:value},'好感度已设为 '+value);
}

function viewConversations(d){
  var list=(d?d.conversations:[])||[],f=state.convFilter;
  var shown=list.filter(function(x){return f==='all'||x.kind===f});
  var seg='<div class="seg">'+[['all','全部'],['group','群聊'],['c2c','私聊']].map(function(v){
    return '<button type="button" data-conv-filter="'+v[0]+'"'+(f===v[0]?' class="on"':'')+'>'+v[1]+'</button>';
  }).join('')+'</div>';
  var rows=shown.map(function(x){
    var tag=x.kind==='group'?'<span class="badge">群聊</span>':'<span class="badge off">私聊</span>';
    return '<tr><td>'+tag+'</td><td class="mono">'+esc(shortId(x.conversation_id))+'</td><td>'+esc(when(x.last_message_at))+'</td><td>'+num(x.messageCount)+'</td>'+
      '<td class="muted">'+esc(x.preview||'—')+'</td><td><div class="row-actions">'+
      '<button type="button" class="btn sm" data-act="conv-open" data-id="'+esc(x.conversation_id)+'">查看 / 编辑</button>'+
      '<button type="button" class="btn sm" data-act="conv-clear" data-id="'+esc(x.conversation_id)+'">清空</button>'+
      '<button type="button" class="btn sm danger" data-act="conv-del" data-id="'+esc(x.conversation_id)+'">删除</button></div></td></tr>';
  });
  return '<div class="card"><div class="card-head"><div><h3>会话上下文</h3><p>每个群 / 私聊独立保存，最多 80 条；可逐条编辑或删除消息，用来清掉脏上下文</p></div>'+
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+seg+'<span class="badge">'+shown.length+' / '+list.length+' 个会话</span></div></div>'+
    table(['类型','会话 ID','最后活动','消息数','最后一条预览','操作'],rows)+'</div>';
}

function viewSettings(d){
  if(!d)return empty('正在载入…');
  var g=d.global||{},def=d.groupDefaults||{};
  var prob=g.defaultProbability==null?30:Number(g.defaultProbability);
  return '<div class="card"><div class="card-head"><div><h3>全局开关</h3><p>影响所有群和私聊；单群可在「群聊」页覆盖回复概率与工具权限</p></div></div>'+
    settingRow('AI 总开关','关闭后所有普通消息都不再触发 AI、不写入上下文；固定指令仍然 100% 回复',
      switchControl('data-global-opt="aiEnabled"',g.aiEnabled!==false))+
    settingRow('新群默认回复概率','群里第一次发消息、还没单独配置时采用的值（默认 30%）',
      rangeControl('data-global-prob="1"',prob,'globalProbNum'))+
    '<div style="margin:12px 0 4px">'+presetRow('data-global-prob-preset',[[0,'0'],[30,'30 默认'],[60,'60'],[100,'100']],prob)+'</div>'+
    '</div>'+
    '<div class="card"><div class="card-head"><div><h3>默认群策略</h3><p>新建群或「恢复默认」时采用的初始值，仅供参考</p></div></div>'+
    '<dl class="kv"><dt>回复概率</dt><dd>'+Number(def.replyProbability==null?30:def.replyProbability)+'%</dd>'+
    '<dt>AI 回复</dt><dd>'+(def.aiEnabled===false?'关闭':'开启')+'</dd>'+
    '<dt>仅 @ 回复</dt><dd>'+(def.atOnly?'开启':'关闭')+'</dd>'+
    '<dt>允许工具</dt><dd>'+(def.allowTools===false?'关闭':'开启')+'</dd>'+
    '<dt>语气</dt><dd>'+esc(def.tone||'default')+'</dd></dl></div>'+
    '<div class="card"><div class="hint-box"><b>工作方式：</b>固定指令在任何开关之前处理，100% 回复、不经过 AI、不写入会话历史；普通消息按「全局 AI 总开关 → 黑名单 → 群独立设置 → 回复概率 → AI」的顺序处理。所有设置都从 D1 动态读取，改完立即生效，无需重新部署。</div></div>';
}

function viewSystem(d){
  if(!d)return empty('正在载入…');
  var c=d.config,cmds=(c.fixedCommands||[]).map(function(x){return '<span class="chip">'+esc(x)+'</span>'}).join('');
  var aliases=(c.noSlashAliases||[]).map(function(x){return '<span class="chip alt">'+esc(x)+'</span>'}).join('');
  var lt=c.lastToolCall;
  var tool=lt?('<dl class="kv"><dt>工具名</dt><dd class="mono">'+esc(lt.name||'—')+'</dd><dt>调用时间</dt><dd>'+esc(when(lt.at))+'</dd>'+
    '<dt>结果</dt><dd>'+(lt.ok===false?'<span class="badge warn">失败</span>':'<span class="badge ok">成功</span>')+'</dd>'+
    '<dt>结果长度</dt><dd>'+num(lt.resultChars)+' 字符</dd></dl>'):empty('尚无工具调用记录');
  var keyRow=function(label,ok){return '<dt>'+esc(label)+'</dt><dd>'+(ok?'<span class="badge ok">已配置</span>':'<span class="badge off">未配置</span>')+'</dd>'};
  return '<div class="card"><div class="card-head"><div><h3>配置就绪状态</h3><p>只显示布尔值，不会返回任何密钥、Token 或密码</p></div></div>'+
    '<dl class="kv"><dt>主模型</dt><dd class="mono">'+esc(c.model)+' <span class="faint">（Workers AI 自动兜底）</span></dd>'+
      keyRow('QQ_BOT_APP_ID',c.keys.appId)+keyRow('QQ_BOT_SECRET',c.keys.secret)+
      keyRow('NVIDIA_API_KEY',c.keys.nvidia)+keyRow('Workers AI 绑定',c.keys.ai)+
      keyRow('TAVILY_API_KEY',c.keys.tavily)+
      '<dt>免密钥工具</dt><dd><span class="badge free">'+num(c.freeToolCount||0)+' 个，无需 Key</span></dd>'+
      '<dt>工具开关来源</dt><dd>'+(c.toolsSource==='admin'?'后台手动设置':'按已配置 Key 自动启用')+'</dd></dl></div>'+
    '<div class="card"><div class="card-head"><div><h3>固定指令全集</h3><p>在黑名单、群设置、回复概率、AI 之前处理，群聊不 @ 也 100% 回复；指令与回复都不写入上下文</p></div></div>'+
    '<div class="chips" style="margin-bottom:16px">'+cmds+'</div>'+
    '<div class="field-label">无斜杠别名（整句相同或「别名 + 空格 + 参数」才命中）</div><div class="chips">'+aliases+'</div></div>'+
    '<div class="grid g2" style="align-items:start"><div class="card"><div class="card-head"><div><h3>最近一次工具调用</h3><p>模型自己说「有没有搜索」不可信，以这里为准</p></div></div>'+tool+'</div>'+
    '<div class="card"><div class="card-head"><div><h3>安全说明</h3><p>关于后台登录与凭据</p></div></div>'+
    '<div class="hint-box">密码是 <code>.dev.vars</code> 里 <code>ADMIN_PASSWORD</code> 的<b>明文值</b>，由 Worker Secret 保存，已取消哈希。页面只在内存中保留密码，不写 localStorage / Cookie；退出登录即刻清除。连续输错 8 次按 IP 锁定 10 分钟。线上排查请用 <code>npx wrangler tail</code> 看日志。</div></div></div>';
}

function openModal(title,sub,body){
  $('modalBox').innerHTML='<div class="modal-head"><div><h3>'+esc(title)+'</h3><p>'+esc(sub||'')+'</p></div><button type="button" class="btn sm" data-act="modal-close">关闭</button></div>'+body;
  $('modal').hidden=false;
}
function closeModal(){$('modal').hidden=true;$('modalBox').innerHTML='';state.editCtx=null}
async function showConversation(id){
  openModal('会话记录',id,'<div id="convMsgs">'+empty('正在载入…')+'</div>');
  await refreshConversation(id);
}
async function refreshConversation(id){
  try{
    var r=await api('conversation',{conversationId:id});
    var box=$('convMsgs');if(box)box.innerHTML=renderMessages(r.messages||[],id,'conv');
  }catch(e){var b=$('convMsgs');if(b)b.innerHTML=empty('读取失败：'+e.message)}
}
function openMessageEditor(convId,idx,content,scope){
  state.editCtx={convId:convId,idx:idx,scope:scope};
  openModal('编辑消息','第 '+(idx+1)+' 条 · '+convId,
    '<textarea id="editMsg" rows="9" spellcheck="false">'+esc(content)+'</textarea>'+
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">'+
    '<button type="button" class="btn" data-act="modal-close">取消</button>'+
    '<button type="button" class="btn primary" data-act="msg-edit-save">保存修改</button></div>');
}

/* ---------- 事件 ---------- */
$('loginForm').addEventListener('submit',async function(e){
  e.preventDefault();
  var pw=$('pw').value;if(!pw)return;
  state.password=pw;$('loginErr').textContent='';
  var b=$('loginBtn');b.disabled=true;b.innerHTML='<span class="spin"></span> 验证中…';
  try{
    state.data=await api('overview');
    $('login').hidden=true;$('shell').hidden=false;$('pw').value='';
    state.view='overview';render();toast('登录成功，数据已载入','ok');
  }catch(err){state.password='';$('loginErr').textContent=err.message}
  finally{b.disabled=false;b.textContent='进入控制台'}
});
$('pwToggle').addEventListener('click',function(){
  var p=$('pw'),show=p.type==='password';p.type=show?'text':'password';this.textContent=show?'隐藏':'显示';
});
$('logoutBtn').addEventListener('click',function(){
  state.password='';state.data=null;state.promptDirty=false;state.promptCache=null;
  state.selectedGroup=null;state.selectedUser=null;
  $('shell').hidden=true;$('login').hidden=false;closeModal();$('pw').value='';
});
$('refreshBtn').addEventListener('click',function(){if(!state.busy)load()});
$('themeBtn').addEventListener('click',function(){
  var next=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';
  document.documentElement.setAttribute('data-theme',next);
  this.textContent=next==='light'?'切换深色':'切换浅色';
  try{localStorage.setItem('qqbot-admin-theme',next)}catch(e){}
});
try{var saved=localStorage.getItem('qqbot-admin-theme');if(saved){document.documentElement.setAttribute('data-theme',saved);$('themeBtn').textContent=saved==='light'?'切换深色':'切换浅色'}}catch(e){}

document.addEventListener('click',async function(ev){
  var nav=ev.target.closest('[data-nav]');
  if(nav&&nav.dataset.nav){state.view=nav.dataset.nav;render();return}
  var jump=ev.target.closest('[data-jump-group]');
  if(jump){state.selectedGroup=jump.dataset.jumpGroup;state.view='groups';render();return}
  var pickG=ev.target.closest('[data-pick-group]');
  if(pickG){state.selectedGroup=pickG.dataset.pickGroup;render();return}
  var pickU=ev.target.closest('[data-pick-user]');
  if(pickU){state.selectedUser=pickU.dataset.pickUser;render();return}
  var cf=ev.target.closest('[data-conv-filter]');
  if(cf){state.convFilter=cf.dataset.convFilter;render();return}
  var ap=ev.target.closest('[data-aff-preset]');
  if(ap){await saveAffection(Number(ap.dataset.affPreset));return}
  var pp=ev.target.closest('[data-prob-preset]');
  if(pp){
    var r=document.querySelector('[data-group-prob]'),n=$('groupProbNum');
    if(r)r.value=pp.dataset.probPreset;if(n)n.textContent=pp.dataset.probPreset;
    await saveGroupOptions();return;
  }
  var gp=ev.target.closest('[data-global-prob-preset]');
  if(gp){
    var gr=document.querySelector('[data-global-prob]'),gn=$('globalProbNum');
    if(gr)gr.value=gp.dataset.globalProbPreset;if(gn)gn.textContent=gp.dataset.globalProbPreset;
    await saveGlobal();return;
  }
  var tp=ev.target.closest('[data-tool-preset]');
  if(tp){
    var mode=tp.dataset.toolPreset,payload={};
    (document.querySelectorAll('[data-tool]')||[]).forEach(function(b){
      var card=b.closest('.tool-card');
      var free=card&&card.querySelector('.badge.free');
      payload[b.dataset.tool]=mode==='all'?true:mode==='free'?!!free:false;
    });
    try{await api('tools',payload);toast('工具开关已更新','ok');await load()}
    catch(e){toast('保存失败：'+e.message,'err')}
    return;
  }
  var btn=ev.target.closest('[data-act]');if(!btn)return;
  var a=btn.dataset.act,id=btn.dataset.id,idx=Number(btn.dataset.idx),conv=btn.dataset.conv,scope=btn.dataset.scope;
  if(a==='modal-close'){closeModal();return}
  if(a==='copy'){
    try{await navigator.clipboard.writeText(id);toast('已复制用户 ID','ok')}catch(e){toast('复制失败，请手动选择','err')}
    return;
  }
  if(a==='conv-open'){await showConversation(id);return}
  if(a==='conv-del'){
    if(!confirm('确定删除这个会话的全部上下文？此操作不可撤销。'))return;
    await act('conversation-delete',{conversationId:id},'会话已删除');return;
  }
  if(a==='conv-clear'){
    if(!confirm('清空这个会话的全部消息？会话本身会保留，AI 从空白上下文重新开始。'))return;
    closeModal();await act('conversation-clear',{conversationId:id},'会话已清空');return;
  }
  if(a==='group-msg-clear'){
    if(!confirm('清空这个群的全部上下文消息？'))return;
    await act('conversation-clear',{conversationId:id},'群会话已清空');return;
  }
  if(a==='group-msg-reload'){if(state.selectedGroup)await loadGroupMessages(state.selectedGroup);return}
  if(a==='msg-edit'){
    var msgsBox=scope==='group'?$('groupMsgs'):$('convMsgs');
    var target=msgsBox?msgsBox.querySelectorAll('.msg-body')[idx]:null;
    var text=target?target.textContent:'';
    openMessageEditor(conv,idx,text,scope);return;
  }
  if(a==='msg-edit-save'){
    var c=state.editCtx;if(!c)return;
    var v=$('editMsg').value;
    try{
      await api('message-edit',{conversationId:c.convId,index:c.idx,content:v});
      closeModal();toast('消息已更新','ok');
      if(c.scope==='conv')await showConversation(c.convId);
      await load();
    }catch(e){toast('保存失败：'+e.message,'err')}
    return;
  }
  if(a==='msg-del'){
    if(!confirm('删除第 '+(idx+1)+' 条消息？此操作不可撤销。'))return;
    try{
      await api('message-delete',{conversationId:conv,index:idx});
      toast('消息已删除','ok');
      if(scope==='conv')await showConversation(conv);
      await load();
    }catch(e){toast('删除失败：'+e.message,'err')}
    return;
  }
  if(a==='prompt-save'){
    var pv=$('promptText').value;
    if(pv.length>30000){toast('提示词超过 30000 字符','err');return}
    btn.disabled=true;
    try{await api('prompt',{prompt:pv});state.promptDirty=false;state.promptCache=null;toast('提示词已保存','ok');await load()}
    catch(e){toast('保存失败：'+e.message,'err')}
    btn.disabled=false;return;
  }
  if(a==='prompt-reset'){
    if(!confirm('恢复为内置默认提示词？当前自定义内容会被覆盖。'))return;
    state.promptDirty=false;state.promptCache=null;await act('prompt-reset',{},'已恢复内置提示词');return;
  }
  if(a==='group-reset'){
    var def=state.data&&state.data.groupDefaults?state.data.groupDefaults:{replyProbability:30,aiEnabled:true,atOnly:false,allowTools:true,tone:'default'};
    await saveGroupOptions({replyProbability:def.replyProbability,aiEnabled:def.aiEnabled,atOnly:def.atOnly,allowTools:def.allowTools,tone:def.tone});
    return;
  }
});
$('modal').addEventListener('click',function(e){if(e.target===this)closeModal()});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal()});

document.addEventListener('change',async function(e){
  var t=e.target;
  var tool=t.closest('[data-tool]');
  if(tool){
    var boxes=document.querySelectorAll('[data-tool]'),next={};
    boxes.forEach(function(b){next[b.dataset.tool]=b.checked});
    tool.disabled=true;
    try{await api('tools',next);toast('工具开关已保存','ok');await load()}
    catch(err){toast('保存失败：'+err.message,'err');tool.checked=!tool.checked}
    finally{tool.disabled=false}
    return;
  }
  if(t.closest('[data-group-opt]')||t.closest('[data-group-prob]')){await saveGroupOptions();return}
  if(t.closest('[data-global-opt]')||t.closest('[data-global-prob]')){await saveGlobal();return}
  if(t.closest('[data-aff-range]')){await saveAffection(Number(t.value));return}
  if(t.closest('[data-block-toggle]')){
    if(!state.selectedUser)return;
    await act('blacklist',{userId:state.selectedUser,blocked:t.checked},t.checked?'已加入黑名单':'已移出黑名单');
    return;
  }
});
async function saveGlobal(){
  var ai=document.querySelector('[data-global-opt="aiEnabled"]'),prob=document.querySelector('[data-global-prob]');
  try{
    await api('global',{aiEnabled:ai?ai.checked:true,defaultProbability:prob?Number(prob.value):30});
    toast('全局设置已保存','ok');await load();
  }catch(e){toast('保存失败：'+e.message,'err')}
}
document.addEventListener('input',function(e){
  var t=e.target;
  if(t.id==='promptText'){state.promptDirty=true;state.promptCache=t.value;updatePromptCount();return}
  if(t.closest('[data-group-prob]')){var n=$('groupProbNum');if(n)n.textContent=t.value;return}
  if(t.closest('[data-global-prob]')){var g=$('globalProbNum');if(g)g.textContent=t.value;return}
  if(t.closest('[data-aff-range]')){var a=$('affRangeNum');if(a)a.textContent=t.value;var b=$('affNum');if(b)b.innerHTML=esc(t.value)+'<small>/ 100</small>';return}
});
})();
</script>
</body>
</html>`;
