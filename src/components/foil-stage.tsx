import { useEffect, useRef, useState } from "react";
import type { HoloCard, HoloEffect } from "@kongyo2/cards-css";

const SAMPLE = "/sample-pet.jpg";

function formatNum(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return `#${(digits || "1").padStart(4, "0")}`;
}

export function FoilStage({
  src,
  foreground,
  name,
  number,
  effect,
  tilt,
  mode,
  variant,
  angle,
  onAngleChange,
  onSensorStatus,
}: {
  src: string;
  foreground: string | null;
  name: string;
  number: string;
  effect: HoloEffect;
  tilt: boolean;
  mode: "depth" | "dual";
  variant: string | null;
  angle: number;
  onAngleChange: (angle: number) => void;
  onSensorStatus: (available: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HoloCard | null>(null);
  const metaRef = useRef({ name, number, effect });
  const angleRef = useRef(angle);
  const tiltRef = useRef(tilt);
  const onAngleRef = useRef(onAngleChange);
  const onSensorRef = useRef(onSensorStatus);
  const paintRef = useRef<((angle: number) => void) | null>(null);
  const [readyFor, setReadyFor] = useState<{ src: string; foreground: string | null } | null>(null);
  const ready = readyFor?.src === src && readyFor.foreground === foreground;
  metaRef.current = { name, number, effect };
  angleRef.current = angle;
  tiltRef.current = tilt;
  onAngleRef.current = onAngleChange;
  onSensorRef.current = onSensorStatus;

  useEffect(() => {
    paintRef.current?.(angle);
  }, [angle]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let card: HoloCard | null = null;

    void (async () => {
      const { createHoloCard } = await import("@kongyo2/cards-css");
      if (dead) return;
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
        className: mode === "dual" ? "lumen-dual" : foreground ? "lumen-layered" : undefined,
        layers:
          mode === "depth" && foreground
            ? [{ image: foreground, parallax: 12, size: "cover" }]
            : undefined,
        mask: mode === "depth" ? foreground || undefined : undefined,
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
      if (mode === "dual" && variant && card.front) {
        const first = card.front.querySelector<HTMLImageElement>(".holo-card__image");
        const second = new Image();
        second.src = variant;
        if (first) {
          void Promise.all([first.decode(), second.decode()])
            .then(() => {
              if (dead || cardRef.current !== card) return;
              const canvas = document.createElement("canvas");
              canvas.className = "holo-card__image lumen-dual-canvas";
              canvas.width = 630;
              canvas.height = 880;
              const context = canvas.getContext("2d");
              if (!context) return;
              const paint = (nextAngle: number) => {
                const mix = Math.min(1, Math.max(0, (Math.abs(nextAngle) - 7) / 18));
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(first, 0, 0, canvas.width, canvas.height);
                context.globalAlpha = mix;
                context.drawImage(second, 0, 0, canvas.width, canvas.height);
                context.globalAlpha = 1;
              };
              paint(angleRef.current);
              first.replaceWith(canvas);
              paintRef.current = paint;
            })
            .catch(() => {});
        }
        const rotator = card.element.querySelector<HTMLElement>(".holo-card__rotator");
        const move = (event: PointerEvent) => {
          if (tiltRef.current || (event.pointerType === "touch" && event.buttons === 0)) return;
          const rect = rotator?.getBoundingClientRect();
          if (!rect) return;
          onAngleRef.current(
            Math.max(-35, Math.min(35, ((event.clientX - rect.left) / rect.width - 0.5) * 70)),
          );
        };
        rotator?.addEventListener("pointermove", move);
      }
      const photo = card.element.querySelector("img");
      if (photo) photo.loading = "eager";
      const show = () => {
        if (!dead) setReadyFor({ src, foreground });
      };
      photo?.addEventListener("load", show, { once: true });
      photo?.addEventListener("error", show, { once: true });
      host.replaceChildren(card.element);
      if (!photo || photo.complete) show();
    })();

    return () => {
      dead = true;
      paintRef.current = null;
      card?.destroy();
      cardRef.current = null;
    };
  }, [src, foreground, mode, variant]);

  useEffect(() => {
    cardRef.current?.setEffect(effect);
  }, [effect, ready]);

  useEffect(() => {
    if (!tilt) {
      cardRef.current?.element
        .querySelector<HTMLElement>(".holo-card__rotator")
        ?.style.removeProperty("pointer-events");
      cardRef.current?.setVars({
        "--rotate-x": "0deg",
        "--rotate-y": "0deg",
        "--tilt-x": 0,
        "--tilt-y": 0,
        "--pointer-x": "50%",
        "--pointer-y": "50%",
        "--pointer-dx": 0,
        "--pointer-dy": 0,
        "--background-x": "50%",
        "--background-y": "50%",
        "--card-opacity": 0,
      });
      return;
    }
    // cards-css only listens to orientation for a popped-out, active card.
    // This inline preview stays in place, so drive its documented CSS variables directly.
    let base: { gamma: number; beta: number } | null = null;
    let moving = false;
    const timeout = window.setTimeout(() => {
      if (!moving) onSensorRef.current(false);
    }, 4000);
    const handle = (event: DeviceOrientationEvent) => {
      if (event.gamma == null || event.beta == null) return;
      if (!base) base = { gamma: event.gamma, beta: event.beta };
      const gamma = Math.max(-30, Math.min(30, event.gamma - base.gamma));
      const beta = Math.max(-30, Math.min(30, event.beta - base.beta));
      if (!moving && Math.abs(gamma) + Math.abs(beta) > 1.5) {
        moving = true;
        onSensorRef.current(true);
      }
      const card = cardRef.current;
      if (!card) return;
      card.element
        .querySelector<HTMLElement>(".holo-card__rotator")
        ?.style.setProperty("pointer-events", "none");
      const x = 50 + gamma * 1.5;
      const y = 50 + beta * 1.5;
      card.setVars({
        "--rotate-x": `${gamma * 0.42}deg`,
        "--rotate-y": `${-beta * 0.35}deg`,
        "--tilt-x": gamma * 0.42,
        "--tilt-y": -beta * 0.35,
        "--pointer-x": `${x}%`,
        "--pointer-y": `${y}%`,
        "--pointer-dx": gamma / 30,
        "--pointer-dy": beta / 30,
        "--background-x": `${50 + gamma * 0.25}%`,
        "--background-y": `${50 + beta * 0.25}%`,
        "--card-opacity": 1,
      });
      if (mode === "dual") onAngleRef.current((gamma / 30) * 35);
    };
    window.addEventListener("deviceorientation", handle, true);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("deviceorientation", handle, true);
      cardRef.current?.element
        .querySelector<HTMLElement>(".holo-card__rotator")
        ?.style.removeProperty("pointer-events");
    };
  }, [tilt, mode, ready]);

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
      <p className="mt-3 text-center text-sm text-muted">
        {mode === "dual"
          ? "左右拖动卡片，或倾斜手机，切换两张完整卡面。"
          : foreground
            ? "划过卡片，看宠物与背景错位移动。"
            : "划过卡片，看看箔面怎样随角度变化。"}
      </p>
    </div>
  );
}

export { SAMPLE };
