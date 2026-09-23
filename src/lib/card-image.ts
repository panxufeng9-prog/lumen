export type CardArtwork = { photo: string; foreground: string | null };

const WIDTH = 630;
const HEIGHT = 880;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片处理失败"))),
      type,
      quality,
    );
  });
}

export async function preparePhoto(
  file: Blob,
): Promise<{ photo: string; blob: Blob; foreground: string | null }> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  if (file.size > 20 * 1024 * 1024) throw new Error("照片请小于 20 MB。");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("此浏览器无法处理照片。");
    const scale = Math.max(WIDTH / bitmap.width, HEIGHT / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    ctx.drawImage(bitmap, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
    let foreground: string | null = null;
    if (file.type === "image/png" || file.type === "image/webp") {
      const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
      let opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 128) opaque++;
      const ratio = opaque / (WIDTH * HEIGHT);
      if (ratio > 0.02 && ratio < 0.95) foreground = canvas.toDataURL("image/png");
    }
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#12110e";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const photo = canvas.toDataURL("image/jpeg", 0.88);
    return { photo, blob: await canvasToBlob(canvas, "image/jpeg", 0.88), foreground };
  } finally {
    bitmap.close();
  }
}

type RawImage = import("@huggingface/transformers").RawImage;
type Segmenter = (image: RawImage) => Promise<RawImage[]>;
let segmenterPromise: Promise<Segmenter> | null = null;

async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = import("@huggingface/transformers").then(async (module) => {
      const createPipeline = module.pipeline as unknown as (
        task: "background-removal",
        model: string,
        options: { dtype: "uint8"; device: "wasm" },
      ) => Promise<Segmenter>;
      return createPipeline("background-removal", "onnx-community/ormbg-ONNX", {
        dtype: "uint8",
        device: "wasm",
      });
    });
  }
  try {
    return await segmenterPromise;
  } catch (error) {
    segmenterPromise = null;
    throw error;
  }
}

export async function extractPet(blob: Blob): Promise<string> {
  const { RawImage } = await import("@huggingface/transformers");
  const segmenter = await getSegmenter();
  const image = await RawImage.fromBlob(blob);
  const output = await segmenter(image);
  const result = output[0];
  if (!result) throw new Error("未能识别照片主体。");
  const canvas = result.toCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法读取抠图结果。");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 128) opaque++;
  const ratio = opaque / (canvas.width * canvas.height);
  if (ratio < 0.02 || ratio > 0.95) throw new Error("未识别出清晰的宠物轮廓，请换一张照片。");
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取卡片图片。"));
    image.src = src;
  });
}

export async function downloadCard(artwork: CardArtwork, name: string, number: string) {
  const photo = await loadImage(artwork.photo);
  const pet = artwork.foreground ? await loadImage(artwork.foreground) : null;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法导出卡片。");
  ctx.save();
  ctx.filter = pet ? "blur(18px) brightness(0.72)" : "none";
  ctx.drawImage(
    photo,
    pet ? -18 : 0,
    pet ? -18 : 0,
    pet ? WIDTH + 36 : WIDTH,
    pet ? HEIGHT + 36 : HEIGHT,
  );
  ctx.restore();
  if (pet) ctx.drawImage(pet, 0, 0, WIDTH, HEIGHT);
  const shine = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  shine.addColorStop(0, "rgba(255,215,165,.12)");
  shine.addColorStop(0.45, "rgba(109,181,231,.05)");
  shine.addColorStop(1, "rgba(255,167,207,.13)");
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const shade = ctx.createLinearGradient(0, HEIGHT * 0.68, 0, HEIGHT);
  shade.addColorStop(0, "transparent");
  shade.addColorStop(1, "rgba(18,17,14,.92)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, HEIGHT * 0.68, WIDTH, HEIGHT * 0.32);
  ctx.strokeStyle = "#e4b15a";
  ctx.lineWidth = 8;
  ctx.strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);
  ctx.fillStyle = "#f3ead7";
  ctx.font = "bold 42px system-ui";
  ctx.fillText((name.trim() || "未命名").slice(0, 16), 32, HEIGHT - 38, WIDTH - 150);
  ctx.fillStyle = "#e4b15a";
  ctx.font = "26px system-ui";
  ctx.textAlign = "right";
  ctx.fillText(
    `#${(number.replace(/\D/g, "").slice(0, 4) || "1").padStart(4, "0")}`,
    WIDTH - 32,
    HEIGHT - 42,
  );
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `闪卡-${(name.trim() || "pet").replace(/[\\/:*?"<>|]/g, "").slice(0, 16)}.png`;
  link.click();
}
