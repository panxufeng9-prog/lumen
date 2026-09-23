import { useEffect, useRef, useState } from "react";
import type { HoloCard, HoloEffect } from "@kongyo2/cards-css";

const SAMPLE = "/sample-pet.jpg";

function formatNum(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return `#${(digits || "1").padStart(4, "0")}`;
}

function faceMaskUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = 630;
  canvas.height = 880;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 630, 880);
  ctx.globalCompositeOperation = "destination-out";
  const hole = ctx.createRadialGradient(315, 330, 30, 315, 360, 270);
  hole.addColorStop(0, "rgba(0,0,0,1)");
  hole.addColorStop(0.62, "rgba(0,0,0,0.9)");
  hole.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.ellipse(315, 350, 230, 270, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvas.toDataURL("image/png");
}

export function FoilStage({
  src,
  name,
  number,
  effect,
  tilt,
}: {
  src: string;
  name: string;
  number: string;
  effect: HoloEffect;
  tilt: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HoloCard | null>(null);
  const metaRef = useRef({ name, number, effect });
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = readyFor === src;
  metaRef.current = { name, number, effect };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let card: HoloCard | null = null;

    void (async () => {
      const { createHoloCard } = await import("@kongyo2/cards-css");
      if (dead) return;
      const mask = faceMaskUrl();
      card = createHoloCard({
        image: src,
        imageAlt: metaRef.current.name || "宠物闪卡",
        effect: metaRef.current.effect,
        interactive: true,
        activateOnClick: false,
        gyroscope: false,
        aspectRatio: 63 / 88,
        textureSeed: 42,
        glow: "#e4b15a",
        depth: { strength: 10, shadow: 0.28 },
        mask: mask || undefined,
        overlay: () => {
          const plate = document.createElement("div");
          plate.className = "lumen-plate";
          const title = document.createElement("p");
          title.dataset.lumenName = "";
          title.className = "lumen-name";
          title.textContent = metaRef.current.name.trim() || "未命名";
          const serial = document.createElement("p");
          serial.dataset.lumenNum = "";
          serial.className = "lumen-num";
          serial.textContent = formatNum(metaRef.current.number);
          plate.append(title, serial);
          return plate;
        },
      });
      if (dead) {
        card.destroy();
        return;
      }
      host.replaceChildren();
      cardRef.current = card;
      const photo = card.element.querySelector("img");
      if (photo) photo.loading = "eager";
      const show = () => {
        if (!dead) setReadyFor(src);
      };
      photo?.addEventListener("load", show, { once: true });
      photo?.addEventListener("error", show, { once: true });
      host.replaceChildren(card.element);
      if (!photo || photo.complete) show();
    })();

    return () => {
      dead = true;
      card?.destroy();
      cardRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    cardRef.current?.setEffect(effect);
  }, [effect, ready]);

  useEffect(() => {
    cardRef.current?.setGyroscope(tilt);
  }, [tilt, ready]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const title = host.querySelector<HTMLElement>("[data-lumen-name]");
    const serial = host.querySelector<HTMLElement>("[data-lumen-num]");
    if (title) title.textContent = name.trim() || "未命名";
    if (serial) serial.textContent = formatNum(number);
  }, [name, number, ready, src]);

  return (
    <div className="lumen-stage relative">
      {!ready ? (
        <img
          src={src || SAMPLE}
          alt=""
          className="aspect-[63/88] w-full rounded-card object-cover"
        />
      ) : null}
      <div ref={hostRef} className={ready ? "block" : "absolute inset-0 opacity-0"} />
      <p className="mt-3 text-center text-sm text-muted">用手指或鼠标划过卡片，箔面会跟着光走。</p>
    </div>
  );
}

export { SAMPLE };
