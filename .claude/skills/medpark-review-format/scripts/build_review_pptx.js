#!/usr/bin/env node
/**
 * MedPark 검토 문서 PPTX 생성기.
 * 문서 페이지 이미지(가운데) 양옆에 번호 마커 + 메모 카드를 배치한다.
 *
 * 사용: node build_review_pptx.js spec.json
 * spec 형식은 SKILL.md 의 "spec 형식" 참고.
 * pptxgenjs 가 없으면:  npm install pptxgenjs  (스크립트 폴더 또는 작업 폴더에서)
 */
const fs = require("fs");
const path = require("path");

let pptxgen;
try { pptxgen = require("pptxgenjs"); }
catch (e) {
  try { pptxgen = require(require.resolve("pptxgenjs", { paths: [process.cwd(), __dirname, "/opt/node22/lib/node_modules"] })); }
  catch (e2) { console.error("pptxgenjs 가 없습니다. 먼저 `npm install pptxgenjs` 를 실행하세요."); process.exit(1); }
}

const specPath = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(specPath)) { console.error("사용법: node build_review_pptx.js spec.json"); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(specPath, "utf-8"));
const BASE = path.dirname(specPath);

const FONT = spec.font || "맑은 고딕";
const BAR = spec.barColor || "3F9B3F";               // MedPark Green
const COL = { mod: "C00000", prop: "1F5FBF", chk: "D26A00", ref: "6B7280" };
const CATNAME = { mod: "코멘트 반영", prop: "수정 제안", chk: "확인·보완 필요", ref: "표기 정리" };
const DEFAULT_FOOT = "※ 마킹에 없던 제안·초안입니다. 승인 전 확정 아님.";

// ---------- 이미지 픽셀 크기 (PNG / JPEG 헤더) ----------
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  throw new Error("PNG/JPEG 만 지원합니다 (webp 등은 PNG 로 변환): " + file);
}

// ---------- 레이아웃 상수 (inch, 16:9 WIDE) ----------
const SLIDE_W = 13.333, IMG_Y = 0.45, IMG_H = 6.95;
const PANEL_W = 4.2, LX = 0.2, RX = SLIDE_W - 0.2 - PANEL_W;
const TOP = 0.5, GAP = 0.07;

function paraWidth(t, size) {
  let w = 0;
  for (const ch of t) w += /[ㄱ-힣⺀-鿿＀-￯]/.test(ch) ? 1 : 0.58;
  return w * (size / 72) * 1.03;
}
function est(item, inner) {
  const bs = 7.5, ts = 8.5;
  let h = 0.1;
  h += Math.max(1, Math.ceil(paraWidth(item.title, ts) * 1.08 / inner)) * 0.155;
  for (const [k, t] of item.lines) {
    const pre = k === "old" ? "현행: " : k === "new" ? "수정: " : k === "chk" ? "※ " : "";
    h += Math.max(1, Math.ceil(paraWidth(pre + t, bs) * 1.12 / inner)) * 0.125 + 0.03;
  }
  return h;
}
// 카드를 원하는 높이에 두되 겹치면 아래로 밀고, 바닥을 넘으면 위로 당긴다
function layoutSide(items, bottom, py) {
  const inner = PANEL_W - 0.45;
  items.forEach((it) => {
    it._h = est(it, inner);
    it._want = it.boxes && it.boxes.length ? py(it.boxes[0][1]) - 0.05 : (it.anchorY ?? TOP);
  });
  items.sort((a, b) => a._want - b._want);
  let y = TOP;
  for (const it of items) { it._y = Math.max(it._want, y); y = it._y + it._h + GAP; }
  let limit = bottom;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it._y + it._h > limit) it._y = limit - it._h;
    limit = it._y - GAP;
  }
}

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = spec.deckTitle || "MedPark 검토 문서";
pres.author = spec.author || "MedPark RA";

for (const sd of spec.slides) {
  const imgFile = path.resolve(BASE, sd.img);
  const sz = imageSize(imgFile);
  const S = IMG_H / sz.h, IMG_W = sz.w * S, IMG_X = (SLIDE_W - IMG_W) / 2;
  const px = (x) => IMG_X + x * S, py = (y) => IMG_Y + y * S;

  const s = pres.addSlide();
  s.background = { color: "F4F6F4" };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: SLIDE_W, h: 0.4, fill: { color: BAR }, line: { color: BAR, width: 0 } });
  s.addText(sd.title, { x: 0.2, y: 0, w: 8.6, h: 0.4, fontFace: FONT, fontSize: 12, bold: true, color: "FFFFFF", valign: "middle", margin: 0, isTextBox: true });
  let lx = 8.75;
  for (const c of sd.legend || [...new Set(sd.items.map((i) => i.cat))]) {
    s.addShape(pres.shapes.RECTANGLE, { x: lx, y: 0.13, w: 0.14, h: 0.14, fill: { color: COL[c] }, line: { color: "FFFFFF", width: 0.75 } });
    s.addText(CATNAME[c], { x: lx + 0.18, y: 0, w: 1.0, h: 0.4, fontFace: FONT, fontSize: 8, color: "FFFFFF", valign: "middle", margin: 0, isTextBox: true });
    lx += 1.1;
  }
  s.addImage({ path: imgFile, x: IMG_X, y: IMG_Y, w: IMG_W, h: IMG_H, altText: sd.title });
  s.addShape(pres.shapes.RECTANGLE, { x: IMG_X, y: IMG_Y, w: IMG_W, h: IMG_H, fill: { type: "none" }, line: { color: "B8C4B8", width: 0.75 } });

  // side 미지정이면 마커가 있는 쪽(좌/우 단)으로 자동 배정
  sd.items.forEach((it) => {
    if (!it.side) it.side = it.boxes && it.boxes.length && (it.boxes[0][0] + it.boxes[0][2] / 2) < sz.w / 2 ? "L" : "R";
  });
  const L = sd.items.filter((i) => i.side === "L"), R = sd.items.filter((i) => i.side === "R");
  const foot = sd.foot === undefined ? (sd.items.some((i) => i.cat !== "mod") ? DEFAULT_FOOT : "") : sd.foot;
  const BOT = foot ? 7.17 : 7.42;
  layoutSide(L, BOT, py); layoutSide(R, BOT, py);

  for (const it of [...L, ...R]) {
    const c = COL[it.cat], cx = it.side === "L" ? LX : RX;
    (it.boxes || []).forEach((b, bi) => {
      s.addShape(pres.shapes.RECTANGLE, { x: px(b[0]), y: py(b[1]), w: b[2] * S, h: b[3] * S, fill: { type: "none" }, line: { color: c, width: 1.25 } });
      if (bi === 0) {
        s.addShape(pres.shapes.OVAL, { x: px(b[0]) - 0.11, y: py(b[1]) - 0.11, w: 0.2, h: 0.2, fill: { color: c }, line: { color: "FFFFFF", width: 0.75 } });
        s.addText(String(it.n), { x: px(b[0]) - 0.11, y: py(b[1]) - 0.11, w: 0.2, h: 0.2, fontFace: FONT, fontSize: 7, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true });
      }
    });
    if (it.boxes && it.boxes.length) {
      const b = it.boxes[0];
      const x1 = it.side === "L" ? LX + PANEL_W : RX, y1 = it._y + 0.14;
      const x2 = it.side === "L" ? px(b[0]) : px(b[0] + b[2]), y2 = py(b[1] + b[3] / 2);
      s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(Math.abs(x2 - x1), 0.001), h: Math.max(Math.abs(y2 - y1), 0.001), line: { color: c, width: 0.75, dashType: "dash" }, flipV: (x2 - x1) * (y2 - y1) < 0 });
    }
    s.addShape(pres.shapes.RECTANGLE, { x: cx, y: it._y, w: PANEL_W, h: it._h, fill: { color: "FFFFFF" }, line: { color: c, width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x: cx, y: it._y, w: 0.06, h: it._h, fill: { color: c }, line: { color: c, width: 0 } });
    s.addShape(pres.shapes.OVAL, { x: cx + 0.12, y: it._y + 0.05, w: 0.2, h: 0.2, fill: { color: c }, line: { color: c, width: 0 } });
    s.addText(String(it.n), { x: cx + 0.12, y: it._y + 0.05, w: 0.2, h: 0.2, fontFace: FONT, fontSize: 7, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, isTextBox: true });
    const runs = [{ text: it.title, options: { bold: true, fontSize: 8.5, color: c, breakLine: true } }];
    it.lines.forEach(([k, t], i) => {
      const last = i === it.lines.length - 1;
      if (k === "old") runs.push({ text: "현행: ", options: { bold: true, fontSize: 7.5, color: "6B7280" } }, { text: t, options: { fontSize: 7.5, color: "6B7280", breakLine: !last } });
      else if (k === "new") runs.push({ text: "수정: ", options: { bold: true, fontSize: 7.5, color: it.cat === "mod" ? "C00000" : "1F5FBF" } }, { text: t, options: { fontSize: 7.5, color: "111111", breakLine: !last } });
      else if (k === "chk") runs.push({ text: "※ ", options: { bold: true, fontSize: 7.5, color: "D26A00" } }, { text: t, options: { fontSize: 7.5, color: "B45A00", breakLine: !last } });
      else runs.push({ text: t, options: { fontSize: 7.5, color: "222222", breakLine: !last } });
    });
    s.addText(runs, { x: cx + 0.36, y: it._y + 0.03, w: PANEL_W - 0.42, h: it._h - 0.04, fontFace: FONT, valign: "top", margin: 0, paraSpaceAfter: 2, isTextBox: true, fit: "none" });
  }
  if (foot) s.addText(foot, { x: LX, y: 7.24, w: 4.2, h: 0.2, fontFace: FONT, fontSize: 7, color: "6B7280", margin: 0, isTextBox: true });
}

const out = path.resolve(BASE, spec.out || "review.pptx");
pres.writeFile({ fileName: out }).then(() => console.log("saved:", out));
