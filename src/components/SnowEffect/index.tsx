import React, { useEffect, useRef } from 'react';
import { useStore } from '../../stores/useStore';

interface Particle {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  speedY: number;
  speedX: number;
  flickerSpeed: number;
  flickerAngle: number;
}

export const SnowEffect: React.FC = () => {
  const { isSnowEnabled } = useStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isSnowEnabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Spare particle count to keep it extremely subtle and CPU-friendly
    const particleCount = Math.min(50, Math.floor((width * height) / 35000));
    const particles: Particle[] = [];

    // Helper to generate a particle
    const createParticle = (isInitial = false): Particle => {
      return {
        x: Math.random() * width,
        y: isInitial ? Math.random() * height : -10,
        radius: Math.random() * 2.2 + 0.8, // Small sizes (0.8px to 3px)
        alpha: Math.random() * 0.25 + 0.08, // Very subtle, minor visibility (8% to 33%)
        speedY: Math.random() * 0.22 + 0.08, // Slow moving downwards
        speedX: Math.random() * 0.12 - 0.06, // Slight drift
        flickerSpeed: Math.random() * 0.02 + 0.01,
        flickerAngle: Math.random() * Math.PI,
      };
    };

    // Populate initial particles
    for (let i = 0; i < particleCount; i++) {
      particles.push(createParticle(true));
    }

    // Handle viewport resizing
    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Core Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Move particle slowly
        p.y += p.speedY;
        p.x += p.speedX;

        // Subtle glowing orbs: slow periodic flicker/pulse
        p.flickerAngle += p.flickerSpeed;
        const currentAlpha = p.alpha + Math.sin(p.flickerAngle) * 0.05;
        const boundedAlpha = Math.max(0.04, Math.min(0.4, currentAlpha));

        // Recycle particles that drift off canvas boundaries
        if (p.y > height + 10) {
          particles[i] = createParticle(false);
          particles[i].y = -5;
        }
        if (p.x > width + 10) {
          p.x = -5;
        } else if (p.x < -10) {
          p.x = width + 5;
        }

        // Draw particle glowing orb using radial gradient for optimal GPU rendering
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3.5);
        grad.addColorStop(0, `rgba(255, 255, 255, ${boundedAlpha})`);
        grad.addColorStop(0.3, `rgba(255, 255, 255, ${boundedAlpha * 0.5})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [isSnowEnabled]);

  if (!isSnowEnabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="ambient-snow-canvas"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 100, // Floats beautifully in front of all panels, but behind settings modals
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  );
};
