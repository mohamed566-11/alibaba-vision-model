import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';

interface BeforeAfterSliderProps {
  originalImage: string;
  resultImage: string;
}

export function BeforeAfterSlider({ originalImage, resultImage }: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (containerRef.current) {
      const { left, width } = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - left, width));
      const percentage = (x / width) * 100;
      setPosition(percentage);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) handleMove(e.clientX);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (isDragging) handleMove(e.touches[0].clientX);
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none touch-none p-4 cursor-ew-resize group"
      onMouseDown={(e: ReactMouseEvent) => {
        setIsDragging(true);
        handleMove(e.clientX);
      }}
      onTouchStart={(e: ReactTouchEvent) => {
        setIsDragging(true);
        handleMove(e.touches[0].clientX);
      }}
    >
      {/* Base layer: Result Image */}
      <img 
        src={resultImage} 
        alt="Result" 
        className="absolute inset-0 w-full h-full object-contain p-4"
        draggable={false}
      />
      
      {/* Top layer: Original Image (clipped) */}
      <div 
        className="absolute inset-0 w-full h-full overflow-hidden p-4"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img 
          src={originalImage} 
          alt="Original" 
          className="absolute inset-0 w-full h-full object-contain p-4"
          draggable={false}
        />
      </div>

      {/* Slider Handle */}
      <div 
        className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_4px_rgba(0,0,0,0.3)] z-10"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center group-hover:scale-110 transition-transform">
           <div className="flex gap-1">
             <div className="w-0.5 h-3 bg-zinc-300 rounded-full" />
             <div className="w-0.5 h-3 bg-zinc-300 rounded-full" />
           </div>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute bottom-6 left-6 right-6 flex justify-between pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="bg-black/60 text-white text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full backdrop-blur-sm">
          Original
        </span>
        <span className="bg-black/60 text-white text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full backdrop-blur-sm">
          Isolated
        </span>
      </div>
    </div>
  );
}
