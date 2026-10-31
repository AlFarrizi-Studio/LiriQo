function t(r) {
  return r.includes("<tt") && r.includes("</tt>");
}
function d(r) {
  return /\[\d+:\d+\.\d+\]/.test(r);
}
function e(r) {
  return new RegExp("(?<!\\d)\\d+\\r?\\n\\d{2}:\\d{2}:\\d{2}[,.]\\d+ --> \\d{2}:\\d{2}:\\d{2}[,.]\\d+").test(r);
}
function n(r) {
  return r.includes("<QrcInfos>") || r.includes("LyricContent=") ? !0 : /\[\d+,\d+\]/.test(r) && /\(\d+,\d+\)/.test(r);
}
function s(r) {
  return t(r) ? "ttml" : d(r) ? "lrc" : e(r) ? "srt" : n(r) ? "qrc" : "plain";
}
export {
  d as a,
  e as b,
  n as c,
  s as d,
  t as i
};
