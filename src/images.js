// 첨부 이미지: 방향(EXIF) 보정 + 축소. send = 모델 입력용, thumb = 세션 저장용.
async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toJpeg(src, maxSide, quality) {
  const w0 = src.width, h0 = src.height;
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * s));
  c.height = Math.max(1, Math.round(h0 * s));
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

export async function prepareImage(file) {
  const bmp = await decode(file);
  const out = { send: toJpeg(bmp, 1024, 0.88), thumb: toJpeg(bmp, 320, 0.72) };
  bmp.close?.();
  return out;
}
