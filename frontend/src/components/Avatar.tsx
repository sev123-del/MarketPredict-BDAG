"use client";
import React, { useEffect, useState } from "react";
import { sanitizeSvgString, svgToDataUri } from "../utils/sanitizeSvg";
import { MAX_AVATAR_SALTS } from "../hooks/useUserSettings";

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
  variant,
  displayName,
  saltIndex,
}: {
  seed?: string;
  size?: number;
  className?: string;
  address?: string;
  variant?: 'auto' | 'multi';
  displayName?: string;
  saltIndex?: number;
}) {
  const s = seed || address || "MP";
  const [c1, c2] = pickColors(s as string);
  const id = `mp-av-${Math.abs(hashToNumber(String(s)))}`;

  const [pref, setPref] = useState<string>("multi");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("mp_avatar_pref");
      // Any legacy/unknown values are now treated as Multi.
      const next = raw === 'multi' ? 'multi' : 'multi';
      setPref(next);
    } catch (_e) {
      // ignore
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("mp_avatar_pref", pref);
    } catch (_e) { }
  }, [pref]);

  const prefVar = variant ?? pref;
  const [multiDataUri, setMultiDataUri] = useState<string | null>(null);
  const [multiLoading, setMultiLoading] = useState(false);

  const saltIdx = (() => {
    const n = Number(saltIndex ?? 0);
    if (Number.isNaN(n)) return 0;
    return ((n % MAX_AVATAR_SALTS) + MAX_AVATAR_SALTS) % MAX_AVATAR_SALTS;
  })();

  const saltedSeed = `${s}:${saltIdx}`;


  // Multiavatar support (client-only dynamic import + sanitization)
  useEffect(() => {
    let cancelled = false;
    async function loadMulti() {
      if (typeof window === 'undefined') return;
      if (prefVar !== 'multi') return;
      try {
        const seedBase = String(s || 'anon');
        setMultiLoading(true);
        const idx = saltIdx;
        const seedToUse = `${seedBase}:${idx}`;
        const mod = await import('@multiavatar/multiavatar/esm');
        type MultiModule = { default?: (seed: string) => string; multiavatar?: (seed: string) => string };
        const modTyped = mod as unknown as MultiModule;
        const multi = modTyped.default || modTyped.multiavatar;
        if (typeof multi === 'function') {
          const svg = multi(seedToUse);
          const clean = await sanitizeSvgString(svg);
          const uri = svgToDataUri(clean);
          if (!cancelled) setMultiDataUri(uri);
        } else {
          if (!cancelled) setMultiDataUri(null);
        }
        if (!cancelled) setMultiLoading(false);
      } catch (e) {
        if (!cancelled) setMultiDataUri(null);
        if (!cancelled) setMultiLoading(false);
      }
    }
    loadMulti();
    return () => { cancelled = true; };
  }, [prefVar, s, saltIdx]);

  if (prefVar === 'multi' && multiDataUri) {
    // data-uri from sanitized SVG — allow raw <img> for LCP and inline SVGs
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={multiDataUri} width={size} height={size} alt={displayName ? `avatar ${displayName}` : 'avatar'} className={className} />;
  }
  if (prefVar === 'multi' && multiLoading) return (
    <div style={{ width: size, height: size }} className={className} aria-busy="true" aria-label="loading avatar">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden="true">
        <rect width={size} height={size} rx={Math.max(6, Math.floor(size / 8))} fill="#0b0c10" />
        <rect x={Math.floor(size * 0.1)} y={Math.floor(size * 0.4)} width={Math.floor(size * 0.8)} height={Math.floor(size * 0.12)} rx={Math.max(2, Math.floor(size / 20))} fill="#111" />
      </svg>
    </div>
  );

  if (!mounted) {
    const n = hashToNumber(String(s));
    const circleCx = (n % Math.max(8, size - 24)) + Math.floor(size * 0.11);
    const circleCy = (hashToNumber(String(s) + "x") % Math.max(8, size - 24)) + Math.floor(size * 0.11);
    const rectX = (hashToNumber(String(s) + "y") % Math.max(4, size - 28)) + Math.floor(size * 0.09);
    const rectY = (hashToNumber(String(s) + "z") % Math.max(4, size - 28)) + Math.floor(size * 0.09);
    const rectSize = Math.max(6, Math.floor(size / 5));
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label="avatar">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" x2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>

        <rect width={size} height={size} rx={Math.max(6, Math.floor(size / 8))} fill={`url(#${id}-g)`} />

        <g fillOpacity="0.18" fill="#000">
          <circle cx={circleCx} cy={circleCy} r={Math.max(4, Math.floor(size / 8))} />
          <rect x={rectX} y={rectY} width={rectSize} height={rectSize} rx={Math.max(2, Math.floor(rectSize / 4))} />
        </g>

        {displayName && (
          <text
            x="50%"
            y="54%"
            textAnchor="middle"
            fontSize={Math.floor(size / 3.5)}
            fill="rgba(255,255,255,0.92)"
            style={{ fontWeight: 700 }}
          >
            {String(displayName).slice(0, 2).toUpperCase()}
          </text>
        )}
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label="avatar">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>

      <rect width={size} height={size} rx={Math.max(6, Math.floor(size / 8))} fill={`url(#${id}-g)`} />

      <g fillOpacity="0.18" fill="#000">
        <circle cx={(hashToNumber(String(s)) % Math.max(8, size - 24)) + Math.floor(size * 0.11)} cy={(hashToNumber(String(s) + "x") % Math.max(8, size - 24)) + Math.floor(size * 0.11)} r={Math.max(4, Math.floor(size / 8))} />
        <rect
          x={(hashToNumber(String(s) + "y") % Math.max(4, size - 28)) + Math.floor(size * 0.09)}
          y={(hashToNumber(String(s) + "z") % Math.max(4, size - 28)) + Math.floor(size * 0.09)}
          width={Math.max(6, Math.floor(size / 5))}
          height={Math.max(6, Math.floor(size / 5))}
          rx={Math.max(2, Math.floor(size / 20))}
        />
      </g>

      {displayName && (
        <text
          x="50%"
          y="54%"
          textAnchor="middle"
          fontSize={Math.floor(size / 3.5)}
          fill="rgba(255,255,255,0.92)"
          style={{ fontWeight: 700 }}
        >
          {String(displayName).slice(0, 2).toUpperCase()}
        </text>
      )}
    </svg>
  );
}

