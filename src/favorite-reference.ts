export const MAX_FAVORITE_NOTE = 500;
// Keep 50 compact thumbnails below typical localStorage limits alongside the catalog.
const MAX_REFERENCE_LENGTH = 24_000;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export function isReferenceImage(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_REFERENCE_LENGTH &&
    /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value);
}

export async function prepareReferenceImage(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.type) &&
      !(file.type === "" && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)))
    throw new Error("请选择 JPG、PNG、WebP、GIF、BMP 或 AVIF 图片");
  if (!file.size || file.size > MAX_INPUT_BYTES)
    throw new Error("请选择 20 MB 以内的非空图片");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("无法读取图片，请尝试 JPG 或 PNG"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx || !image.naturalWidth || !image.naturalHeight)
      throw new Error("无法处理这张图片");
    for (const size of [640, 480, 360, 240, 160, 96]) {
      const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.65, 0.5]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (isReferenceImage(data)) return data;
      }
    }
    throw new Error("压缩后仍无法保存，请改用较小的图片");
  } finally {
    URL.revokeObjectURL(url);
  }
}
