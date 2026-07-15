import React, { useEffect, useRef } from 'react';

const FACES_CUBE = [
  'bg-cyan-300/20', 'bg-cyan-300/20',
  'bg-blue-300/25', 'bg-blue-300/25',
  'bg-cyan-300/15', 'bg-cyan-300/15',
];

interface Cube {
  size: number; top: string; left: string;
  spinSpeed: number; driftSpeed: number;
  phase: number;
}

const cubes: Cube[] = [
  { size: 60, top: '15%', left: '5%',  spinSpeed: 0.4, driftSpeed: 0.5, phase: 0 },
  { size: 40, top: '60%', left: '10%', spinSpeed: 0.5, driftSpeed: 0.4, phase: 1.2 },
  { size: 35, top: '70%', left: '75%', spinSpeed: 0.3, driftSpeed: 0.6, phase: 2.5 },
  { size: 50, top: '45%', left: '92%', spinSpeed: 0.6, driftSpeed: 0.3, phase: 0.8 },
  { size: 30, top: '10%', left: '45%', spinSpeed: 0.7, driftSpeed: 0.5, phase: 3.1 },
  { size: 55, top: '50%', left: '3%',  spinSpeed: 0.35, driftSpeed: 0.45, phase: 1.8 },
];

interface Rect {
  w: number; h: number; d: number;
  top: string; left: string;
  spinSpeed: number; driftSpeed: number;
  phase: number;
}

const rects: Rect[] = [
  { w: 100, h: 40, d: 50, top: '22%', left: '82%', spinSpeed: 0.3, driftSpeed: 0.5, phase: 0.5 },
  { w: 70,  h: 30, d: 40, top: '75%', left: '88%', spinSpeed: 0.5, driftSpeed: 0.35, phase: 2.0 },
  { w: 90,  h: 35, d: 45, top: '8%',  left: '60%', spinSpeed: 0.4, driftSpeed: 0.55, phase: 1.0 },
  { w: 60,  h: 25, d: 35, top: '65%', left: '2%',  spinSpeed: 0.55, driftSpeed: 0.4, phase: 2.8 },
];

function IceCube({ size, top, left, spinSpeed, driftSpeed, phase }: Cube) {
  const ref = useRef<HTMLDivElement>(null);
  const dr = useRef<HTMLDivElement>(null);
  const half = size / 2;

  const transforms = [
    `rotateX(90deg) translateZ(${half}px)`,
    `rotateX(-90deg) translateZ(${half}px)`,
    `rotateY(0deg) translateZ(${half}px)`,
    `rotateY(180deg) translateZ(${half}px)`,
    `rotateY(-90deg) translateZ(${half}px)`,
    `rotateY(90deg) translateZ(${half}px)`,
  ];

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let animId: number;
    const start = performance.now();
    function frame(now: number) {
      const t = (now - start) / 1000;
      const sx = Math.sin(t * spinSpeed * 1.3 + phase) * 20;
      const sy = Math.sin(t * spinSpeed + phase * 0.7) * 360;
      const sz = Math.sin(t * spinSpeed * 0.5 + phase) * 10;
      const dx = Math.sin(t * driftSpeed * 0.6 + phase) * 50;
      const dy = Math.sin(t * driftSpeed * 0.8 + phase * 0.5) * 25 - 15;
      if (ref.current) {
        ref.current.style.transform = `rotateX(${sx}deg) rotateY(${sy}deg) rotateZ(${sz}deg)`;
      }
      if (dr.current) {
        dr.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [spinSpeed, driftSpeed, phase]);

  return (
    <div ref={dr} className="absolute" style={{ top, left }} aria-hidden="true">
      <div
        ref={ref}
        className="relative"
        style={{ width: size, height: size, transformStyle: 'preserve-3d' }}
      >
        {FACES_CUBE.map((bg, i) => (
          <div
            key={i}
            className={`absolute inset-0 ${bg}`}
            style={{
              width: size, height: size,
              border: '1px solid rgba(255,255,255,0.08)',
              transform: transforms[i],
              backfaceVisibility: 'hidden',
            }}
          />
        ))}
        <div
          className="absolute inset-0"
          style={{
            width: size, height: size,
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15), transparent 70%)',
            transform: `translateZ(${half + 1}px) rotateY(0deg)`,
            backfaceVisibility: 'hidden',
          }}
        />
      </div>
    </div>
  );
}

function IceRect({ w, h, d, top, left, spinSpeed, driftSpeed, phase }: Rect) {
  const ref = useRef<HTMLDivElement>(null);
  const dr = useRef<HTMLDivElement>(null);
  const hw = w / 2, hh = h / 2, hd = d / 2;

  const rectFaces = [
    { tw: w, th: d, t: `rotateX(90deg) translateZ(${hh}px)` },
    { tw: w, th: d, t: `rotateX(-90deg) translateZ(${hh}px)` },
    { tw: w, th: h, t: `rotateY(0deg) translateZ(${hd}px)` },
    { tw: w, th: h, t: `rotateY(180deg) translateZ(${hd}px)` },
    { tw: d, th: h, t: `rotateY(-90deg) translateZ(${hw}px)` },
    { tw: d, th: h, t: `rotateY(90deg) translateZ(${hw}px)` },
  ];

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let animId: number;
    const start = performance.now();
    function frame(now: number) {
      const t = (now - start) / 1000;
      const sx = Math.sin(t * spinSpeed * 1.1 + phase) * 15;
      const sy = Math.sin(t * spinSpeed + phase * 0.8) * 360;
      const sz = Math.sin(t * spinSpeed * 0.4 + phase) * 8;
      const dx = Math.sin(t * driftSpeed * 0.7 + phase * 0.3) * 45;
      const dy = Math.sin(t * driftSpeed * 0.9 + phase * 0.6) * 20 - 12;
      if (ref.current) {
        ref.current.style.transform = `rotateX(${sx}deg) rotateY(${sy}deg) rotateZ(${sz}deg)`;
      }
      if (dr.current) {
        dr.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [spinSpeed, driftSpeed, phase]);

  return (
    <div ref={dr} className="absolute" style={{ top, left }} aria-hidden="true">
      <div
        ref={ref}
        className="relative"
        style={{ width: w, height: h, transformStyle: 'preserve-3d' }}
      >
        {rectFaces.map((face, i) => (
          <div
            key={i}
            className={`absolute top-0 left-0 ${i < 2 ? 'bg-blue-300/15' : i < 4 ? 'bg-cyan-300/20' : 'bg-blue-300/10'}`}
            style={{
              width: face.tw, height: face.th,
              border: '1px solid rgba(255,255,255,0.06)',
              transform: face.t,
              backfaceVisibility: 'hidden',
            }}
          />
        ))}
      </div>
    </div>
  );
}

const Ice3DBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0" style={{ perspective: '1200px' }}>
        {cubes.map((cube, i) => <IceCube key={`c${i}`} {...cube} />)}
        {rects.map((rect, i) => <IceRect key={`r${i}`} {...rect} />)}
      </div>
    </div>
  );
};

export default Ice3DBackground;
