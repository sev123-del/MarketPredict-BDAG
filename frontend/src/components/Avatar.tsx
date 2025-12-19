"use client";
import React, { useEffect, useState } from "react";

function hashToNumber(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickColors(seed: string) {
  const n = hashToNumber(seed);
  const hue1 = n % 360;
  const hue2 = (n >> 8) % 360;
  const c1 = `hsl(${hue1} 85% 55%)`;
  const c2 = `hsl(${hue2} 65% 45%)`;
  return [c1, c2];
}

export default function Avatar({
  seed = "",
  size = 48,
  className = "",
  address,
}: {
  seed?: string;
  size?: number;
  className?: string;
  address?: string;
}) {
  const s = seed || address || "MP";
  const [c1, c2] = pickColors(s as string);
  const id = `mp-av-${Math.abs(hashToNumber(String(s)))}`;

  // preference: 'auto' | 'jazzicon' | 'boring'
  const [pref, setPref] = useState<string>(() => {
    try {
      return window.localStorage.getItem("mp_avatar_pref") || "auto";
    } catch (e) {
      return "auto";
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("mp_avatar_pref", pref);
    } catch (e) {}
  }, [pref]);

  // Vendored jazzicon-like generator (small, deterministic SVG)
  function JazziconSVG({ seedStr, size }: { seedStr: string; size: number }) {
    const n = hashToNumber(seedStr);
    const parts = 5 + (n % 5);
    const colors: string[] = [];
    for (let i = 0; i < parts; i++) {
      const hue = (n >> (i * 3)) % 360;
      colors.push(`hsl(${hue} 70% ${40 + (i * 6) % 30}%)`);
    }
    const circles = colors.map((col, i) => {
      const r = Math.max(4, Math.floor((size / 2) * (0.2 + i / parts)));
      const cx = Math.floor(size / 2 + ((n >> (i * 2)) % (size / 4)) - size / 8);
      const cy = Math.floor(size / 2 + ((n >> (i * 3)) % (size / 4)) - size / 8);
      return (
        <circle key={i} cx={cx} cy={cy} r={r} fill={col} fillOpacity={Math.max(0.25, 0.85 - i * 0.12)} />
      );
    });
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="jazzicon">
        <rect width={size} height={size} rx={Math.max(6, Math.floor(size / 8))} fill="#0b0c10" />
        {circles}
        <text
          x="50%"
          y="54%"
          textAnchor="middle"
          fontSize={Math.floor(size / 3.5)}
          fill="rgba(255,255,255,0.92)"
          style={{ fontWeight: 700 }}
        >
          {String(seedStr).slice(0, 2).toUpperCase()}
        </text>
      </svg>
    );
  }

  // Vendored boring-style avatar (grid-based)
  function BoringSVG({ seedStr, size }: { seedStr: string; size: number }) {
    const n = hashToNumber(seedStr);
    const grid = 5;
    const cell = Math.floor(size / grid);
    const cells: JSX.Element[] = [];
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        const idx = x + y * grid;
        const v = (n >> (idx % 16)) & 1;
        const hue = (n >> (idx % 12)) % 360;
        const fill = v ? `hsl(${hue} 65% ${45 + (idx % 6) * 3}%)` : "transparent";
        const rx = Math.max(2, Math.floor(cell / 6));
        const offset = Math.floor((size - cell * grid) / 2);
        cells.push(
          <rect
            key={`${x}-${y}`}
            x={x * cell + offset}
            y={y * cell + offset}
            width={cell}
            height={cell}
            rx={rx}
            fill={fill}
          />
        );
      }
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="boring-avatar">
        <rect width={size} height={size} rx={Math.max(6, Math.floor(size / 8))} fill={`hsl(${n % 360} 60% 20%)`} />
        {cells}
      </svg>
    );
  }

  // No on-chain/avatar provider support — prefer local generators or deterministic fallback

  // If user explicitly selected jazzicon
  if (pref === "jazzicon") return <JazziconSVG seedStr={s as string} size={size} />;
  // If user explicitly selected boring
  if (pref === "boring") return <BoringSVG seedStr={s as string} size={size} />;

  // default deterministic SVG fallback
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="avatar">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="12" fill={`url(#${id}-g)`} />

      {/* decorative shapes based on seed */}
      <g fillOpacity="0.18" fill="#000">
        <circle cx={(hashToNumber(String(s)) % 48) + 8} cy={(hashToNumber(String(s) + "x") % 48) + 8} r="8" />
        <rect
          x={(hashToNumber(String(s) + "y") % 36) + 6}
          y={(hashToNumber(String(s) + "z") % 36) + 6}
          width="12"
          height="12"
          rx="3"
        />
      </g>

      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        fontSize="18"
        fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto"
        fill="rgba(255,255,255,0.9)"
        style={{ fontWeight: 700 }}
      >
        {String(s).slice(0, 2).toUpperCase()}
      </text>
    </svg>
  );
}
 
