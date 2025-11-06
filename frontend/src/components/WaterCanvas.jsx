
// WaterCanvas.jsx
import { useEffect, useRef } from 'react';

export default function WaterCanvas() {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Water wave physics
    const waves = [];
    const waveCount = 5;
    const baseY = canvas.height / dpr * 0.6;
    
    for (let i = 0; i < waveCount; i++) {
      waves.push({
        amplitude: 25 + i * 10,
        frequency: 0.018 - i * 0.002,
        phase: i * Math.PI / 3,
        speed: 0.03 + i * 0.008,
        offset: i * 15,
        opacity: 0.18 - i * 0.02,
        initialY: canvas.height / dpr * -0.2,
        targetY: baseY + i * 15,
        currentY: canvas.height / dpr * -0.2,
        velocity: 0,
        // Wave splash effect on landing
        splashAmplitude: 0,
        splashDecay: 0.92
      });
    }
    
    // Particle system for splashes
    const particles = [];
    const maxParticles = 100;
    
    class Particle {
      constructor(x, y, vx, vy, size = null) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = 1;
        this.decay = 0.015;
        this.size = size || (Math.random() * 3 + 1);
      }
      
      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.3; // gravity
        this.vx *= 0.98; // friction
        this.life -= this.decay;
      }
      
      draw(ctx) {
        ctx.fillStyle = `rgba(0, 180, 216, ${this.life * 0.6})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    let time = 0;
    let scrollY = 0;
    let targetScrollY = 0;
    let mouseX = canvas.width / (2 * dpr);
    let mouseY = canvas.height / (2 * dpr);
    let targetMouseX = mouseX;
    let targetMouseY = mouseY;
    let splashAnimationTime = 0;
    let hasLanded = false;
    
    // Smooth interpolation for less jitter
    const lerp = (start, end, factor) => {
      return start + (end - start) * factor;
    };
    
    const handleScroll = () => {
      targetScrollY = window.scrollY;
    };
    
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const newMouseX = e.clientX - rect.left;
      const newMouseY = e.clientY - rect.top;
      
      // Clamp mouse position to canvas bounds
      if (newMouseY < 0 || newMouseY > rect.height || newMouseX < 0 || newMouseX > rect.width) {
        return;
      }
      
      targetMouseX = newMouseX;
      targetMouseY = newMouseY;
      
      // Create splash particles near mouse (only after landing)
      if (hasLanded && Math.random() > 0.8 && particles.length < maxParticles) {
        for (let i = 0; i < 4; i++) {
          particles.push(new Particle(
            mouseX,
            mouseY,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10 - 3
          ));
        }
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    canvas.addEventListener('mousemove', handleMouseMove);
    
    const animate = () => {
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      
      // Smooth interpolation to reduce jitter (60fps = 0.15 is smooth)
      scrollY = lerp(scrollY, targetScrollY, 0.15);
      mouseX = lerp(mouseX, targetMouseX, 0.12);
      mouseY = lerp(mouseY, targetMouseY, 0.12);
      
      // Clear with gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#f6faff');
      gradient.addColorStop(1, '#e9f4fb');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Initial splash animation (first 2.5 seconds)
      if (splashAnimationTime < 2.5) {
        splashAnimationTime += 0.016;
        
        waves.forEach((wave, idx) => {
          const gravity = 1.2;
          const damping = 0.35;
          
          if (wave.currentY < wave.targetY) {
            wave.velocity += gravity;
            wave.currentY += wave.velocity;
          } else if (!hasLanded) {
            // Just landed - create BIG splash AND wave splash effect!
            wave.currentY = wave.targetY;
            wave.velocity = 0;
            
            // Trigger wave splash on impact
            wave.splashAmplitude = 80 - idx * 10; // Different splash sizes per wave
            
            if (idx === 0) {
              hasLanded = true;
              // Create massive splash particles
              for (let i = 0; i < 70; i++) {
                const angle = Math.random() * Math.PI - Math.PI / 2;
                const speed = Math.random() * 18 + 12;
                particles.push(new Particle(
                  width / 2 + (Math.random() - 0.5) * width * 0.6,
                  wave.targetY,
                  Math.cos(angle) * speed,
                  Math.sin(angle) * speed,
                  Math.random() * 6 + 2
                ));
              }
            }
          } else {
            // Bounce effect
            if (Math.abs(wave.velocity) > 0.1) {
              wave.velocity *= -damping;
              wave.currentY = wave.targetY;
              // Add smaller splash on bounce
              wave.splashAmplitude = Math.abs(wave.velocity) * 15;
            } else {
              wave.velocity = 0;
              wave.currentY = wave.targetY;
            }
          }
          
          // Decay the splash effect over time
          if (wave.splashAmplitude > 0.5) {
            wave.splashAmplitude *= wave.splashDecay;
          } else {
            wave.splashAmplitude = 0;
          }
        });
      }
      
      // Scroll effect - waves rise/fall (smoothed)
      const scrollEffect = hasLanded ? Math.sin(scrollY * 0.01) * 25 : 0;
      
      // Mouse influence (only after landing, smoothed)
      const mouseInfluence = hasLanded ? {
        x: (mouseX - width / 2) * 0.08,
        y: (mouseY - height / 2) * 0.08
      } : { x: 0, y: 0 };
      
      // Draw waves
      waves.forEach((wave, idx) => {
        ctx.beginPath();
        ctx.moveTo(0, height);
        
        const points = [];
        const currentBaseY = wave.currentY;
        
        for (let x = 0; x <= width; x += 5) {
          let y = currentBaseY;
          
          if (hasLanded) {
            const distanceToMouse = Math.sqrt(
              Math.pow(x - mouseX, 2) + Math.pow(currentBaseY - mouseY, 2)
            );
            const mouseEffect = Math.max(0, 1 - distanceToMouse / 150) * 40;
            
            // Add the wave splash effect - creates ripples radiating from center
            const distanceFromCenter = Math.abs(x - width / 2);
            const splashWave = wave.splashAmplitude * 
              Math.sin((distanceFromCenter * 0.02) - (splashAnimationTime * 8)) *
              Math.exp(-distanceFromCenter / (width * 0.3)); // Decay from center
            
            y = currentBaseY +
              Math.sin(x * wave.frequency + time * wave.speed + wave.phase) * wave.amplitude +
              scrollEffect * (1 + idx * 0.2) +
              mouseEffect +
              mouseInfluence.y +
              splashWave; // Add splash wave effect
          } else {
            // Add turbulence during fall
            y += Math.sin(x * 0.03 + splashAnimationTime * 8) * 15;
          }
          
          points.push({ x, y });
        }
        
        // Draw smooth wave
        points.forEach(({ x, y }, i) => {
          if (i === 0) {
            ctx.lineTo(x, y);
          } else {
            const prevPoint = points[i - 1];
            const midX = (prevPoint.x + x) / 2;
            const midY = (prevPoint.y + y) / 2;
            ctx.quadraticCurveTo(prevPoint.x, prevPoint.y, midX, midY);
          }
        });
        
        ctx.lineTo(width, height);
        ctx.closePath();
        
        // Wave colors - oceanic blues
        const waveGradient = ctx.createLinearGradient(0, currentBaseY - 50, 0, height);
        waveGradient.addColorStop(0, `rgba(0, 180, 216, ${wave.opacity})`);
        waveGradient.addColorStop(1, `rgba(0, 119, 182, ${wave.opacity * 1.5})`);
        
        ctx.fillStyle = waveGradient;
        ctx.fill();
        
        // Add white caps (more prominent during splash)
        if (idx < 2) {
          const capOpacity = wave.opacity * 2 + (wave.splashAmplitude > 0 ? 0.3 : 0);
          ctx.strokeStyle = `rgba(255, 255, 255, ${capOpacity})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
      
      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw(ctx);
        
        if (particles[i].life <= 0) {
          particles.splice(i, 1);
        }
      }
      
      // Foam/bubble effects (only after landing)
      if (hasLanded) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let i = 0; i < 15; i++) {
          const x = (time * 20 + i * 50) % width;
          const y = baseY + Math.sin(time * 0.5 + i) * 30 + scrollEffect;
          const size = Math.sin(time + i) * 2 + 2;
          
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      time += 0.016;
      requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('scroll', handleScroll);
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="water-canvas"
    />
  );
}