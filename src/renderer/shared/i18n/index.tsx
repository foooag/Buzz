import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "zh-CN" | "en";

const STORAGE_KEY = "terminus-locale";

const zh: Record<string, string> = {
  "Application error": "应用程序错误",
  "Buzz couldn't open this workspace.": "Buzz 无法打开此工作区。",
  "Your saved data was not changed. Reload the application to try again.": "已保存的数据没有改变。请重新加载应用后重试。",
  "Reload application": "重新加载应用",
  "Buzz update available": "Buzz 更新可用",
  "A new version was found on GitHub. Install it now and restart Buzz to finish updating.": "在 GitHub 上发现新版本。立即安装并重启 Buzz 以完成更新。",
  "Downloading update…": "正在下载更新…",
  "Downloading update": "正在下载更新",
  "Restart to update": "重启更新",
  "Retry update": "重试更新",
  "Retry update download": "重试下载更新",
  "Update installed. Restarting…": "更新已安装，正在重启…",
  "The update could not be installed. Check your connection and try again.": "无法安装更新，请检查网络连接后重试。",
  Later: "稍后",
  "Try again": "重试",
  "Restarting…": "正在重启…",
  "Installing…": "正在安装…",
  "Update now": "立即更新",
  Primary: "主导航",
  Preferences: "偏好设置",
  Servers: "服务器",
  History: "历史记录",
  "Port Forwarding": "端口转发",
  Sessions: "会话",
  "Buzz home": "Buzz 主页",
  Recent: "最近使用",
  "Show more": "显示更多",
  "No recent connections": "暂无最近连接",
  "Local vault": "本地保险库",
  "Find a host or enter an SSH command": "查找主机或输入 SSH 命令",
  "Search servers or connect directly — try “ssh deploy@10.0.0.20”": "搜索服务器或直接连接 — 例如“ssh deploy@10.0.0.20”",
  "Clear search": "清除搜索",
  Connect: "连接",
  "New Host": "新建主机",
  "New Server": "新建服务器",
  "New server": "新建服务器",
  "Add a host to this vault": "向此保险库添加主机",
  "Name *": "名称 *",
  "Address / hostname *": "地址 / 主机名 *",
  "Address / hostname": "地址 / 主机名",
  "None (password)": "无（密码）",
  "None (direct)": "无（直连）",
  "Route through a bastion / jump host": "通过堡垒机 / 跳板机路由",
  "SOCKS or HTTP proxy (host:port), optional": "SOCKS 或 HTTP 代理（主机:端口），可选",
  "Add tag + ⏎": "添加标签 + ⏎",
  "Environment variables": "环境变量",
  "No variables set.": "尚未设置变量。",
  "Add variable": "添加变量",
  "Run automatically when connecting": "连接时自动运行",
  "Create server": "创建服务器",
  "New Group": "新建分组",
  Import: "导入",
  Export: "导出",
  Tag: "标签",
  "Filter by tag": "按标签筛选",
  All: "全部",
  "Sort servers": "服务器排序",
  Sort: "排序",
  "Grid view": "网格视图",
  "List view": "列表视图",
  Groups: "分组",
  "No servers match": "没有匹配的服务器",
  "Try a different search term, clear the tag filter, or add a new server.": "请尝试其他搜索词、清除标签筛选，或添加新服务器。",
  "No vaults yet": "尚无保险库",
  "Create vault": "创建保险库",
  "Vault name": "保险库名称",
  "Save vault": "保存保险库",
  "No hosts yet": "尚无主机",
  "Host name": "主机名称",
  "Server name": "服务器名称",
  Address: "地址",
  Tags: "标签",
  "Save host": "保存主机",
  "Confirm delete": "确认删除",
  "Delete host": "删除主机",
  Edit: "编辑",
  Close: "关闭",
  Delete: "删除",
  More: "更多",
  Connection: "连接",
  Protocol: "协议",
  Port: "端口",
  Username: "用户名",
  Identity: "身份",
  Group: "分组",
  Routing: "路由",
  "Jump host": "跳板机",
  Proxy: "代理",
  Environment: "环境变量",
  "Startup snippets": "启动片段",
  "Custom startup commands": "自定义启动命令",
  "Enter one command per line": "每行输入一条命令",
  "Custom command": "自定义命令",
  Status: "状态",
  Online: "在线",
  Offline: "离线",
  Connecting: "连接中",
  Failed: "失败",
  "Failed only": "仅失败项",
  "No matching history": "没有匹配的历史记录",
  "Adjust your search or clear the failed-only filter.": "请调整搜索条件或清除“仅失败项”筛选。",
  "Connect SSH": "连接 SSH",
  Authentication: "身份验证",
  Password: "密码",
  "Private key": "私钥",
  "Identity name": "身份名称",
  "Optional label for this private key": "此私钥的可选身份标签",
  "OpenSSH PEM content; encrypted in the local credential vault": "OpenSSH PEM 内容；将在应用内凭据库中加密保存",
  Unassigned: "未分配",
  Passphrase: "口令",
  "Verify SSH host key": "验证 SSH 主机密钥",
  "Trust and connect": "信任并连接",
  "SSH host key changed": "SSH 主机密钥已更改",
  Cancel: "取消",
  "Restart terminal": "重启终端",
  "Split right": "向右拆分",
  "Split down": "向下拆分",
  "Close active pane": "关闭当前窗格",
  "Local Terminal": "本地终端",
  "Command palette": "命令面板",
  "Run command": "运行命令",
  "Search commands": "搜索命令",
  "No commands found.": "未找到命令。",
  Hostname: "主机名",
  "Connect SFTP": "连接 SFTP",
  Local: "本地",
  Remote: "远程",
  Name: "名称",
  Size: "大小",
  Modified: "修改时间",
  Transfers: "传输",
  Upload: "上传",
  Download: "下载",
  Queued: "排队中",
  Transferring: "传输中",
  Completed: "已完成",
  Succeeded: "成功",
  "Open With": "打开方式",
  "Open with…": "打开方式…",
  "Conflict detected": "检测到冲突",
  Replace: "替换",
  Skip: "跳过",
  Rename: "重命名",
  Terminal: "终端",
  Shortcuts: "快捷键",
  "Known Hosts": "已知主机",
  Credentials: "凭据库",
  "AI Providers": "AI 供应商",
  "AI providers": "AI 供应商",
  "Add provider": "添加供应商",
  "Add AI provider": "添加 AI 供应商",
  "Edit AI provider": "编辑 AI 供应商",
  "Display name": "显示名称",
  "Provider type": "供应商类型",
  "Base URL": "基础 URL",
  "Model ID": "模型 ID",
  "API key": "API 密钥",
  "Test connection": "测试连接",
  "Testing…": "测试中…",
  Untested: "未测试",
  "Save provider": "保存供应商",
  "No AI providers configured yet.": "尚未配置 AI 供应商。",
  "Paste your API key": "粘贴 API 密钥",
  "Leave blank to keep the current key": "留空以保留当前密钥",
  "Encrypted and saved in the local provider configuration.": "已加密保存在本地供应商配置中。",
  "Local runtime — no API key required.": "本地运行时 — 无需 API 密钥。",
  "Verify the endpoint and API key before saving.": "保存前验证端点和 API 密钥。",
  "Connecting and probing endpoint…": "正在连接并探测端点…",
  General: "通用",
  Language: "语言",
  "Interface language": "界面语言",
  Chinese: "中文",
  English: "英文",
  Behavior: "行为",
  "Input handling for every terminal session": "所有终端会话的输入处理",
  "Right-click paste": "右键粘贴",
  "Paste from clipboard on secondary click": "右键时从剪贴板粘贴",
  "Terminal bell": "终端响铃",
  "Use Option key as Meta": "将 Option 键用作 Meta",
  Theme: "主题",
  "Preview foreground & background": "预览前景色和背景色",
  Font: "字体",
  "Missing fonts fall back to a system monospace": "缺少字体时使用系统等宽字体",
  Session: "会话",
  "Font size": "字体大小",
  "SSH keepalive interval": "SSH 保活间隔",
  "Scrollback lines": "回滚行数",
  "Local terminal shell": "本地终端 Shell",
  "Live preview": "实时预览",
  Preview: "预览",
  "Keyboard shortcuts": "键盘快捷键",
  "Known hosts": "已知主机",
  "No known hosts recorded.": "未记录任何已知主机。",
  "Preferences sections": "偏好设置分类",
  "Close preferences": "关闭偏好设置",
  Changelog: "更新日志",
  "Trusted host keys. A mismatch blocks the connection until you decide.": "受信任的主机密钥。密钥不匹配时会阻止连接，等待你决定。",
  Trusted: "已信任",
  "Key mismatch": "密钥不匹配",
  "New rule": "新建规则",
  Forwarding: "转发中",
  Stopped: "已停止",
  Active: "活动",
  Success: "成功",
  Reconnect: "重新连接",
  "Search history": "搜索历史记录",
  "No matching connections": "没有匹配的连接",
  Light: "浅色",
  Dark: "深色",
  System: "跟随系统",
  "Toggle theme": "切换主题",
  "Server password": "服务器密码",
  "Save credential for future connections": "保存凭据供后续连接使用",
  "Save private key for future connections": "保存私钥供后续连接使用",
  "Save password for future connections": "保存密码供后续连接使用",
  "Private key credentials": "私钥身份凭证",
  "Delete port forwarding rule": "删除端口转发规则",
  "Delete port forwarding rule?": "删除端口转发规则？",
  "Edit port forwarding rule": "编辑端口转发规则",
  "New port forwarding rule": "新建端口转发规则",
  "Edit rule": "编辑规则",
  "Create rule": "创建规则",
  "Rule name": "规则名称",
  "SSH host": "SSH 主机",
  "Bind address": "绑定地址",
  "Bind port": "绑定端口",
  "Target host": "目标主机",
  "Target port": "目标端口",
  "Edit server": "编辑服务器",
  "Save changes": "保存更改",
  "Baud rate": "波特率",
  Color: "颜色",
  "Device path": "设备路径",
  "Loading vaults…": "正在加载保险库…",
  "Local encryption key unavailable": "本地加密密钥不可用",
  "Restore the app data encryption key or reset local data.": "请恢复应用数据加密密钥，或重置本地数据。",
  "Inventory unavailable": "清单不可用",
  "The local inventory could not be opened.": "无法打开本地清单。",
  "Retry vault": "重试保险库",
  Retry: "重试",
  "Create a local vault to organize encrypted hosts.": "创建本地保险库来整理加密主机。",
  Host: "主机",
  "Choose a host…": "选择主机…",
  path: "路径",
  "Connecting…": "正在连接…",
  Connected: "已连接",
  "Transfer files between your machine and connected hosts": "在本机与已连接主机之间传输文件",
  "No SFTP connection": "无 SFTP 连接",
  "Choose a host above to browse and transfer files.": "请在上方选择主机以浏览和传输文件。",
  "Choose a host and remote path above, or pick a recent connection below.": "请在上方选择主机和远程路径，或从下方选择最近连接。",
  "Recent SFTP": "最近的 SFTP",
  "Opening SFTP session…": "正在打开 SFTP 会话…",
  "Verify SFTP host key": "验证 SFTP 主机密钥",
  "Compare this fingerprint through a trusted channel before connecting.": "连接前，请通过可信渠道核对该指纹。",
  Algorithm: "算法",
  Fingerprint: "指纹",
  "Couldn't connect": "无法连接",
  "The SFTP connection could not be opened.": "无法打开 SFTP 连接。",
  Dismiss: "忽略",
  Disconnect: "断开连接",
  "File associations": "文件关联",
  "SFTP file type associations": "SFTP 文件类型关联",
  "Local files": "本地文件",
  "Remote files": "远程文件",
  "Refresh local listing": "刷新本地列表",
  "Refresh remote listing": "刷新远程列表",
  "Current path": "当前路径",
  "Show hidden files": "显示隐藏文件",
  "This folder is empty.": "此文件夹为空。",
  "Loading…": "正在加载…",
  Actions: "操作",
  "Open With…": "打开方式…",
  "Open remote files with a local app after downloading": "下载远程文件后使用本地应用打开",
  "Conflict resolution": "冲突处理",
  "File already exists": "文件已存在",
  "Apply to all": "全部应用",
  "Remote file changed": "远程文件已更改",
  "The remote file changed while you were editing.": "远程文件在编辑期间发生了更改。",
  "New file name": "新文件名",
  "Run edited command": "运行编辑后的命令",
  Commands: "命令",
  "Toggle commands": "切换命令",
  "Terminal actions": "终端操作",
  "Search terminal": "搜索终端",
  "Resize split": "调整拆分大小",
  "New identity": "新建身份",
  "Edit identity": "编辑身份",
  "Save identity": "保存身份",
  "New key": "新建密钥",
  "No keys yet": "尚无密钥",
  "SSH key": "SSH 密钥",
  "SSH certificate": "SSH 证书",
  Type: "类型",
  Expires: "过期时间",
  "Passphrase-protected": "受口令保护",
  "Remove variable": "移除变量",
  "Select vault": "选择保险库",
  "Connect with SSH": "使用 SSH 连接",
  "Enter a valid hostname, port, and username.": "请输入有效的主机名、端口和用户名。",
  "Enter the selected SSH credential.": "请输入所选的 SSH 凭据。",
  "The SSH connection could not be opened.": "无法打开 SSH 连接。",
  "Update connection settings": "更新连接设置",
  Confirm: "确认",
  "Check for updates": "检查更新",
  "Checking…": "正在检查…",
  "Up to date": "已是最新版本",
  "Check failed — try again": "检查失败，请重试",
};

const replaceRules: Array<[RegExp, string]> = [
  [/^Buzz (.+) is available$/, "Buzz $1 可用"],
  [/^Delete (.+)$/, "删除 $1"],
  [/^Remove (.+)$/, "移除 $1"],
  [/^Connect (.+) with SSH$/, "使用 SSH 连接 $1"],
  [/^Toggle (.+)$/, "切换 $1"],
  [/^(\d+) recent connections across all hosts$/, "所有主机最近的 $1 个连接"],
  [/^(\d+) of (\d+) rules forwarding · local, remote & dynamic SOCKS$/, "$2 条规则中有 $1 条正在转发 · 本地、远程和动态 SOCKS"],
  [/^succeeded (\d+)$/, "成功 $1"],
  [/^(\d+) min ago$/, "$1 分钟前"],
  [/^(\d+) h ago$/, "$1 小时前"],
];

function translate(value: string): string {
  const trimmed = value.trim();
  const exact = zh[trimmed];
  if (exact) return value.replace(trimmed, exact);
  for (const [pattern, replacement] of replaceRules) {
    if (pattern.test(trimmed)) return value.replace(trimmed, trimmed.replace(pattern, replacement));
  }
  return value;
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (english: string) => string;
};

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => undefined,
  t: (value) => value,
});

function initialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en") return stored;
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);
  const t = useCallback((value: string) => (locale === "zh-CN" ? translate(value) : value), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={value}>
      <DocumentTranslator locale={locale} />
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

const originalText = new WeakMap<Text, string>();
const translatedAttributes = ["aria-label", "title", "placeholder"] as const;
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const editableSelector =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function findEditableRegion(node: Node): Element | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(editableSelector) ?? null;
}

function translateTree(root: Node, locale: Locale) {
  const editableRegion = findEditableRegion(root);
  if (editableRegion && editableRegion !== root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    const node = root as Text;
    if (!originalText.has(node)) originalText.set(node, node.data);
    const original = originalText.get(node) ?? node.data;
    const next = locale === "zh-CN" ? translate(original) : original;
    if (node.data !== next) node.data = next;
    return;
  }
  if (!(root instanceof Element) && root !== document.body) return;
  if (root instanceof Element) {
    let originals = originalAttributes.get(root);
    for (const name of translatedAttributes) {
      const current = root.getAttribute(name);
      if (current === null) continue;
      if (!originals) {
        originals = new Map();
        originalAttributes.set(root, originals);
      }
      if (!originals.has(name)) originals.set(name, current);
      const original = originals.get(name) ?? current;
      const next = locale === "zh-CN" ? translate(original) : original;
      if (current !== next) root.setAttribute(name, next);
    }
  }
  if (editableRegion) return;
  for (const child of root.childNodes) translateTree(child, locale);
}

function DocumentTranslator({ locale }: { locale: Locale }) {
  useEffect(() => {
    if (!document.body) return;
    translateTree(document.body, locale);
    if (locale === "en") return;
    const observer = new MutationObserver((records) => {
      observer.disconnect();
      for (const record of records) {
        if (record.type === "characterData") translateTree(record.target, locale);
        for (const node of record.addedNodes) translateTree(node, locale);
        if (record.type === "attributes") translateTree(record.target, locale);
      }
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...translatedAttributes],
      });
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...translatedAttributes],
    });
    return () => observer.disconnect();
  }, [locale]);
  return null;
}
