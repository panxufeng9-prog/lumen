import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { HoloEffect } from "@kongyo2/cards-css";
import { FoilStage, SAMPLE } from "@/components/foil-stage";
import { downloadCard, extractPet, preparePhoto } from "@/lib/card-image";
import { loadCard, saveCard } from "@/lib/card-storage";

export const Route = createFileRoute("/")({ component: Home });

const FOILS: { id: HoloEffect; label: string }[] = [
  { id: "holo", label: "全息" },
  { id: "aurora", label: "极光" },
  { id: "gold", label: "金箔" },
  { id: "oilslick", label: "油光" },
];

function Home() {
  const [src, setSrc] = useState(SAMPLE);
  const [foreground, setForeground] = useState<string | null>(null);
  const [name, setName] = useState("奶油");
  const [number, setNumber] = useState("0001");
  const [effect, setEffect] = useState<HoloEffect>("holo");
  const [tilt, setTilt] = useState(false);
  const [tiltNote, setTiltNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("现在是反光卡。生成立体层后，宠物会与背景分别移动。");
  const jobRef = useRef(0);

  useEffect(() => {
    let active = true;
    void loadCard()
      .then((saved) => {
        if (!active || !saved || jobRef.current !== 0) return;
        setSrc(saved.photo);
        setForeground(saved.foreground);
        setName(saved.name);
        setNumber(saved.number);
        setEffect(saved.effect);
        setMessage("已恢复保存在此设备上的卡片。");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function makeLayer(blob: Blob, job: number) {
    setBusy(true);
    setMessage("正在设备上处理照片。首次使用需要下载数十 MB 的抠图模型，请稍等。");
    try {
      const cutout = await extractPet(blob);
      if (job !== jobRef.current) return;
      setForeground(cutout);
      setMessage("立体层已生成。划过卡片，看看宠物与背景的视差。");
    } catch (error) {
      if (job !== jobRef.current) return;
      setMessage(
        error instanceof Error && error.message.startsWith("未识别")
          ? error.message
          : "抠图暂时失败。照片仍可作为反光卡使用；请检查网络后重试。",
      );
    } finally {
      if (job === jobRef.current) setBusy(false);
    }
  }

  async function onFile(file: File | undefined, input: HTMLInputElement) {
    input.value = "";
    if (!file) return;
    const job = ++jobRef.current;
    setBusy(true);
    try {
      const prepared = await preparePhoto(file);
      if (job !== jobRef.current) return;
      setSrc(prepared.photo);
      setForeground(prepared.foreground);
      setTiltNote("");
      if (prepared.foreground) {
        setBusy(false);
        setMessage("透明背景已识别，宠物立体层已生成。");
      } else {
        await makeLayer(prepared.blob, job);
      }
    } catch (error) {
      if (job === jobRef.current) {
        setBusy(false);
        setMessage(
          error instanceof Error ? error.message : "这张照片打不开，请换一张 JPG 或 PNG。",
        );
      }
    }
  }

  async function trySample() {
    const job = ++jobRef.current;
    setBusy(true);
    try {
      const response = await fetch(SAMPLE);
      if (!response.ok) throw new Error("样例照片暂时无法读取。");
      const prepared = await preparePhoto(await response.blob());
      if (job !== jobRef.current) return;
      setSrc(prepared.photo);
      setForeground(null);
      await makeLayer(prepared.blob, job);
    } catch (error) {
      if (job === jobRef.current) {
        setBusy(false);
        setMessage(error instanceof Error ? error.message : "样例照片处理失败。");
      }
    }
  }

  async function retryLayer() {
    const job = ++jobRef.current;
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error("无法读取照片，请重新上传。");
      await makeLayer(await response.blob(), job);
    } catch (error) {
      if (job === jobRef.current)
        setMessage(error instanceof Error ? error.message : "无法读取照片，请重新上传。");
    }
  }

  async function save() {
    try {
      await saveCard({ photo: src, foreground, name, number, effect });
      setMessage("卡片已保存到此设备。下次打开会自动恢复。");
    } catch {
      setMessage("设备存储空间不足，暂时无法保存；可以下载静态图片。");
    }
  }

  async function download() {
    try {
      await downloadCard({ photo: src, foreground }, name, number);
      setMessage("已下载静态 PNG。动态反光与倾斜效果只能在页面中体验。");
    } catch {
      setMessage("下载失败，请更换照片再试。");
    }
  }

  async function enableTilt() {
    try {
      const { requestOrientationPermission } = await import("@kongyo2/cards-css");
      const ok = await requestOrientationPermission();
      if (!ok) {
        setTilt(false);
        setTiltNote("这台设备没有开放倾斜，先用手指划过卡片。");
        return;
      }
      setTilt(true);
      setTiltNote("已开启手机倾斜。歪一下手机试试。");
    } catch {
      setTilt(false);
      setTiltNote("这台设备没有开放倾斜，先用手指划过卡片。");
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl items-start gap-8 px-5 py-8 md:grid-cols-[20rem_minmax(0,1fr)] md:gap-12 md:px-10 md:py-12">
      <header className="flex flex-col gap-2 md:col-span-2">
        <p className="text-sm font-medium tracking-[0.18em] text-accent">闪卡</p>
        <h1 className="font-display text-4xl leading-none text-balance text-fg">给宠物一张会发光的卡</h1>
        <p className="max-w-sm text-base leading-relaxed text-pretty text-muted">
          上传宠物照片，生成独立的宠物层。移动卡片时，宠物与背景会产生视差。
        </p>
      </header>

      <div className="md:justify-self-end">
        <FoilStage
          src={src}
          foreground={foreground}
          name={name}
          number={number}
          effect={effect}
          tilt={tilt}
        />
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
                    (on ? "border-accent bg-accent text-bg" : "border-line bg-bg text-fg")
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
              accept="image/jpeg,image/png,image/webp"
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
        <button
          type="button"
          onClick={() => void trySample()}
          disabled={busy}
          className="h-11 rounded-xl border border-line bg-bg text-sm font-medium text-fg disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "正在生成立体层…" : "用样例试立体效果"}
        </button>
        {!foreground && !busy && src !== SAMPLE ? (
          <button
            type="button"
            onClick={() => void retryLayer()}
            className="h-11 rounded-xl border border-line bg-bg text-sm font-medium text-fg"
          >
            重试生成立体层
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="h-11 rounded-xl border border-line bg-bg text-sm font-medium text-fg"
          >
            保存到此设备
          </button>
          <button
            type="button"
            onClick={() => void download()}
            disabled={busy}
            className="h-11 rounded-xl border border-line bg-bg text-sm font-medium text-fg"
          >
            下载静态图片
          </button>
        </div>
        <p aria-live="polite" className="text-sm leading-relaxed text-muted">
          {message}
        </p>
        <p className="text-xs leading-relaxed text-muted">
          已有透明背景的 PNG / WebP 可直接形成宠物层，无需下载抠图模型。
        </p>
        {tiltNote ? <p className="text-sm text-muted">{tiltNote}</p> : null}
      </section>
    </main>
  );
}
