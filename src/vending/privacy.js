const SUSPICIOUS_CONTENT = [
  /(?:^|\s)(?:\.{0,2}\/|[A-Za-z]:\\|\/Users\/|\/home\/)/,
  /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/,
  /https?:\/\//i,
  /\[\[[^\]]+\]\]/,
  /```/,
  /(?:^|\s)#{1,6}\s/m,
];

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text.length > maxLength || SUSPICIOUS_CONTENT.some(pattern => pattern.test(text))) return '';
  return text;
}

function looksLikeExtractionAttempt(input) {
  const text = String(input || '').toLowerCase();
  const patterns = [
    /(?:show|reveal|quote|repeat|print|list|leak|extract).{0,35}(?:note|vault|file|prompt|memory|private)/,
    /(?:ignore|override|disregard).{0,40}(?:instruction|system|privacy|previous)/,
    /(?:what|which).{0,30}(?:private|personal|real).{0,24}(?:name|address|email|filename|path|relationship)/,
    /(?:name|address|email|filename|path|relationship).{0,28}(?:vault|private note|your memory|zia)/,
    /逐字|原文|私人笔记|文件名|系统提示|忽略.{0,12}(?:指令|规则)/,
  ];
  return patterns.some(pattern => pattern.test(text));
}

module.exports = { looksLikeExtractionAttempt, cleanText };
