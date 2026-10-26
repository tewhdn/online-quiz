import { CAT, choice, multi, judge, randInt, numericWrongs, pick } from './lib.mjs';

const bin8 = (n) => n.toString(2).padStart(8, '0');
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const num = (n) => String(Math.round(n * 100) / 100);

// ---------------------------------------------------------------------------
// 一、进制转换
// ---------------------------------------------------------------------------
function baseConversion(out) {
  const used = new Set();
  let guard = 0;
  while (out.length < 36 && guard < 400) {
    guard += 1;
    const kind = out.length % 6;
    if (kind === 0) {
      const n = randInt(37, 250);
      const stem = `十进制数 ${n} 转换为二进制数是？`;
      if (used.has(stem)) continue;
      used.add(stem);
      const correct = bin8(n);
      out.push(
        choice(CAT.encoding, ['进制转换', '二进制'], 2, stem, correct, [
          bin8(n + 1),
          bin8(n - 1),
          bin8(n + 2 > 255 ? n - 2 : n + 2),
        ], `除 2 取余、逆序排列：${n} = ${correct}B。`),
      );
    } else if (kind === 1) {
      const n = randInt(40, 250);
      const stem = `二进制数 ${bin8(n)} 转换为十进制数是？`;
      if (used.has(stem)) continue;
      used.add(stem);
      out.push(
        choice(CAT.encoding, ['进制转换', '二进制'], 2, stem, String(n), [
          String(n + 1),
          String(n - 1),
          String(n + 16),
        ], `按权展开：${bin8(n)}B = ${n}。`),
      );
    } else if (kind === 2) {
      const n = randInt(20, 250);
      const correct = hex2(n);
      const stem = `十进制数 ${n} 转换为十六进制数是？`;
      if (used.has(stem)) continue;
      used.add(stem);
      out.push(
        choice(CAT.encoding, ['进制转换', '十六进制'], 2, stem, correct, [
          hex2(n + 1 > 255 ? n - 1 : n + 1),
          hex2(n - 1),
          hex2(n + 16 > 255 ? n - 16 : n + 16),
        ], `除 16 取余、逆序排列，得到 ${correct}H。`),
      );
    } else if (kind === 3) {
      const n = randInt(16, 255);
      const stem = `十六进制数 ${hex2(n)}H 转换为十进制数是？`;
      if (used.has(stem)) continue;
      used.add(stem);
      out.push(
        choice(CAT.encoding, ['进制转换', '十六进制'], 2, stem, String(n), [
          String(n + 1),
          String(n - 1),
          String(n + 10),
        ], `按 16 的权展开：${hex2(n)}H = ${n}。`),
      );
    } else if (kind === 4) {
      const n = randInt(20, 250);
      const correct = n.toString(8);
      const stem = `十进制数 ${n} 转换为八进制数是？`;
      if (used.has(stem)) continue;
      used.add(stem);
      out.push(
        choice(CAT.encoding, ['进制转换', '八进制'], 2, stem, correct, [
          (n + 1).toString(8),
          (n - 1).toString(8),
          (n + 8).toString(8),
        ], `除 8 取余、逆序排列，得到 ${correct}O。`),
      );
    } else {
      const n = randInt(20, 250);
      const stem = `二进制数 ${bin8(n)} 转换为八进制数是？`;
      if (used.has(stem)) continue;
      used.add(stem);
      const correct = n.toString(8);
      out.push(
        choice(CAT.encoding, ['进制转换', '八进制'], 3, stem, correct, [
          (n + 1).toString(8),
          (n - 1).toString(8),
          (n + 2).toString(8),
        ], `二进制转八进制：从右向左每 3 位一组，得到 ${correct}O。`),
      );
    }
  }

  const p1 = randInt(1, 9);
  out.push(
    choice(CAT.encoding, ['进制转换', '十六进制'], 2, '二进制数 1011B 转换为十六进制数是？', 'B', ['A', 'C', 'D'], '1011B = 11 = BH。'),
  );
  out.push(
    choice(CAT.encoding, ['进制转换'], 1, '计算机内部采用哪种数制表示和处理数据？', '二进制', ['十进制', '八进制', '十六进制'], '二进制只有 0 和 1 两种状态，电路实现简单、可靠。'),
  );
  out.push(
    judge(CAT.encoding, ['进制转换'], 1, '十六进制数 A5H 转换为十进制数是 165。', true, 'A×16 + 5 = 10×16 + 5 = 165。'),
  );
  out.push(
    judge(CAT.encoding, ['进制转换'], 2, '八进制数的基数是 8，逢八进一。', true, '八进制有 0-7 共 8 个数码，逢八进一。'),
  );
  out.push(
    multi(CAT.encoding, ['进制转换'], 3, '下列关于进制转换的说法，正确的有？', ['二进制转八进制时每 3 位一组', '二进制转十六进制时每 4 位一组', '十进制转二进制采用除 2 取余法'], ['八进制转二进制时每 4 位一组'], '八进制对应 3 位二进制，十六进制对应 4 位二进制。'),
  );
  out.push(
    choice(CAT.encoding, ['进制转换'], 2, '二进制数 11111111B 对应的十进制数是？', '255', ['254', '256', '128'], '8 位全 1 即 2^8-1 = 255。'),
  );
}

// ---------------------------------------------------------------------------
// 二、ASCII / 字符编码
// ---------------------------------------------------------------------------
function asciiQuestions(out) {
  for (let i = 0; i < 8; i += 1) {
    const base = i < 4 ? 65 : 97;
    const char = String.fromCharCode(base + i);
    const code = base + i;
    out.push(
      choice(CAT.encoding, ['字符编码', 'ASCII码'], 2, `字符 '${char}' 的 ASCII 码值是多少？`, String(code), [String(code + 1), String(code - 1), String(code + 32)], `大写字母 A 的 ASCII 码为 65，'${char}' 为 ${code}；小写字母 a 为 97。`),
    );
  }
  const digit = randInt(0, 9);
  out.push(
    choice(CAT.encoding, ['字符编码', 'ASCII码'], 2, `数字字符 '${digit}' 的 ASCII 码值是多少？`, String(48 + digit), [String(48 + digit + 1), String(48 + digit - 1), String(48 + digit + 16)], "数字字符 '0' 的 ASCII 码为 48，依次递增。"),
  );
  out.push(
    choice(CAT.encoding, ['字符编码', 'ASCII码'], 3, '字符 A 与字符 a 的 ASCII 码值相差多少？', '32', ['16', '26', '64'], '小写字母比对应大写字母的 ASCII 码大 32。'),
  );
  out.push(
    choice(CAT.encoding, ['字符编码', 'ASCII码'], 2, '下列字符中，ASCII 码值最大的是？', 'a', ['A', 'Z', '9'], '大写字母 < 小写字母，且 a 的 ASCII 码为 97，大于大写字母和数字。'),
  );
  out.push(
    judge(CAT.encoding, ['字符编码', 'ASCII码'], 2, '标准 ASCII 码使用 7 位二进制编码，共可表示 128 个字符。', true, '7 位可表示 2^7 = 128 个字符，存储时通常占 1 个字节。'),
  );
  out.push(
    judge(CAT.encoding, ['字符编码', 'Unicode'], 3, 'Unicode 只定义字符的编号，不规定具体的存储方式。', true, 'Unicode 定义码点，UTF-8、UTF-16 等是实现（存储）方式。'),
  );
}

// ---------------------------------------------------------------------------
// 三、汉字编码
// ---------------------------------------------------------------------------
function chineseEncoding(out) {
  const pairs = [[16, 1], [20, 10], [25, 21], [30, 40], [45, 55], [32, 16]];
  pairs.forEach(([qu, wei], index) => {
    const guobiao = `${hex2(qu + 32)}${hex2(wei + 32)}H`;
    const neima = `${hex2(qu + 160)}${hex2(wei + 160)}H`;
    const stem = `某汉字的区位码为 ${String(qu).padStart(2, '0')}${String(wei).padStart(2, '0')}，其${index % 2 === 0 ? '国标码' : '机内码'}是？`;
    out.push(
      choice(CAT.encoding, ['汉字编码'], 4, stem, index % 2 === 0 ? guobiao : neima, index % 2 === 0 ? [neima, `${hex2(qu + 32)}${hex2(wei + 33)}H`, `${hex2(qu + 33)}${hex2(wei + 32)}H`] : [guobiao, `${hex2(qu + 160)}${hex2(wei + 161)}H`, `${hex2(qu + 161)}${hex2(wei + 160)}H`], index % 2 === 0 ? `国标码 = 区位码（区号、位号分别转十六进制）+ 2020H，得到 ${guobiao}。` : `机内码 = 国标码 + 8080H，即区位码 + A0A0H，得到 ${neima}。`),
    );
  });
  out.push(
    choice(CAT.encoding, ['汉字编码'], 2, '汉字输入码（外码）的主要作用是什么？', '把汉字通过键盘输入计算机', ['用于汉字在屏幕上的显示', '用于汉字在计算机内部存储', '用于汉字打印输出'], '输入码面向输入，机内码用于存储处理，字形码用于显示和打印。'),
  );
  out.push(
    choice(CAT.encoding, ['汉字编码'], 2, '汉字字形码的主要用途是？', '在屏幕或打印机上输出汉字字形', ['键盘输入汉字', '计算机内部存储汉字', '汉字与 ASCII 码转换'], '字形码描述汉字点阵或轮廓，用于显示与打印。'),
  );
  out.push(
    judge(CAT.encoding, ['汉字编码'], 3, '汉字的机内码是在国标码的基础上加 8080H 得到的。', true, '这是为了避免与 ASCII 码混淆，使汉字机内码两个字节的最高位均为 1。'),
  );
  out.push(
    judge(CAT.encoding, ['汉字编码'], 2, '点阵字库中的每个点通常用一个二进制位表示。', true, '点阵中一个点对应一个二进制位，1 表示有点，0 表示无点。'),
  );
}

// ---------------------------------------------------------------------------
// 四、存储单位
// ---------------------------------------------------------------------------
function units(out) {
  const cases = [
    ['1 KB 等于多少字节？', '1024', ['1000', '512', '2048'], '1 KB = 1024 B。'],
    ['1 MB 等于多少 KB？', '1024', ['1000', '512', '2048'], '1 MB = 1024 KB。'],
    ['1 GB 等于多少 MB？', '1024', ['1000', '512', '4096'], '1 GB = 1024 MB。'],
    ['1 TB 等于多少 GB？', '1024', ['1000', '512', '2048'], '1 TB = 1024 GB。'],
    ['1 字节（Byte）等于多少位（bit）？', '8', ['4', '16', '1024'], '1 Byte = 8 bit。'],
    ['2 GB 等于多少 MB？', '2048', ['2000', '1024', '4096'], '2 × 1024 = 2048 MB。'],
    ['4 MB 等于多少 KB？', '4096', ['4000', '2048', '8192'], '4 × 1024 = 4096 KB。'],
    ['8 GB 等于多少 MB？', '8192', ['8000', '4096', '16384'], '8 × 1024 = 8192 MB。'],
    ['0.5 MB 等于多少 KB？', '512', ['500', '256', '1024'], '0.5 × 1024 = 512 KB。'],
    ['16 GB 等于多少 MB？', '16384', ['16000', '8192', '32768'], '16 × 1024 = 16384 MB。'],
  ];
  cases.forEach(([stem, correct, wrongs, explanation]) => {
    out.push(choice(CAT.basics, ['存储单位'], 1, stem, correct, wrongs, explanation));
  });
  out.push(
    choice(CAT.basics, ['存储单位'], 2, '下列存储容量最大的是？', '1 TB', ['1 GB', '1 MB', '1 KB'], '1 TB > 1 GB > 1 MB > 1 KB。'),
  );
  out.push(
    judge(CAT.basics, ['存储单位'], 1, '1 GB 等于 1000 MB。', false, '计算机中按二进制换算，1 GB = 1024 MB。'),
  );
  out.push(
    multi(CAT.basics, ['存储单位'], 2, '下列换算关系正确的有？', ['1 KB = 1024 B', '1 MB = 1024 KB', '1 Byte = 8 bit'], ['1 GB = 1000 MB'], '存储单位按 1024 进制换算，1 Byte = 8 bit。'),
  );
}

// ---------------------------------------------------------------------------
// 五、图像与声音容量
// ---------------------------------------------------------------------------
function imageAudio(out) {
  const images = [
    [640, 480, 8], [800, 600, 24], [1024, 768, 24], [1280, 720, 16], [1920, 1080, 32], [1024, 768, 8],
  ];
  images.forEach(([w, h, bpp]) => {
    const kb = (w * h * bpp) / 8 / 1024;
    const correct = num(kb);
    const stem = `一幅分辨率为 ${w}×${h}、颜色深度为 ${bpp} 位的未压缩位图图像，其存储容量约为多少 KB？`;
    out.push(
      choice(CAT.encoding, ['数据编码', '图像容量'], 4, stem, `${correct} KB`, [`${num(kb / 2)} KB`, `${num(kb * 2)} KB`, `${num(kb / 8)} KB`], `容量 = 宽 × 高 × 颜色深度 ÷ 8 = ${w}×${h}×${bpp}÷8 = ${num(w * h * bpp / 8)} B ≈ ${correct} KB。`),
    );
  });
  const audios = [
    [8000, 8, 1, 10], [16000, 16, 1, 10], [44100, 16, 2, 10], [22050, 16, 1, 5], [44100, 16, 2, 60],
  ];
  audios.forEach(([rate, bits, channels, seconds]) => {
    const kb = (rate * bits * channels * seconds) / 8 / 1024;
    const correct = num(kb);
    const stem = `采样频率 ${rate} Hz、量化位数 ${bits} 位、${channels === 1 ? '单' : '双'}声道、时长 ${seconds} 秒的未压缩音频，容量约为多少 KB？`;
    out.push(
      choice(CAT.encoding, ['数据编码', '音频容量'], 4, stem, `${correct} KB`, [`${num(kb / 2)} KB`, `${num(kb * 2)} KB`, `${num(kb / 4)} KB`], `容量 = 采样频率 × 量化位数 × 声道数 × 时长 ÷ 8 = ${rate}×${bits}×${channels}×${seconds}÷8 B ≈ ${correct} KB。`),
    );
  });
  out.push(
    choice(CAT.encoding, ['数据编码', '图像'], 2, '位图图像与矢量图形相比，其主要特点是？', '放大后容易出现锯齿或模糊', ['放大后不会失真', '文件通常比矢量图小', '由数学公式描述图形'], '位图由像素组成，放大后会失真；矢量图由图形指令描述，可无损缩放。'),
  );
  out.push(
    choice(CAT.encoding, ['数据编码', '图像'], 2, '某图像每个像素用 8 位二进制表示，理论上可表示多少种颜色？', '256', ['16', '64', '1024'], '2^8 = 256 种颜色。'),
  );
  out.push(
    judge(CAT.encoding, ['数据编码', '音频'], 2, '采样频率越高、量化位数越大，数字化后的音频质量通常越好，但文件也越大。', true, '采样与量化精度提高会提升音质，同时增加数据量。'),
  );
}

// ---------------------------------------------------------------------------
// 六、Excel 计算
// ---------------------------------------------------------------------------
function excelQuestions(out) {
  const datasets = [
    { values: [12, 25, 8, 40, 17, 30], range: 'A1:A6' },
    { values: [5, 9, 14, 20, 23, 31], range: 'A1:A6' },
    { values: [18, 6, 27, 11, 35, 22], range: 'A1:A6' },
  ];
  const funcs = [
    { name: 'SUM', calc: (v) => v.reduce((a, b) => a + b, 0), desc: '求和' },
    { name: 'MAX', calc: (v) => Math.max(...v), desc: '最大值' },
    { name: 'MIN', calc: (v) => Math.min(...v), desc: '最小值' },
    { name: 'COUNT', calc: (v) => v.length, desc: '数值个数' },
    { name: 'COUNTIF(">20")', calc: (v) => v.filter((x) => x > 20).length, desc: '统计大于 20 的个数' },
    { name: 'SUMIF(">20")', calc: (v) => v.filter((x) => x > 20).reduce((a, b) => a + b, 0), desc: '对大于 20 的值求和' },
    { name: 'AVERAGE', calc: (v) => v.reduce((a, b) => a + b, 0) / v.length, desc: '平均值' },
    { name: 'MAX(A1:A6)-MIN(A1:A6)', calc: (v) => Math.max(...v) - Math.min(...v), desc: '极差' },
  ];
  datasets.forEach((dataset, index) => {
    const list = dataset.values.join('、');
    funcs.forEach((func, funcIndex) => {
      if (func.name === 'AVERAGE' && !Number.isInteger(func.calc(dataset.values))) return;
      const correct = num(func.calc(dataset.values));
      const formulaText = func.name.startsWith('COUNTIF')
        ? `COUNTIF(${dataset.range},">20")`
        : func.name.startsWith('SUMIF')
          ? `SUMIF(${dataset.range},">20")`
          : func.name.includes('(') ? func.name.replace('A1:A6', dataset.range) : `${func.name}(${dataset.range})`;
      const finalStem = `某工作表 ${dataset.range} 区域依次存放数值 ${list}。公式 =${formulaText} 的结果是？`;
      out.push(
        choice(CAT.office, ['电子表格', 'Excel函数'], funcIndex < 3 ? 2 : 3, finalStem, correct, [
          String(Number(correct) + 1),
          String(Number(correct) + 2),
          String(Number(correct) + 3),
        ], `${func.desc}：${formulaText} = ${correct}。`),
      );
    });
  });

  out.push(choice(CAT.office, ['电子表格', '公式'], 2, '在 Excel 中，公式必须以什么符号开头？', '=', ['+', '#', '@'], 'Excel 公式以等号 = 开头。'));
  out.push(choice(CAT.office, ['电子表格', '单元格引用'], 2, '在 Excel 中，$A$1 属于哪种引用？', '绝对引用', ['相对引用', '混合引用', '三维引用'], '$ 锁定行和列，属于绝对引用；A1 为相对引用；$A1 或 A$1 为混合引用。'));
  out.push(choice(CAT.office, ['电子表格', '单元格引用'], 2, '在 Excel 中，A1 属于哪种引用？', '相对引用', ['绝对引用', '混合引用', '外部引用'], 'A1 未加 $，为相对引用，复制公式时会随位置变化。'));
  out.push(choice(CAT.office, ['电子表格', '错误值'], 3, 'Excel 中公式 =A1/B1，若 B1 为 0，通常显示什么错误值？', '#DIV/0!', ['#VALUE!', '#REF!', '#N/A'], '除数为 0 时返回 #DIV/0!。'));
  out.push(choice(CAT.office, ['电子表格', '函数'], 2, 'Excel 中函数 =IF(25>20,"合格","不合格") 的结果是？', '合格', ['不合格', 'TRUE', '25'], '条件 25>20 成立，返回第二个参数“合格”。'));
  out.push(choice(CAT.office, ['电子表格', '函数'], 2, 'Excel 中 =ROUND(3.14159,2) 的结果是？', '3.14', ['3.15', '3.1', '3'], 'ROUND 按指定小数位四舍五入，保留 2 位得到 3.14。'));
  out.push(choice(CAT.office, ['电子表格', '函数'], 2, 'Excel 中 =MOD(17,5) 的结果是？', '2', ['3', '3.4', '12'], 'MOD 返回余数，17 ÷ 5 余 2。'));
  out.push(choice(CAT.office, ['电子表格', '函数'], 2, 'Excel 中 =INT(7.9) 的结果是？', '7', ['8', '7.9', '0.9'], 'INT 向下取整，得到 7。'));
  out.push(choice(CAT.office, ['电子表格', '图表'], 2, '要直观展示各部分占总体的比例，最适合使用哪种图表？', '饼图', ['折线图', '散点图', '条形图'], '饼图适合展示部分与整体的比例关系。'));
  out.push(choice(CAT.office, ['电子表格', '图表'], 2, '要展示某指标随时间变化的趋势，最适合使用？', '折线图', ['饼图', '散点图', '雷达图'], '折线图适合表现时间序列的变化趋势。'));
  out.push(choice(CAT.office, ['电子表格', '数据管理'], 3, 'Excel 中要只显示满足条件的数据行，应使用？', '筛选', ['排序', '分类汇总', '冻结窗格'], '筛选用于隐藏不满足条件的行，只显示符合条件的数据。'));
  out.push(judge(CAT.office, ['电子表格'], 2, '一个 Excel 工作簿可以包含多个工作表。', true, '工作簿是文件，工作表是其中的页，一个工作簿可包含多个工作表。'));
}

// ---------------------------------------------------------------------------
// 七、树结构
// ---------------------------------------------------------------------------
function treeQuestions(out) {
  const depths = [3, 4, 5, 6, 7];
  depths.forEach((h) => {
    const nodes = 2 ** h - 1;
    const leaves = 2 ** (h - 1);
    out.push(choice(CAT.structure, ['树', '满二叉树'], 3, `一棵深度为 ${h} 的满二叉树共有多少个结点？`, String(nodes), [String(nodes + 1), String(nodes - 1), String(nodes + 2)], `满二叉树结点数 = 2^h - 1 = 2^${h} - 1 = ${nodes}。`));
    out.push(choice(CAT.structure, ['树', '满二叉树'], 3, `一棵深度为 ${h} 的满二叉树有多少个叶子结点？`, String(leaves), [String(leaves / 2), String(leaves + 1), String(2 ** h)], `第 h 层全为叶子，叶子数 = 2^(h-1) = ${leaves}。`));
  });
  [50, 100, 200, 500].forEach((n) => {
    const depth = Math.floor(Math.log2(n)) + 1;
    const leaves = n - Math.floor(n / 2);
    out.push(choice(CAT.structure, ['树', '完全二叉树'], 4, `一棵有 ${n} 个结点的完全二叉树的深度是多少？`, String(depth), [String(depth + 1), String(depth - 1), String(depth + 2)], `深度 = ⌊log2 n⌋ + 1 = ⌊log2 ${n}⌋ + 1 = ${depth}。`));
    out.push(choice(CAT.structure, ['树', '完全二叉树'], 4, `一棵有 ${n} 个结点的完全二叉树有多少个叶子结点？`, String(leaves), [String(leaves + 2), String(leaves - 2), String(leaves + 10)], `完全二叉树叶子数 = n - ⌊n/2⌋ = ${n} - ${Math.floor(n / 2)} = ${leaves}。`));
  });
  const pairs = [[12, 13], [8, 9], [20, 21], [5, 6]];
  pairs.forEach(([n2, n0]) => {
    out.push(choice(CAT.structure, ['树', '二叉树性质'], 3, `一棵二叉树中度为 2 的结点有 ${n2} 个，则叶子结点有多少个？`, String(n0), [String(n2), String(n2 + 2), String(n2 - 1)], `对任何非空二叉树，n0 = n2 + 1 = ${n2} + 1 = ${n0}。`));
  });

  const treeA = { v: 'A', left: { v: 'B', left: { v: 'D' }, right: { v: 'E' } }, right: { v: 'C', left: { v: 'F' }, right: { v: 'G' } } };
  const treeB = { v: '1', left: { v: '2', left: { v: '4' }, right: { v: '5' } }, right: { v: '3', left: { v: '6' } } };
  const traverse = (node, order, acc = []) => {
    if (!node) return acc;
    if (order === 'pre') acc.push(node.v);
    traverse(node.left, order, acc);
    if (order === 'in') acc.push(node.v);
    traverse(node.right, order, acc);
    if (order === 'post') acc.push(node.v);
    return acc;
  };
  const describeA = '根结点为 A，A 的左孩子为 B、右孩子为 C；B 的左右孩子分别为 D、E；C 的左右孩子分别为 F、G。';
  const describeB = '根结点为 1，1 的左孩子为 2、右孩子为 3；2 的左右孩子分别为 4、5；3 的左孩子为 6。';
  const asks = [
    { tree: treeA, desc: describeA, order: 'pre', label: '前序遍历（先根遍历）' },
    { tree: treeA, desc: describeA, order: 'in', label: '中序遍历（中根遍历）' },
    { tree: treeA, desc: describeA, order: 'post', label: '后序遍历（后根遍历）' },
    { tree: treeB, desc: describeB, order: 'pre', label: '前序遍历（先根遍历）' },
    { tree: treeB, desc: describeB, order: 'in', label: '中序遍历（中根遍历）' },
    { tree: treeB, desc: describeB, order: 'post', label: '后序遍历（后根遍历）' },
  ];
  asks.forEach((item) => {
    const seq = traverse(item.tree, item.order).join(' → ');
    const wrongOrder = item.order === 'pre' ? 'post' : item.order === 'post' ? 'in' : 'pre';
    const wrongSeq = traverse(item.tree, wrongOrder).join(' → ');
    out.push(choice(CAT.structure, ['树', '二叉树遍历'], 4, `某二叉树${item.desc}该二叉树的${item.label}序列是？`, seq, [wrongSeq, seq.split(' → ').reverse().join(' → '), seq.split(' → ').sort().join(' → ')], `${item.label}：先左后右，按“${item.order === 'pre' ? '根左右' : item.order === 'in' ? '左根右' : '左右根'}”访问，得到 ${seq}。`));
  });
}

// ---------------------------------------------------------------------------
// 八、栈与队列
// ---------------------------------------------------------------------------
function stackQueueQuestions(out) {
  out.push(choice(CAT.structure, ['栈'], 2, '栈的特点是？', '后进先出（LIFO）', ['先进先出（FIFO）', '随机存取', '按优先级存取'], '栈只允许在栈顶插入和删除，后进先出。'));
  out.push(choice(CAT.structure, ['队列'], 2, '队列的特点是？', '先进先出（FIFO）', ['后进先出（LIFO）', '只能从中间插入', '按关键字排序'], '队列在队尾入队、队头出队，先进先出。'));
  const stackCases = [
    ['元素 A、B、C 依次入栈，然后连续出栈两次，最后栈顶元素是？', 'A', ['B', 'C', 'D'], '入栈后栈顶为 C，出栈 C、B，此时栈顶为 A。'],
    ['元素 1、2、3、4 依次入栈，然后连续出栈三次，出栈顺序是？', '4、3、2', ['1、2、3', '4、2、3', '3、2、1'], '栈后进先出，连续出栈得到 4、3、2。'],
    ['元素 A、B、C、D 依次入栈，只允许出栈一次，出栈元素是？', 'D', ['A', 'B', 'C'], '最后入栈的 D 位于栈顶，先出栈。'],
  ];
  stackCases.forEach(([stem, correct, wrongs, exp]) => {
    out.push(choice(CAT.structure, ['栈', '栈操作'], 3, stem, correct, wrongs, exp));
  });
  const queueCases = [
    ['元素 A、B、C 依次入队，然后连续出队两次，出队顺序是？', 'A、B', ['C、B', 'B、A', 'C、A'], '队列先进先出，出队得到 A、B。'],
    ['元素 1、2、3、4 依次入队，出队一个元素后，队头元素是？', '2', ['1', '3', '4'], '先出队 1，队头变为 2。'],
    ['元素 A、B、C、D 依次入队，然后出队两次，再入队 E，此时队头是？', 'C', ['A', 'B', 'E'], '出队 A、B 后队头为 C，入队 E 不影响队头。'],
  ];
  queueCases.forEach(([stem, correct, wrongs, exp]) => {
    out.push(choice(CAT.structure, ['队列', '队列操作'], 3, stem, correct, wrongs, exp));
  });
  out.push(choice(CAT.structure, ['栈', '应用'], 2, '以下哪项最适合用栈来实现？', '函数调用与返回', ['打印任务排队', '消息队列', '广度优先搜索'], '函数调用遵循后进先出，适合用栈保存返回地址。'));
  out.push(choice(CAT.structure, ['队列', '应用'], 2, '以下哪项最适合用队列来实现？', '打印任务排队', ['括号匹配', '函数递归调用', '表达式求值'], '打印任务按提交顺序处理，符合先进先出。'));
  out.push(judge(CAT.structure, ['栈'], 2, '栈只能在栈顶进行插入和删除操作。', true, '栈是操作受限的线性表，只允许在栈顶操作。'));
  out.push(judge(CAT.structure, ['队列'], 2, '循环队列可以解决顺序队列的假溢出问题。', true, '循环队列把存储空间首尾相连，提高空间利用率。'));
  out.push(multi(CAT.structure, ['栈', '队列'], 3, '下列关于栈和队列的说法，正确的有？', ['栈是后进先出', '队列是先进先出', '栈和队列都是线性结构'], ['栈可以在任意位置插入元素'], '栈和队列都是操作受限的线性表，分别遵循 LIFO 和 FIFO。'));
}

// ---------------------------------------------------------------------------
// 九、程序阅读
// ---------------------------------------------------------------------------
function programQuestions(out) {
  const cases = [
    { code: 'sum = 0\nfor i in range(1, 6):\n    sum += i\nprint(sum)', answer: '15', wrongs: ['14', '16', '10'], explain: '1+2+3+4+5 = 15。' },
    { code: 'sum = 0\nfor i in range(1, 9):\n    sum += i\nprint(sum)', answer: '36', wrongs: ['35', '37', '28'], explain: '1 到 8 的和为 36。' },
    { code: 's = 0\nfor i in range(1, 11):\n    if i % 2 == 0:\n        s += i\nprint(s)', answer: '30', wrongs: ['25', '35', '55'], explain: '偶数为 2、4、6、8、10，和为 30。' },
    { code: 's = 0\nfor i in range(1, 10):\n    if i % 2 == 1:\n        s += i\nprint(s)', answer: '25', wrongs: ['24', '26', '20'], explain: '奇数为 1、3、5、7、9，和为 25。' },
    { code: 'f = 1\nfor i in range(1, 6):\n    f *= i\nprint(f)', answer: '120', wrongs: ['24', '100', '60'], explain: '5! = 1×2×3×4×5 = 120。' },
    { code: 'f = 1\nfor i in range(1, 7):\n    f *= i\nprint(f)', answer: '720', wrongs: ['120', '840', '5040'], explain: '6! = 720。' },
    { code: 'a = [3, 1, 4, 1, 5]\nprint(max(a) + min(a))', answer: '6', wrongs: ['5', '4', '9'], explain: 'max = 5，min = 1，和为 6。' },
    { code: 'a = [2, 7, 1, 8, 2]\nprint(sum(a))', answer: '20', wrongs: ['18', '22', '16'], explain: '2+7+1+8+2 = 20。' },
    { code: 's = "abcde"\nprint(s[::-1])', answer: 'edcba', wrongs: ['abcde', 'edcb', 'dcba'], explain: '切片 [::-1] 将字符串反转。' },
    { code: 'a = 10\nb = 3\nprint(a // b, a % b)', answer: '3 1', wrongs: ['1 3', '3 3', '0 1'], explain: '// 为整除得 3，% 为取余得 1。' },
    { code: 'x = 0\nfor i in range(5):\n    if i == 3:\n        break\n    x += i\nprint(x)', answer: '3', wrongs: ['6', '10', '4'], explain: 'i 为 0、1、2 时累加，i=3 时跳出，结果为 3。' },
    { code: 'x = 0\nfor i in range(5):\n    if i % 2 == 1:\n        continue\n    x += i\nprint(x)', answer: '6', wrongs: ['4', '10', '5'], explain: '加 0、2、4，结果为 6。' },
    { code: 'count = 0\nfor i in range(1, 4):\n    for j in range(1, 5):\n        count += 1\nprint(count)', answer: '12', wrongs: ['7', '16', '9'], explain: '外层 3 次、内层 4 次，共 12 次。' },
    { code: 'def f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\nprint(f(4))', answer: '24', wrongs: ['12', '120', '16'], explain: '递归计算 4! = 24。' },
    { code: 'def fib(n):\n    if n <= 1:\n        return n\n    return fib(n - 1) + fib(n - 2)\nprint(fib(6))', answer: '8', wrongs: ['5', '13', '6'], explain: '斐波那契数列第 6 项为 8。' },
    { code: 'n = 5\nc = 0\nwhile n > 1:\n    n //= 2\n    c += 1\nprint(c)', answer: '2', wrongs: ['1', '3', '5'], explain: '5→2→1，循环执行 2 次。' },
    { code: 's = 0\nfor i in range(2, 10, 2):\n    s += i\nprint(s)', answer: '20', wrongs: ['18', '30', '16'], explain: '2+4+6+8 = 20。' },
    { code: 's = 0\nfor i in range(1, 4):\n    s += i * i\nprint(s)', answer: '14', wrongs: ['9', '13', '18'], explain: '1+4+9 = 14。' },
  ];
  cases.forEach((item) => {
    out.push(
      choice(CAT.algorithm, ['程序设计', '程序阅读'], 3, `阅读以下 Python 代码，输出结果是？\n${item.code}`, String(item.answer), item.wrongs, item.explain),
    );
  });
  out.push(
    choice(CAT.algorithm, ['程序设计'], 2, 'Python 中用于表示“不等于”的运算符是？', '!=', ['==', '<>', '='], 'Python 使用 != 表示不等于。'),
  );
  out.push(
    choice(CAT.algorithm, ['程序设计'], 2, '在 Python 中，range(1, 5) 生成的整数序列是？', '1, 2, 3, 4', ['1, 2, 3, 4, 5', '0, 1, 2, 3, 4', '2, 3, 4, 5'], 'range 左闭右开，包含 1 不包含 5。'),
  );
  out.push(
    judge(CAT.algorithm, ['程序设计'], 2, 'Python 中缩进仅影响代码美观，不影响程序逻辑。', false, 'Python 用缩进表示代码块，缩进错误会导致逻辑错误或语法错误。'),
  );
}

// ---------------------------------------------------------------------------
// 十、IP 与子网
// ---------------------------------------------------------------------------
function ipQuestions(out) {
  const subnetMask = (prefix) => [0, 8, 16, 24].map((offset) => {
    const bits = Math.min(8, Math.max(0, prefix - offset));
    return bits === 0 ? 0 : 256 - 2 ** (8 - bits);
  }).join('.');
  const prefixes = [24, 25, 26, 27, 28, 29, 30];
  prefixes.forEach((prefix) => {
    const hosts = 2 ** (32 - prefix) - 2;
    const mask = subnetMask(prefix);
    out.push(
      choice(CAT.network, ['IP地址', '子网划分'], 4, `某子网使用 /${prefix} 作为子网掩码前缀，该子网可分配给主机的地址数是多少？`, String(hosts), hosts <= 6 ? [String(hosts + 2), String(hosts + 4), String(hosts + 6)] : [String(hosts + 2), String(hosts - 2), String(hosts * 2)], `主机位为 ${32 - prefix} 位，可用主机数 = 2^${32 - prefix} - 2 = ${hosts}（去掉网络地址和广播地址）。`),
    );
    out.push(
      choice(CAT.network, ['IP地址', '子网掩码'], 3, `前缀长度 /${prefix} 对应的子网掩码是？`, mask, [subnetMask(prefix - 1), subnetMask(prefix + 1), '255.255.0.0'], `前缀 /${prefix} 的掩码前 ${prefix} 位为 1，其余为 0，即 ${mask}。`),
    );
  });
  out.push(choice(CAT.network, ['IP地址'], 2, 'IPv4 地址由多少位二进制数组成？', '32 位', ['16 位', '64 位', '128 位'], 'IPv4 地址为 32 位，通常写成 4 段十进制数。'));
  out.push(choice(CAT.network, ['IP地址'], 2, 'IPv6 地址由多少位二进制数组成？', '128 位', ['32 位', '64 位', '256 位'], 'IPv6 地址长度为 128 位。'));
  out.push(choice(CAT.network, ['IP地址'], 2, '下列哪个是 IPv4 私有地址？', '192.168.1.10', ['8.8.8.8', '114.114.114.114', '202.96.128.86'], '私有地址范围：10.0.0.0/8、172.16.0.0/12、192.168.0.0/16。'));
  out.push(choice(CAT.network, ['IP地址'], 3, '下列哪个地址属于回环地址？', '127.0.0.1', ['0.0.0.0', '192.168.0.1', '255.255.255.255'], '127.0.0.0/8 为回环地址，127.0.0.1 常用于本机测试。'));
  out.push(choice(CAT.network, ['IP地址'], 3, '一个 C 类 IPv4 地址的网络号占多少位？', '24 位', ['8 位', '16 位', '32 位'], 'C 类地址前 3 个字节为网络号，共 24 位。'));
  out.push(choice(CAT.network, ['IP地址'], 3, '子网掩码 255.255.255.192 对应的前缀长度是？', '/26', ['/24', '/25', '/27'], '255.255.255.192 的二进制前 26 位为 1。'));
  out.push(judge(CAT.network, ['IP地址'], 2, '同一子网内的主机可以直接通信，不需要经过路由器。', true, '同子网主机通过交换机/集线器即可通信，跨子网才需要路由。'));
  out.push(judge(CAT.network, ['IP地址'], 2, 'IPv4 地址 192.168.1.0 可以直接分配给一台主机使用。', false, '主机位全 0 的地址表示网络本身，不能分配给主机。'));
}

export function buildTemplatesCore() {
  const out = [];
  baseConversion(out);
  asciiQuestions(out);
  chineseEncoding(out);
  units(out);
  imageAudio(out);
  excelQuestions(out);
  treeQuestions(out);
  stackQueueQuestions(out);
  programQuestions(out);
  ipQuestions(out);
  return out;
}
