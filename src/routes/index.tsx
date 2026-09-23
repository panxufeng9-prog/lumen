import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { HoloEffect } from "@kongyo2/cards-css";
import { FoilStage, SAMPLE } from "@/components/foil-stage";

async function fileToCardImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("canvas");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.92);
}

export const Route = createFileRoute("/")({ component: Home });

const FOILS: { id: HoloEffect; label: string }[] = [
  { id: "holo", label: "全息" },
  { id: "aurora", label: "极光" },
  { id: "gold", label: "金箔" },
  { id: "oilslick", label: "油光" },
];

function Home() {
  const [src, setSrc] = useState(SAMPLE);
  const [name, setName] = useState("奶油");
  const [number, setNumber] = useState("0001");
  const [effect, setEffect] = useState<HoloEffect>("holo");
  const [tilt, setTilt] = useState(false);
  const [tiltNote, setTiltNote] = useState("");

  async function onFile(file: File | undefined, input: HTMLInputElement) {
    input.value = "";
    if (!file) return;
    try {
      setSrc(await fileToCardImage(file));
      setTiltNote("");
    } catch {
      setTiltNote("这张照片打不开。请换一张 JPG 或 PNG。");
    }
  }

  async function enableTilt() {
    const { requestOrientationPermission } = await import("@kongyo2/cards-css");
    const ok = await requestOrientationPermission();
    if (!ok) {
      setTilt(false);
      setTiltNote("这台设备没有开放倾斜，先用手指划过卡片。");
      return;
    }
    setTilt(true);
    setTiltNote("已开启手机倾斜。歪一下手机试试。");
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl items-start gap-8 px-5 py-8 md:grid-cols-[20rem_minmax(0,1fr)] md:gap-12 md:px-10 md:py-12">
      <header className="flex flex-col gap-2 md:col-span-2">
        <p className="text-sm font-medium tracking-[0.18em] text-accent uppercase">Lumen</p>
        <h1 className="font-display text-4xl leading-none text-balance text-fg">宠物闪卡</h1>
        <p className="max-w-sm text-base leading-relaxed text-pretty text-muted">
          先换上自己的照片。卡片会跟着指针倾斜，四种箔面可以马上切换。
        </p>
      </header>

      <div className="md:justify-self-end">
        <FoilStage src={src} name={name} number={number} effect={effect} tilt={tilt} />
      </div>

      <section className="flex flex-col gap-4 self-center rounded-card border border-line bg-surface p-4 md:p-6">
        <label className="flex flex-col gap-2 text-sm text-muted">
          名字
          <input
            value={name}
            maxLength={16}
            onChange={(event) => setName(event.target.value)}
            className="h-11 rounded-xl border border-line bg-bg px-3 text-base text-fg outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          编号
          <input
            value={number}
            inputMode="numeric"
            maxLength={4}
            onChange={(event) => setNumber(event.target.value.replace(/\D/g, "").slice(0, 4))}
            className="h-11 rounded-xl border border-line bg-bg px-3 font-sans text-base text-fg tabular-nums outline-none focus:border-accent"
          />
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">箔面</p>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="箔面">
            {FOILS.map((foil) => {
              const on = effect === foil.id;
              return (
                <button
                  key={foil.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setEffect(foil.id)}
                  className={
                    "h-11 rounded-xl border text-sm font-medium " +
                    (on
                      ? "border-accent bg-accent text-bg"
                      : "border-line bg-bg text-fg")
                  }
                >
                  {foil.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl bg-accent text-sm font-medium text-bg">
            换一张照片
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const input = event.currentTarget;
                void onFile(input.files?.[0], input);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => void enableTilt()}
            className="h-11 rounded-xl border border-line bg-bg text-sm font-medium text-fg"
          >
            {tilt ? "倾斜已开" : "手机倾斜"}
          </button>
        </div>
        {tiltNote ? <p className="text-sm text-muted">{tiltNote}</p> : null}
      </section>
    </main>
  );
}
