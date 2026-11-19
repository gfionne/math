export interface OfficialXimenAsset {
  id: string;
  title: string;
  filename: string;
  sizeText: string;
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

const OFFICIAL_STREET_BUTTONS = [
  '電影街',
  '美國街',
  '川菜街',
  '漢中小吃街',
  '紋身街',
  '運動用品街',
  '酒吧咖啡街',
  '戲服街',
];

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPurpleButtonCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  label: string,
) {
  ctx.clearRect(0, 0, w, h);
  const pad = 12;
  roundRectPath(ctx, pad, pad, w - pad * 2, h - pad * 2, 28);
  ctx.fillStyle = '#682BD7';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 54px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 3);
}

function drawReturnButtonCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  const pad = 12;
  roundRectPath(ctx, pad, pad, w - pad * 2, h - pad * 2, 26);
  ctx.fillStyle = '#FACC15';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1E1B4B';
  ctx.stroke();

  ctx.fillStyle = '#1E1B4B';
  ctx.font = '900 46px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔙 返回地圖', w / 2, h / 2 + 2);
}

function drawCharacterCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  side: 'left' | 'right',
) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  roundRectPath(ctx, cx - 72, 210, 144, 155, 36);
  ctx.fillStyle = side === 'left' ? '#4F46E5' : '#EC4899';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1E293B';
  ctx.stroke();

  ctx.fillStyle = '#FACC15';
  ctx.beginPath();
  ctx.arc(cx, 275, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, 130, 78, 0, Math.PI * 2);
  ctx.fillStyle = side === 'left' ? '#FDE68A' : '#FED7AA';
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, 118, 78, Math.PI, 0);
  ctx.fillStyle = side === 'left' ? '#1E293B' : '#9A3412';
  ctx.fill();

  ctx.fillStyle = '#1E293B';
  ctx.beginPath();
  ctx.arc(cx - 26, 132, 8, 0, Math.PI * 2);
  ctx.arc(cx + 26, 132, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, 152, 18, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#DC2626';
  ctx.stroke();
}

function drawMapCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  ctx.fillStyle = '#84B1D9';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, h * 0.14, w * 0.83, h * 0.032);
  ctx.fillRect(0, h * 0.33, w * 0.83, h * 0.045);
  ctx.fillRect(0, h * 0.56, w * 0.54, h * 0.035);
  ctx.fillRect(0, h * 0.79, w, h * 0.048);
  ctx.fillRect(w * 0.15, 0, w * 0.026, h);
  ctx.fillRect(w * 0.34, 0, w * 0.028, h);
  ctx.fillRect(w * 0.505, 0, w * 0.032, h);
  ctx.fillRect(w * 0.83, 0, w * 0.056, h);

  ctx.fillStyle = '#D32F2F';
  ctx.fillRect(w * 0.03, h * 0.335, w * 0.8, h * 0.036);

  ctx.fillStyle = '#FDD835';
  ctx.fillRect(w * 0.64, h * 0.17, w * 0.035, h * 0.45);

  ctx.fillStyle = '#2E7D32';
  ctx.fillRect(w * 0.52, h * 0.57, w * 0.31, h * 0.036);

  ctx.fillStyle = '#C2185B';
  roundRectPath(ctx, 16, 16, 220, 56, 8);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#F48FB1';
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 24px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('西門町商圈地圖', 126, 44);
}

export const OFFICIAL_XIMEN_ASSETS: OfficialXimenAsset[] = [
  {
    id: 'asset-full-map',
    title: '西門町商圈地圖底圖',
    filename: '商圈地圖.png',
    sizeText: '1200 × 900 px（舞台初始背景）',
    width: 800,
    height: 600,
    draw: drawMapCanvas,
  },
  ...OFFICIAL_STREET_BUTTONS.map((name, idx) => ({
    id: `asset-btn-${idx}`,
    title: `按鈕_${name}`,
    filename: `按鈕_${name}.png`,
    sizeText: '520 × 150 px（去背按鈕）',
    width: 520,
    height: 150,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) =>
      drawPurpleButtonCanvas(ctx, w, h, name),
  })),
  {
    id: 'asset-char-left',
    title: '左角色_西門導覽員',
    filename: '左角色_西門導覽員.png',
    sizeText: '360 × 420 px（需備齊待機/說話/招牌）',
    width: 360,
    height: 420,
    draw: (ctx, w, h) => drawCharacterCanvas(ctx, w, h, 'left'),
  },
  {
    id: 'asset-char-right',
    title: '右角色_好奇小遊客',
    filename: '右角色_好奇小遊客.png',
    sizeText: '360 × 420 px（需備齊待機/說話/招牌）',
    width: 360,
    height: 420,
    draw: (ctx, w, h) => drawCharacterCanvas(ctx, w, h, 'right'),
  },
  {
    id: 'asset-btn-return',
    title: '按鈕_返回地圖',
    filename: '按鈕_返回地圖.png',
    sizeText: '460 × 140 px（去背按鈕）',
    width: 460,
    height: 140,
    draw: drawReturnButtonCanvas,
  },
];
