import { CAT, choice, multi, judge } from './lib.mjs';

const PORTS = [
  { protocol: 'FTP', port: '21', use: '文件传输' },
  { protocol: 'SSH', port: '22', use: '安全远程登录' },
  { protocol: 'Telnet', port: '23', use: '远程登录（明文）' },
  { protocol: 'SMTP', port: '25', use: '发送电子邮件' },
  { protocol: 'DNS', port: '53', use: '域名解析' },
  { protocol: 'HTTP', port: '80', use: '网页浏览' },
  { protocol: 'POP3', port: '110', use: '接收电子邮件（下载）' },
  { protocol: 'IMAP', port: '143', use: '接收电子邮件（服务器同步）' },
  { protocol: 'HTTPS', port: '443', use: '加密网页浏览' },
  { protocol: 'MySQL', port: '3306', use: 'MySQL 数据库' },
  { protocol: 'RDP', port: '3389', use: '远程桌面' },
  { protocol: 'NTP', port: '123', use: '时间同步' },
];

function portQuestions(out) {
  PORTS.slice(0, 10).forEach((item, index) => {
    const wrongs = [1, 2, 3].map((offset) => PORTS[(index + offset) % PORTS.length].port);
    out.push(
      choice(CAT.network, ['网络协议', '端口号'], 2, `${item.protocol} 协议默认使用的端口号是？`, item.port, wrongs, `${item.protocol} 默认端口为 ${item.port}，用于${item.use}。`),
    );
  });
  PORTS.slice(10).forEach((item, index) => {
    const wrongs = [1, 2, 3].map((offset) => PORTS[(index + offset) % PORTS.length].protocol);
    out.push(
      choice(CAT.network, ['网络协议', '端口号'], 3, `端口号 ${item.port} 默认用于哪个协议或服务？`, item.protocol, wrongs, `端口 ${item.port} 对应 ${item.protocol}（${item.use}）。`),
    );
  });
  out.push(
    multi(CAT.network, ['网络协议', '端口号'], 3, '下列协议与默认端口的对应关系，正确的有？', ['HTTP — 80', 'HTTPS — 443', 'DNS — 53'], ['SMTP — 110'], 'SMTP 默认端口为 25，110 是 POP3 的端口。'),
  );
  out.push(
    judge(CAT.network, ['网络协议', '端口号'], 2, 'HTTPS 使用 443 端口，HTTP 使用 80 端口。', true, 'HTTP 默认 80，HTTPS 默认 443。'),
  );
}

const LAYERS = [
  { protocol: 'HTTP', layer: '应用层' },
  { protocol: 'HTTPS', layer: '应用层' },
  { protocol: 'FTP', layer: '应用层' },
  { protocol: 'SMTP', layer: '应用层' },
  { protocol: 'DNS', layer: '应用层' },
  { protocol: 'DHCP', layer: '应用层' },
  { protocol: 'TCP', layer: '传输层' },
  { protocol: 'UDP', layer: '传输层' },
  { protocol: 'IP', layer: '网络层' },
  { protocol: 'ICMP', layer: '网络层' },
  { protocol: 'ARP', layer: '网络层' },
  { protocol: '以太网', layer: '数据链路层' },
];

function layerQuestions(out) {
  const allLayers = ['应用层', '传输层', '网络层', '数据链路层'];
  LAYERS.forEach((item, index) => {
    const wrongs = allLayers.filter((layer) => layer !== item.layer);
    out.push(
      choice(CAT.network, ['网络体系结构', '协议分层'], 2, `${item.protocol} 协议工作在哪一层？`, item.layer, wrongs, `${item.protocol} 属于${item.layer}协议。`),
    );
  });
  out.push(
    multi(CAT.network, ['网络体系结构', '协议分层'], 3, '以下属于应用层协议的有？', ['HTTP', 'DNS', 'SMTP'], ['TCP', 'IP'], 'HTTP、DNS、SMTP 属于应用层；TCP 属于传输层，IP 属于网络层。'),
  );
  out.push(
    multi(CAT.network, ['网络体系结构', '协议分层'], 3, '以下属于传输层协议的有？', ['TCP', 'UDP'], ['IP', 'HTTP', 'ARP'], '传输层主要协议是 TCP 和 UDP。'),
  );
  out.push(
    judge(CAT.network, ['网络体系结构'], 2, 'OSI 参考模型分为 7 层，TCP/IP 模型通常分为 4 层。', true, 'OSI 七层：物理、数据链路、网络、传输、会话、表示、应用；TCP/IP 四层：网络接口、网际、传输、应用。'),
  );
  out.push(
    judge(CAT.network, ['网络体系结构'], 2, 'IP 协议负责可靠传输，TCP 协议负责路由选择。', false, 'IP 负责寻址和路由转发，TCP 负责面向连接的可靠传输。'),
  );
}

function deviceQuestions(out) {
  const facts = [
    { stem: '路由器主要工作在 OSI 模型的哪一层？', correct: '网络层', wrongs: ['物理层', '数据链路层', '传输层'], exp: '路由器根据 IP 地址进行路由选择，工作在网络层。' },
    { stem: '交换机主要根据什么地址转发数据帧？', correct: 'MAC 地址', wrongs: ['IP 地址', '端口号', '域名'], exp: '二层交换机根据 MAC 地址表转发数据帧，工作在数据链路层。' },
    { stem: '集线器（Hub）工作在 OSI 模型的哪一层？', correct: '物理层', wrongs: ['数据链路层', '网络层', '传输层'], exp: '集线器只是对信号进行放大和广播，工作在物理层。' },
    { stem: '以下哪种设备可以连接两个不同的网络并选择转发路径？', correct: '路由器', wrongs: ['集线器', '中继器', '网卡'], exp: '路由器工作在网络层，可连接不同网络并选择路径。' },
    { stem: '网卡的主要功能是什么？', correct: '实现计算机与网络的物理连接和数据收发', wrongs: ['放大网络信号', '在不同网络间路由', '分配 IP 地址'], exp: '网卡（NIC）提供网络接口，负责数据帧的收发。' },
    { stem: '调制解调器（Modem）的主要作用是？', correct: '实现数字信号与模拟信号的转换', wrongs: ['放大光信号', '隔离冲突域', '进行域名解析'], exp: 'Modem 用于数字信号与模拟信号之间的调制与解调。' },
  ];
  facts.forEach((item) => {
    out.push(choice(CAT.network, ['网络设备'], 2, item.stem, item.correct, item.wrongs, item.exp));
  });
  out.push(
    multi(CAT.network, ['网络设备'], 2, '以下属于网络连接设备的有？', ['路由器', '交换机', '网卡'], ['显示器', '打印机'], '路由器、交换机、网卡用于网络连接；显示器和打印机属于外设。'),
  );
  out.push(
    judge(CAT.network, ['网络设备'], 2, '集线器所有端口共享同一带宽，容易产生冲突。', true, '集线器工作在物理层，所有端口处于同一冲突域，共享带宽。'),
  );
}

const EXTENSIONS = [
  { ext: '.docx', type: 'Word 文档' },
  { ext: '.xlsx', type: 'Excel 工作簿' },
  { ext: '.pptx', type: 'PowerPoint 演示文稿' },
  { ext: '.txt', type: '纯文本文件' },
  { ext: '.pdf', type: '便携式文档' },
  { ext: '.jpg', type: '图像文件' },
  { ext: '.png', type: '图像文件' },
  { ext: '.mp3', type: '音频文件' },
  { ext: '.wav', type: '音频文件' },
  { ext: '.mp4', type: '视频文件' },
  { ext: '.html', type: '网页文件' },
  { ext: '.py', type: 'Python 源程序' },
  { ext: '.exe', type: '可执行文件' },
  { ext: '.zip', type: '压缩文件' },
  { ext: '.lnk', type: '快捷方式' },
];

function extensionQuestions(out) {
  EXTENSIONS.slice(0, 10).forEach((item) => {
    const wrongs = EXTENSIONS.filter((other) => other.type !== item.type).slice(0, 3).map((other) => other.type);
    out.push(choice(CAT.basics, ['文件管理', '文件类型'], 1, `文件扩展名 ${item.ext} 通常表示哪种文件？`, item.type, wrongs, `${item.ext} 表示${item.type}。`));
  });
  out.push(choice(CAT.basics, ['文件管理', '文件类型'], 1, 'Word 文档的默认扩展名是？', '.docx', ['.xlsx', '.pptx', '.txt'], 'Word 文档默认扩展名为 .docx。'));
  out.push(choice(CAT.basics, ['文件管理', '文件类型'], 1, 'Excel 工作簿的默认扩展名是？', '.xlsx', ['.docx', '.pptx', '.pdf'], 'Excel 工作簿默认扩展名为 .xlsx。'));
  out.push(choice(CAT.basics, ['文件管理', '文件类型'], 1, 'PowerPoint 演示文稿的默认扩展名是？', '.pptx', ['.docx', '.xlsx', '.mp4'], 'PowerPoint 演示文稿默认扩展名为 .pptx。'));
  out.push(
    multi(CAT.basics, ['文件管理', '文件类型'], 2, '以下属于图像文件格式的有？', ['.jpg', '.png', '.gif'], ['.mp3', '.mp4'], 'jpg、png、gif 是图像格式；mp3 是音频，mp4 是视频。'),
  );
  out.push(
    judge(CAT.basics, ['文件管理', '文件类型'], 1, '扩展名 .exe 通常表示可执行文件。', true, '.exe 是 Windows 可执行程序文件。'),
  );
  out.push(
    judge(CAT.basics, ['文件管理', '文件类型'], 2, '文件扩展名只影响图标，与打开方式无关。', false, '扩展名用于标识文件类型，操作系统据此选择打开方式。'),
  );
}

const SHORTCUTS = [
  { key: 'Ctrl+C', action: '复制' },
  { key: 'Ctrl+V', action: '粘贴' },
  { key: 'Ctrl+X', action: '剪切' },
  { key: 'Ctrl+Z', action: '撤销' },
  { key: 'Ctrl+Y', action: '重做' },
  { key: 'Ctrl+S', action: '保存' },
  { key: 'Ctrl+A', action: '全选' },
  { key: 'Ctrl+F', action: '查找' },
  { key: 'Ctrl+H', action: '替换' },
  { key: 'Ctrl+P', action: '打印' },
  { key: 'Ctrl+B', action: '加粗' },
  { key: 'Ctrl+I', action: '斜体' },
  { key: 'Ctrl+U', action: '下划线' },
  { key: 'Alt+Tab', action: '切换窗口' },
  { key: 'Win+D', action: '显示桌面' },
  { key: 'Win+E', action: '打开资源管理器' },
  { key: 'Win+L', action: '锁定计算机' },
  { key: 'F2', action: '重命名' },
  { key: 'F5', action: '刷新' },
  { key: 'Ctrl+Shift+Esc', action: '打开任务管理器' },
];

function shortcutQuestions(out) {
  SHORTCUTS.slice(0, 14).forEach((item) => {
    const wrongs = SHORTCUTS.filter((other) => other.action !== item.action).slice(0, 3).map((other) => other.action);
    out.push(choice(CAT.basics, ['操作系统', '快捷键'], 1, `在 Windows 中，快捷键 ${item.key} 的功能是？`, item.action, wrongs, `${item.key} 用于${item.action}。`));
  });
  SHORTCUTS.slice(14).forEach((item, index) => {
    const wrongs = SHORTCUTS.filter((other) => other.key !== item.key).slice(index % 5, (index % 5) + 3).map((other) => other.key);
    out.push(choice(CAT.basics, ['操作系统', '快捷键'], 2, `在 Windows 中，要${item.action}，应使用哪个快捷键？`, item.key, wrongs, `${item.action}的快捷键是 ${item.key}。`));
  });
  out.push(
    multi(CAT.basics, ['操作系统', '快捷键'], 2, '在 Windows 中，下列快捷键与功能对应正确的有？', ['Ctrl+C — 复制', 'Ctrl+Z — 撤销', 'Win+E — 打开资源管理器'], ['Ctrl+S — 粘贴'], 'Ctrl+S 是保存，粘贴是 Ctrl+V。'),
  );
  out.push(
    judge(CAT.basics, ['操作系统', '快捷键'], 1, 'Ctrl+S 是保存，Ctrl+P 是打印。', true, 'Ctrl+S 保存，Ctrl+P 打印。'),
  );
}

function wildcardQuestions(out) {
  out.push(choice(CAT.basics, ['文件管理', '通配符'], 3, '在 Windows 搜索中，通配符 * 表示什么？', '任意多个字符', ['任意一个字符', '数字字符', '空格'], '* 表示任意多个字符，? 表示任意一个字符。'));
  out.push(choice(CAT.basics, ['文件管理', '通配符'], 3, '在 Windows 搜索中，? 表示什么？', '任意一个字符', ['任意多个字符', '一个数字', '一个汉字'], '? 匹配任意单个字符。'));
  out.push(choice(CAT.basics, ['文件管理', '通配符'], 3, '搜索 *.docx 表示查找什么？', '所有 Word 文档', ['所有文件', '文件名以 docx 开头的文件', '只有一个字符的文档'], '*.docx 匹配所有扩展名为 .docx 的文件。'));
  out.push(judge(CAT.basics, ['文件管理', '通配符'], 2, '*.txt 可以匹配 a.txt、b.txt 和 note.txt。', true, '*.txt 匹配所有扩展名为 .txt 的文件。'));
}

function booleanQuestions(out) {
  const cases = [
    ['逻辑运算 1 AND 0 的结果是？', '0', ['1', '2', '无法确定'], '与运算只要有一个为 0，结果就是 0。'],
    ['逻辑运算 1 OR 0 的结果是？', '1', ['0', '2', '无法确定'], '或运算只要有一个为 1，结果就是 1。'],
    ['逻辑运算 NOT 1 的结果是？', '0', ['1', '2', '无法确定'], '非运算对 1 取反得到 0。'],
    ['逻辑运算 1 XOR 1 的结果是？', '0', ['1', '2', '无法确定'], '异或运算相同为 0，不同为 1。'],
    ['逻辑运算 0 XOR 1 的结果是？', '1', ['0', '2', '无法确定'], '异或运算不同为 1。'],
    ['逻辑运算 1 AND 1 的结果是？', '1', ['0', '2', '无法确定'], '与运算两个都为 1 时结果才为 1。'],
  ];
  cases.forEach(([stem, correct, wrongs, exp]) => {
    out.push(choice(CAT.encoding, ['数据编码', '逻辑运算'], 2, stem, correct, wrongs, exp));
  });
  out.push(judge(CAT.encoding, ['数据编码', '逻辑运算'], 2, '逻辑与运算中，只要有一个操作数为 0，结果就为 0。', true, '与运算要求两个操作数都为 1 时结果才为 1。'));
}

function mediaQuestions(out) {
  out.push(choice(CAT.network, ['传输介质'], 2, '以下哪种传输介质抗电磁干扰能力最强？', '光纤', ['双绞线', '同轴电缆', '电话线'], '光纤传输光信号，不受电磁干扰影响，适合长距离高速传输。'));
  out.push(choice(CAT.network, ['传输介质'], 2, '双绞线常用的连接器是？', 'RJ-45', ['BNC', 'SC', 'USB'], '以太网双绞线常用 RJ-45 水晶头。'));
  out.push(choice(CAT.network, ['传输介质'], 2, '以下属于无线传输介质的是？', '无线电波', ['双绞线', '光纤', '同轴电缆'], '无线电波、微波、红外线属于无线传输介质。'));
  out.push(choice(CAT.network, ['传输介质'], 2, '光纤相比双绞线的优势不包括？', '价格更低、施工更简单', ['带宽更高', '抗干扰能力更强', '传输距离更远'], '光纤带宽高、抗干扰、传输远，但成本与施工要求通常更高。'));
  out.push(judge(CAT.network, ['传输介质'], 2, '双绞线传输距离较远时容易受到电磁干扰。', true, '双绞线抗干扰能力有限，长距离传输需中继或改用光纤。'));
  out.push(judge(CAT.network, ['传输介质'], 2, '无线网络不需要任何传输介质。', false, '无线网络使用无线电波等无线介质传输数据。'));
}

function securityQuestions(out) {
  out.push(choice(CAT.network, ['信息安全', '计算机病毒'], 2, '计算机病毒最重要的特征是？', '传染性', ['潜伏性', '破坏性', '可触发性'], '传染性是判断一段程序是否为计算机病毒的重要依据。'));
  out.push(choice(CAT.network, ['信息安全', '计算机病毒'], 2, '以下哪种病毒主要寄生在 Word、Excel 等文档的宏中？', '宏病毒', ['引导型病毒', '文件型病毒', '蠕虫病毒'], '宏病毒寄生于文档或模板的宏中，打开文档时被激活。'));
  out.push(choice(CAT.network, ['信息安全', '防火墙'], 2, '防火墙的主要作用是？', '控制进出网络的访问', ['清除所有计算机病毒', '提高网络带宽', '分配 IP 地址'], '防火墙依据规则过滤进出网络的流量，不能替代杀毒软件。'));
  out.push(choice(CAT.network, ['信息安全', '密码安全'], 2, '以下哪种密码相对最安全？', '长度较长且包含大小写字母、数字和符号', ['12345678', '生日日期', '用户名加 123'], '强密码应足够长、包含多种字符类型且不含个人信息。'));
  out.push(choice(CAT.network, ['信息安全', '加密'], 3, '对称加密的特点是？', '加密和解密使用同一密钥', ['使用公钥加密、私钥解密', '不需要密钥', '只能加密文本'], '对称加密加解密使用同一密钥，速度快但密钥分发难度大。'));
  out.push(choice(CAT.network, ['信息安全', '恶意软件'], 2, '木马程序的主要危害是？', '窃取账号密码或远程控制主机', ['自我复制堵塞网络', '破坏计算机硬件', '自动格式化硬盘'], '木马通常伪装成正常程序，窃取信息或建立远程控制。'));
  out.push(choice(CAT.network, ['信息安全', '备份'], 2, '“3-2-1”备份原则的含义是？', '至少 3 份备份、2 种介质、1 份异地保存', ['备份 3 次、2 天内完成、1 次验证', '3 台服务器、2 个机房、1 个管理员', '3 个文件、2 个文件夹、1 个硬盘'], '3-2-1 原则用于降低数据丢失风险。'));
  out.push(
    multi(CAT.network, ['信息安全', '计算机病毒'], 2, '计算机病毒的常见特征包括？', ['传染性', '潜伏性', '破坏性'], ['免疫性'], '病毒通常具有传染性、潜伏性、破坏性、隐蔽性等特征。'),
  );
  out.push(judge(CAT.network, ['信息安全'], 2, '安装杀毒软件并保持病毒库更新可以降低病毒感染风险。', true, '及时更新病毒库、安装补丁、不打开可疑文件是常见防护措施。'));
  out.push(judge(CAT.network, ['信息安全'], 2, '收到陌生邮件附件时应直接打开查看内容。', false, '陌生附件可能携带病毒或木马，应先核实来源并扫描。'));
}

function aiQuestions(out) {
  out.push(choice(CAT.ai, ['人工智能', '发展历程'], 2, '“图灵测试”是由谁提出的？', '阿兰·图灵', ['冯·诺依曼', '约翰·麦卡锡', '比尔·盖茨'], '图灵于 1950 年提出图灵测试，用于判断机器是否具有智能。'));
  out.push(choice(CAT.ai, ['人工智能', '发展历程'], 3, '人工智能作为一门学科正式诞生的标志通常认为是？', '1956 年达特茅斯会议', ['1946 年 ENIAC 诞生', '1969 年阿帕网建立', '1997 年深蓝战胜卡斯帕罗夫'], '1956 年达特茅斯会议首次提出“人工智能”一词，被视为学科起点。'));
  out.push(choice(CAT.ai, ['人工智能', '机器学习'], 3, '监督学习与无监督学习的主要区别是什么？', '训练数据是否带有标签', ['是否使用神经网络', '是否需要计算机', '是否处理图像'], '监督学习使用带标签数据，无监督学习使用无标签数据。'));
  out.push(choice(CAT.ai, ['人工智能', '深度学习'], 3, '深度学习中的“深度”主要指什么？', '神经网络具有多个隐藏层', ['数据量非常大', '训练时间很长', '模型体积很大'], '深度学习使用多层神经网络自动提取特征。'));
  out.push(choice(CAT.ai, ['人工智能', '应用'], 2, '人脸识别属于人工智能的哪个应用领域？', '计算机视觉', ['自然语言处理', '语音识别', '知识图谱'], '人脸识别属于计算机视觉中的图像识别任务。'));
  out.push(choice(CAT.ai, ['人工智能', '应用'], 2, '机器翻译主要属于人工智能的哪个方向？', '自然语言处理', ['计算机视觉', '强化学习', '机器人控制'], '机器翻译处理自然语言的理解与生成，属于 NLP。'));
  out.push(choice(CAT.ai, ['人工智能', '基本概念'], 2, '人工智能的三大要素通常指？', '数据、算法、算力', ['硬件、软件、网络', '输入、处理、输出', '感知、决策、执行'], '数据提供素材，算法决定方法，算力支撑训练与推理。'));
  out.push(choice(CAT.ai, ['人工智能', '强化学习'], 3, '强化学习的主要特点是通过什么来学习？', '与环境交互并获得奖励反馈', ['人工标注的标签', '大规模无标签数据聚类', '预先编写的规则'], '强化学习通过试错与环境交互，依据奖励信号优化策略。'));
  out.push(
    multi(CAT.ai, ['人工智能', '应用'], 2, '以下属于人工智能典型应用的有？', ['语音助手', '智能推荐', '自动驾驶'], ['人工计算器', '纸质地图'], '语音助手、推荐系统、自动驾驶均属于 AI 应用。'),
  );
  out.push(
    multi(CAT.ai, ['人工智能', '伦理'], 3, '人工智能应用可能带来的伦理或社会问题包括？', ['算法偏见', '隐私泄露', '深度伪造'], ['计算机无法开机'], '算法偏见、隐私、深度伪造是 AI 治理关注的重点。'),
  );
  out.push(judge(CAT.ai, ['人工智能'], 2, '生成式人工智能可以生成文本、图像、音频等内容。', true, '生成式 AI 基于模型生成新的文本、图像、音视频等内容。'));
  out.push(judge(CAT.ai, ['人工智能'], 2, '人工智能已经具备与人类完全相同的情感和意识。', false, '当前人工智能主要是专用智能，不具备人类意义上的意识与情感。'));
  out.push(judge(CAT.ai, ['人工智能'], 2, '训练数据中的偏见可能导致人工智能系统产生歧视性结果。', true, '模型会学习训练数据中的偏差，需要通过数据治理与评估降低风险。'));
  out.push(judge(CAT.ai, ['人工智能'], 1, '“弱人工智能”指只能在特定领域完成特定任务的人工智能。', true, '弱人工智能（专用 AI）专注于特定任务，如语音识别、图像分类。'));
}

function lawQuestions(out) {
  const facts = [
    ['我国《网络安全法》自哪一年开始施行？', '2017 年', ['2015 年', '2019 年', '2021 年'], '《中华人民共和国网络安全法》自 2017 年 6 月 1 日起施行。'],
    ['我国《数据安全法》自哪一年开始施行？', '2021 年', ['2017 年', '2019 年', '2023 年'], '《数据安全法》自 2021 年 9 月 1 日起施行。'],
    ['我国《个人信息保护法》自哪一年开始施行？', '2021 年', ['2017 年', '2019 年', '2023 年'], '《个人信息保护法》自 2021 年 11 月 1 日起施行。'],
    ['以下哪部法律主要保护文学、艺术和科学作品作者的著作权？', '《著作权法》', ['《网络安全法》', '《数据安全法》', '《个人信息保护法》'], '《著作权法》保护作品著作权，包括计算机软件作品。'],
  ];
  facts.forEach(([stem, correct, wrongs, exp]) => {
    out.push(choice(CAT.responsibility, ['信息社会责任', '法律法规'], 3, stem, correct, wrongs, exp));
  });
  out.push(choice(CAT.responsibility, ['信息社会责任', '网络道德'], 2, '在网上看到未经证实的消息时，正确的做法是？', '先核实来源，不随意转发', ['立即转发给同学', '添加夸张标题后发布', '编造细节吸引关注'], '不造谣、不信谣、不传谣是基本的网络素养。'));
  out.push(choice(CAT.responsibility, ['信息社会责任', '隐私保护'], 2, '以下哪种行为可能侵犯他人隐私？', '未经同意公开他人身份证号', ['在正规网站设置强密码', '关闭不必要的定位权限', '定期修改密码'], '身份证号属于敏感个人信息，未经同意公开可能侵犯隐私。'));
  out.push(choice(CAT.responsibility, ['信息社会责任', '知识产权'], 2, '使用他人软件时，正确的做法是？', '购买正版或使用开源许可允许的软件', ['随意复制破解版', '把序列号公开分享', '去除版权标识后传播'], '应尊重软件著作权，使用正版或遵守开源许可。'));
  out.push(
    multi(CAT.responsibility, ['信息社会责任', '网络道德'], 2, '下列行为符合信息社会责任的有？', ['不传播网络谣言', '尊重他人隐私', '使用正版软件'], ['破解并传播付费软件'], '不造谣、保护隐私、尊重知识产权是负责任的信息行为。'),
  );
  out.push(
    judge(CAT.responsibility, ['信息社会责任', '法律法规'], 2, '网络空间不是法外之地，网上言行同样受法律约束。', true, '网络空间同样需要遵守法律法规和道德规范。'),
  );
  out.push(
    judge(CAT.responsibility, ['信息社会责任', '人工智能伦理'], 3, '使用 AI 生成他人肖像并发布到网上，不需要考虑肖像权问题。', false, '使用 AI 生成或发布他人肖像可能涉及肖像权、名誉权等法律问题。'),
  );
}

function officeFactQuestions(out) {
  out.push(choice(CAT.office, ['文字处理', 'Word'], 2, '在 Word 中，要强制从当前位置开始新的一页，应插入？', '分页符', ['分节符', '换行符', '制表符'], '分页符用于强制分页，快捷键为 Ctrl+Enter。'));
  out.push(choice(CAT.office, ['文字处理', 'Word'], 2, 'Word 中用于统一设置文档各级标题格式的功能是？', '样式', ['格式刷', '页眉', '批注'], '样式可统一管理标题、正文等格式，便于生成目录。'));
  out.push(choice(CAT.office, ['文字处理', 'Word'], 2, 'Word 文档中，页眉和页脚通常用于放置？', '页码、文档标题等重复信息', ['正文段落', '图片说明', '脚注内容'], '页眉页脚位于页面上下边距区域，常用于页码、标题等。'));
  out.push(choice(CAT.office, ['电子表格', 'Excel'], 2, 'Excel 中要对数据进行分类汇总，首先应做什么？', '按分类字段排序', ['插入图表', '冻结窗格', '设置条件格式'], '分类汇总前需按分类字段排序，使相同类别连续排列。'));
  out.push(choice(CAT.office, ['演示文稿', 'PowerPoint'], 2, 'PowerPoint 中，从第一张幻灯片开始放映的快捷键是？', 'F5', ['Shift+F5', 'Ctrl+F5', 'Alt+F5'], 'F5 从头放映，Shift+F5 从当前幻灯片放映。'));
  out.push(
    multi(CAT.office, ['电子表格', 'Excel'], 2, 'Excel 中可用于数据分析和处理的功能有？', ['排序', '筛选', '数据透视表'], ['分页符', '页眉页脚'], '排序、筛选、数据透视表用于数据分析；分页符和页眉页脚属于页面设置。'),
  );
  out.push(
    judge(CAT.office, ['文字处理', 'Word'], 2, 'Word 中的格式刷可以复制文字格式。', true, '格式刷用于复制字符或段落格式。'),
  );
  out.push(
    judge(CAT.office, ['演示文稿', 'PowerPoint'], 2, 'PowerPoint 中幻灯片切换效果和动画效果是同一个概念。', false, '切换是幻灯片之间的过渡，动画是幻灯片内对象的运动效果。'),
  );
}

function hardwareQuestions(out) {
  out.push(choice(CAT.basics, ['计算机组成'], 2, '冯·诺依曼体系结构计算机的五大部件是？', '运算器、控制器、存储器、输入设备、输出设备', ['CPU、内存、硬盘、显示器、键盘', '主板、CPU、内存、显卡、电源', '运算器、存储器、输入设备、输出设备、总线'], '五大部件：运算器、控制器、存储器、输入设备、输出设备。'));
  out.push(choice(CAT.basics, ['计算机组成', 'CPU'], 2, 'CPU 主要由哪两部分组成？', '运算器和控制器', ['内存和硬盘', '输入设备和输出设备', '主板和显卡'], 'CPU 由运算器（ALU）和控制器（CU）组成，并包含寄存器、缓存等。'));
  out.push(choice(CAT.basics, ['计算机组成', '存储器'], 2, '断电后数据会丢失的存储器是？', 'RAM', ['ROM', '硬盘', 'U 盘'], 'RAM 是易失性存储器，断电后数据丢失。'));
  out.push(choice(CAT.basics, ['计算机组成', '存储器'], 2, 'BIOS 程序通常存放在哪种存储器中？', 'ROM', ['RAM', '硬盘', 'Cache'], 'BIOS 固化在主板 ROM 芯片中。'));
  out.push(choice(CAT.basics, ['计算机组成', 'Cache'], 2, 'Cache（高速缓存）的主要作用是？', '缓解 CPU 与内存之间的速度差异', ['永久保存用户文件', '扩大硬盘容量', '提供网络连接'], 'Cache 位于 CPU 与内存之间，速度快、容量小，用于提高访问效率。'));
  out.push(choice(CAT.basics, ['计算机组成', '外存'], 2, '以下属于外部存储器的是？', '固态硬盘（SSD）', ['寄存器', 'Cache', 'RAM'], 'SSD、机械硬盘、U 盘等属于外存；寄存器、Cache、RAM 属于内存体系。'));
  out.push(choice(CAT.basics, ['计算机组成', '输入输出'], 2, '以下属于输出设备的是？', '打印机', ['扫描仪', '键盘', '鼠标'], '打印机输出结果；扫描仪、键盘、鼠标属于输入设备。'));
  out.push(choice(CAT.basics, ['计算机组成', '总线'], 2, '计算机中用于连接各部件并传输数据、地址和控制信号的部件是？', '总线', ['寄存器', '硬盘', '电源'], '总线分为数据总线、地址总线和控制总线。'));
  out.push(
    multi(CAT.basics, ['计算机组成', '输入设备'], 2, '以下属于输入设备的有？', ['键盘', '鼠标', '扫描仪'], ['显示器', '打印机'], '键盘、鼠标、扫描仪用于输入；显示器和打印机用于输出。'),
  );
  out.push(
    judge(CAT.basics, ['计算机组成'], 2, 'CPU 的主频越高，通常运算速度越快，但还受核心数、缓存等因素影响。', true, '主频是重要指标，但不是唯一决定因素。'),
  );
  out.push(
    judge(CAT.basics, ['计算机组成', '存储器'], 2, 'ROM 断电后数据会丢失。', false, 'ROM 是非易失性存储器，断电后内容仍保留。'),
  );
}

function complexityQuestions(out) {
  const facts = [
    ['冒泡排序在最坏情况下的时间复杂度是？', 'O(n²)', ['O(n)', 'O(log n)', 'O(n log n)'], '冒泡排序需要多轮比较交换，最坏为 O(n²)。'],
    ['二分查找的平均时间复杂度是？', 'O(log n)', ['O(n)', 'O(n²)', 'O(1)'], '每次将查找区间缩小一半，复杂度为 O(log n)。'],
    ['顺序查找的时间复杂度是？', 'O(n)', ['O(log n)', 'O(n²)', 'O(1)'], '顺序查找需要逐个比较，最坏为 O(n)。'],
    ['快速排序的平均时间复杂度是？', 'O(n log n)', ['O(n)', 'O(n²)', 'O(log n)'], '快速排序平均 O(n log n)，最坏可能退化为 O(n²)。'],
    ['归并排序的时间复杂度是？', 'O(n log n)', ['O(n²)', 'O(n)', 'O(log n)'], '归并排序稳定地达到 O(n log n)。'],
    ['插入排序在最坏情况下的时间复杂度是？', 'O(n²)', ['O(n log n)', 'O(n)', 'O(1)'], '插入排序最坏为 O(n²)，数据基本有序时接近 O(n)。'],
  ];
  facts.forEach(([stem, correct, wrongs, exp]) => {
    out.push(choice(CAT.structure, ['算法分析', '时间复杂度'], 3, stem, correct, wrongs, exp));
  });
  out.push(judge(CAT.structure, ['算法分析'], 2, '二分查找要求数据必须有序。', true, '二分查找通过比较中间元素缩小范围，前提是数据有序。'));
  out.push(judge(CAT.structure, ['算法分析'], 2, '时间复杂度 O(1) 表示算法执行时间固定，不随数据规模增长。', true, 'O(1) 为常数阶，执行时间与输入规模无关。'));
}

export function buildTemplatesFacts() {
  const out = [];
  portQuestions(out);
  layerQuestions(out);
  deviceQuestions(out);
  extensionQuestions(out);
  shortcutQuestions(out);
  wildcardQuestions(out);
  booleanQuestions(out);
  mediaQuestions(out);
  securityQuestions(out);
  aiQuestions(out);
  lawQuestions(out);
  officeFactQuestions(out);
  hardwareQuestions(out);
  complexityQuestions(out);
  return out;
}
