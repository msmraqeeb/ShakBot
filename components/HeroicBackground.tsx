import React, { useEffect, useRef } from 'react';

const HeroicBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let particles: Particle[] = [];
    let mouseX = width / 2;
    let mouseY = height / 2;

    // Superman Palette: Gold, Red, Royal Blue, White, Ice Blue
    const colors = [
      '#FFD700', // Gold/Yellow
      '#DC2626', // Red
      '#3B82F6', // Royal Blue
      '#ffffff', // White
      '#bfdbfe'  // Ice Blue (Krypton/Fortress)
    ];

    class Particle {
      x: number;
      y: number;
      size: number;
      color: string;
      speedX: number;
      speedY: number;
      
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 3 + 0.5; // Stars/Crystals size
        this.color = colors[Math.floor(Math.random() * colors.length)];
        // Float upwards or slowly drift
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5 - 0.2; // Slight upward drift
      }

      update() {
        // Apply velocity
        this.x += this.speedX;
        this.y += this.speedY;

        // Interactive Parallax: Move slightly away from mouse
        const dx = this.x - mouseX;
        const dy = this.y - mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Influence radius
        if (distance < 300) {
            const forceDirectionX = dx / distance;
            const forceDirectionY = dy / distance;
            const force = (300 - distance) / 300;
            const repelStrength = 0.5; // Subtle push
            this.x += forceDirectionX * force * repelStrength;
            this.y += forceDirectionY * force * repelStrength;
        }

        // Wrap around screen boundaries
        if (this.x > width) this.x = 0;
        else if (this.x < 0) this.x = width;
        if (this.y > height) this.y = 0;
        else if (this.y < 0) this.y = height;
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        // Twinkle effect
        ctx.globalAlpha = Math.random() * 0.5 + 0.5; 
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }

    const init = () => {
      particles = [];
      // Quantity of particles
      const particleCount = Math.min(120, (width * height) / 9000); 
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      requestAnimationFrame(animate);
    };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      init();
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    // Setup
    canvas.width = width;
    canvas.height = height;
    init();
    animate();

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#0f172a]">
       {/* Deep Space / Fortress Gradient */}
       <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-blue-900 via-[#0f172a] to-black opacity-90"></div>
       {/* Canvas for Particles */}
       <canvas ref={canvasRef} className="absolute inset-0 block mix-blend-screen" />
    </div>
  );
};

export default HeroicBackground;