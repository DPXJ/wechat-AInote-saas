"use client";

import { useEffect, useRef } from "react";

export function LoginParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const setSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();
    window.addEventListener("resize", setSize);

    const particleCount = 120;
    const windDir = 1;
    const baseSpeed = 0.8;
    const driftAmplitude = 0.3;

    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
      hue: number;
    };

    const particles: Particle[] = [];
    let seed = 12345;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: random() * canvas.width,
        y: random() * canvas.height,
        vx: (random() - 0.5) * 0.4 + windDir * baseSpeed,
        vy: (random() - 0.5) * driftAmplitude,
        size: 0.5 + random() * 1.2,
        opacity: 0.15 + random() * 0.35,
        hue: 260 + random() * 40,
      });
    }

    let frame = 0;
    const loop = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const windWave = Math.sin(frame * 0.02) * 0.15;

      for (const p of particles) {
        p.x += p.vx + windWave;
        p.y += p.vy;
        if (p.x > canvas.width + 4) p.x = -4;
        if (p.x < -4) p.x = canvas.width + 4;
        if (p.y > canvas.height + 4) p.y = -4;
        if (p.y < -4) p.y = canvas.height + 4;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 60%, 75%, ${p.opacity})`;
        ctx.fill();
      }

      requestAnimationFrame(loop);
    };
    const id = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", setSize);
      cancelAnimationFrame(id);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden
    />
  );
}
