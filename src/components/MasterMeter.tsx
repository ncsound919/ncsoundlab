import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../lib/audioEngine';
import { StudioMeterBar } from './studio/StudioControls';

export function MasterMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peakDb, setPeakDb] = useState(-100);
  const [holdDb, setHoldDb] = useState(-100);
  const [hasClipped, setHasClipped] = useState(false);
  const lastPeakTimeRef = useRef<number>(0);
  const lastStateUpdateRef = useRef<number>(0);
  
  useEffect(() => {
    const analyser = audioEngine.getAnalyser();
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeDomainData = new Float32Array(bufferLength);
    
    let animationId: number;
    
    const draw = () => {
      animationId = requestAnimationFrame(draw);
      
      const width = canvas.width;
      const height = canvas.height;
      const now = performance.now();
      
      // Get frequency data
      analyser.getByteFrequencyData(dataArray);
      
      // Get time domain data for RMS/Peak calculation
      analyser.getFloatTimeDomainData(timeDomainData);
      
      // Calculate Peak
      let maxVal = 0;
      for (let i = 0; i < bufferLength; i++) {
        const absVal = Math.abs(timeDomainData[i]);
        if (absVal > maxVal) maxVal = absVal;
      }
      const currentPeakDb = maxVal > 0 ? 20 * Math.log10(maxVal) : -100;

      // Only push React state when playing or at a low rate when idle, so an
      // idle meter doesn't re-render the sidebar at 60fps. (The canvas spectrum
      // above still animates live every frame.)
      const playing = audioEngine.getIsPlaying();
      if (playing || now - lastStateUpdateRef.current > 300) {
        lastStateUpdateRef.current = now;
        setPeakDb(prev => Math.max(currentPeakDb, prev - 1.2)); // Fast meter drop

        // Peak Hold Logic (1.5s freeze)
        setHoldDb(prevHold => {
          if (currentPeakDb >= prevHold) {
            lastPeakTimeRef.current = now;
            return currentPeakDb;
          } else if (now - lastPeakTimeRef.current > 1500) {
            return Math.max(currentPeakDb, prevHold - 0.8);
          }
          return prevHold;
        });

        if (currentPeakDb >= -0.1) {
          setHasClipped(true);
        }
      }
      
      // Clear canvas
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, width, height);
      
      // Draw Grid
      ctx.strokeStyle = '#1a1a1e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let i=1; i<4; i++) {
        const y = (height / 4) * i;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
      
      // Draw Spectrum
      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;
      
      // Create gradient for spectrum
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#3b82f6'); // blue
      gradient.addColorStop(0.6, '#10b981'); // green
      gradient.addColorStop(1, '#ef4444'); // red
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
    };
    
    draw();
    
    return () => cancelAnimationFrame(animationId);
  }, []);
  
  // Format dB value
  const displayDb = holdDb <= -90 ? '-∞' : holdDb.toFixed(1);
    
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center text-[10px] font-mono font-bold text-gray-500 uppercase">
        <span>Spectrum Analyzer</span>
        <span className={hasClipped ? 'text-red-500 animate-pulse font-black' : 'text-emerald-400'}>
          {hasClipped ? '⚠️ CLIP OVERLOAD' : `PK: ${displayDb} dB`}
        </span>
      </div>
      <div className="flex gap-2 h-24">
        {/* Spectrum Canvas */}
        <div className="flex-1 rounded-md overflow-hidden border border-[#27272a] bg-[#0a0a0c]">
          <canvas 
            ref={canvasRef} 
            width={400} 
            height={100} 
            className="w-full h-full object-fill"
          />
        </div>
        
        {/* Meter section with Clip indicator and Meter Bar */}
        <div className="flex flex-col gap-1 items-center h-full">
          {/* Tactile Clip LED */}
          <button
            onClick={() => setHasClipped(false)}
            title={hasClipped ? "Clipping detected! Click to reset indicator." : "Clip Indicator (Safe)"}
            className={`w-4 h-4 rounded-sm border transition-all duration-150 cursor-pointer ${
              hasClipped 
                ? 'bg-red-500 border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.9)] animate-pulse' 
                : 'bg-red-950/20 border-red-950/40 hover:bg-red-900/30'
            }`}
            aria-label="Reset clip indicator"
          />
          
          {/* Shared peak-hold meter: -20 dB reference, green/amber/red zones. */}
          <StudioMeterBar
            peakDb={peakDb}
            holdDb={holdDb}
            height={72}
            className="flex-1"
            label="Master peak level"
          />
        </div>
      </div>
    </div>
  );
}
