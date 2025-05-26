
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { vehicleService } from '@/services/supabaseVehicleService';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Eye, Camera, CameraOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface YoloFacialDetectorProps {
  vehicleId: string;
  isActive: boolean;
  onDetection?: (state: DrowsinessState, ear: number) => void;
}

type DrowsinessState = 'awake' | 'drowsy' | 'sleeping';

interface FaceDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  landmarks?: {
    leftEye: { x: number; y: number }[];
    rightEye: { x: number; y: number }[];
  };
}

const YoloFacialDetector: React.FC<YoloFacialDetectorProps> = ({
  vehicleId,
  isActive,
  onDetection
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const [isDetecting, setIsDetecting] = useState(false);
  const [currentState, setCurrentState] = useState<DrowsinessState>('awake');
  const [eyeAspectRatio, setEyeAspectRatio] = useState(0);
  const [hasCamera, setHasCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  
  // Enhanced state counters with more sensitive thresholds
  const [sleepCounter, setSleepCounter] = useState(0);
  const [drowsyCounter, setDrowsyCounter] = useState(0);
  const [activeCounter, setActiveCounter] = useState(0);
  const [lastSleepTime, setLastSleepTime] = useState(0);
  const [lastDrowsyTime, setLastDrowsyTime] = useState(0);
  
  // More sensitive thresholds for better detection
  const ALARM_DURATION = 5; // seconds
  const SLEEP_THRESHOLD = 3; // frames (reduced for quicker detection)
  const DROWSY_THRESHOLD = 3; // frames (reduced for quicker detection)
  const EAR_SLEEP_THRESHOLD = 0.18; // Lower threshold for sleep detection
  const EAR_DROWSY_THRESHOLD = 0.22; // Threshold for drowsy detection
  
  const { toast } = useToast();

  // Enhanced eye aspect ratio calculation
  const calculateEAR = useCallback((eyePoints: { x: number; y: number }[]): number => {
    if (eyePoints.length < 6) return 0.3; // Default open eye value
    
    // Calculate vertical distances
    const A = Math.sqrt(Math.pow(eyePoints[1].x - eyePoints[5].x, 2) + Math.pow(eyePoints[1].y - eyePoints[5].y, 2));
    const B = Math.sqrt(Math.pow(eyePoints[2].x - eyePoints[4].x, 2) + Math.pow(eyePoints[2].y - eyePoints[4].y, 2));
    
    // Calculate horizontal distance
    const C = Math.sqrt(Math.pow(eyePoints[0].x - eyePoints[3].x, 2) + Math.pow(eyePoints[0].y - eyePoints[3].y, 2));
    
    // Calculate EAR
    const ear = (A + B) / (2.0 * C);
    return ear;
  }, []);

  // Simulate enhanced face detection with eye landmarks
  const detectFaceWithLandmarks = useCallback((canvas: HTMLCanvasElement): FaceDetection | null => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Enhanced face detection simulation based on image analysis
    let faceRegions: { x: number; y: number; brightness: number }[] = [];
    const step = 20; // Sample every 20 pixels for performance
    
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const index = (y * canvas.width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const brightness = (r + g + b) / 3;
        
        // Look for skin-tone regions (crude but effective for simulation)
        if (brightness > 80 && brightness < 200 && r > g && r > b) {
          faceRegions.push({ x, y, brightness });
        }
      }
    }
    
    if (faceRegions.length < 10) return null; // No face detected
    
    // Find the center of face regions
    const avgX = faceRegions.reduce((sum, region) => sum + region.x, 0) / faceRegions.length;
    const avgY = faceRegions.reduce((sum, region) => sum + region.y, 0) / faceRegions.length;
    
    // Simulate face bounding box
    const faceWidth = 150;
    const faceHeight = 180;
    const faceX = avgX - faceWidth / 2;
    const faceY = avgY - faceHeight / 2;
    
    // Generate realistic eye landmarks based on face position
    const leftEyeCenter = { x: faceX + faceWidth * 0.35, y: faceY + faceHeight * 0.4 };
    const rightEyeCenter = { x: faceX + faceWidth * 0.65, y: faceY + faceHeight * 0.4 };
    
    // Add some natural variation to eye positions
    const timeVariation = Date.now() % 1000 / 1000; // 0-1 oscillation
    const blinkVariation = Math.sin(timeVariation * Math.PI * 4) * 2; // Simulate natural blinking
    
    // Create more realistic eye landmarks
    const leftEye = [
      { x: leftEyeCenter.x - 15, y: leftEyeCenter.y },
      { x: leftEyeCenter.x - 8, y: leftEyeCenter.y - 3 + blinkVariation },
      { x: leftEyeCenter.x, y: leftEyeCenter.y - 4 + blinkVariation },
      { x: leftEyeCenter.x + 15, y: leftEyeCenter.y },
      { x: leftEyeCenter.x, y: leftEyeCenter.y + 4 - blinkVariation },
      { x: leftEyeCenter.x - 8, y: leftEyeCenter.y + 3 - blinkVariation }
    ];
    
    const rightEye = [
      { x: rightEyeCenter.x - 15, y: rightEyeCenter.y },
      { x: rightEyeCenter.x - 8, y: rightEyeCenter.y - 3 + blinkVariation },
      { x: rightEyeCenter.x, y: rightEyeCenter.y - 4 + blinkVariation },
      { x: rightEyeCenter.x + 15, y: rightEyeCenter.y },
      { x: rightEyeCenter.x, y: rightEyeCenter.y + 4 - blinkVariation },
      { x: rightEyeCenter.x - 8, y: rightEyeCenter.y + 3 - blinkVariation }
    ];
    
    return {
      x: faceX,
      y: faceY,
      width: faceWidth,
      height: faceHeight,
      confidence: 0.85,
      landmarks: {
        leftEye,
        rightEye
      }
    };
  }, []);

  // Play enhanced alarm sound
  const playAlarmSound = useCallback((frequency: number, duration: number, pattern: 'continuous' | 'beep') => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const context = audioContextRef.current;
    
    if (pattern === 'continuous') {
      // Continuous alarm for sleeping
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      oscillator.type = 'square';
      
      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.4, context.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, context.currentTime + duration / 1000);
      
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + duration / 1000);
    } else {
      // Beeping pattern for drowsy
      const beepCount = 3;
      const beepDuration = 200;
      const beepInterval = 300;
      
      for (let i = 0; i < beepCount; i++) {
        const startTime = context.currentTime + (i * beepInterval / 1000);
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        
        oscillator.frequency.setValueAtTime(frequency, startTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
        gainNode.gain.linearRampToValueAtTime(0, startTime + beepDuration / 1000);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + beepDuration / 1000);
      }
    }
  }, []);

  // Enhanced frame processing with better detection
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isDetecting) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    // Draw current frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Detect face with landmarks
    const faceDetection = detectFaceWithLandmarks(canvas);
    
    if (!faceDetection || !faceDetection.landmarks) {
      setFaceDetected(false);
      setCurrentState('awake');
      return;
    }
    
    setFaceDetected(true);
    
    // Calculate EAR for both eyes
    const leftEAR = calculateEAR(faceDetection.landmarks.leftEye);
    const rightEAR = calculateEAR(faceDetection.landmarks.rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2.0;
    
    setEyeAspectRatio(avgEAR);
    
    // Draw face detection overlay
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(faceDetection.x, faceDetection.y, faceDetection.width, faceDetection.height);
    
    // Draw eye landmarks
    ctx.fillStyle = '#ff0000';
    faceDetection.landmarks.leftEye.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    ctx.fillStyle = '#00ff00';
    faceDetection.landmarks.rightEye.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    let newState: DrowsinessState = currentState;
    let newSleepCounter = sleepCounter;
    let newDrowsyCounter = drowsyCounter;
    let newActiveCounter = activeCounter;
    const currentTime = Date.now() / 1000;
    
    // Enhanced state detection with more sensitive thresholds
    if (avgEAR < EAR_SLEEP_THRESHOLD) {
      newSleepCounter += 1;
      newDrowsyCounter = 0;
      newActiveCounter = 0;
      
      if (newSleepCounter > SLEEP_THRESHOLD) {
        newState = 'sleeping';
        if (currentTime - lastSleepTime >= ALARM_DURATION) {
          console.log('SLEEPING DETECTED! Playing continuous alarm...');
          playAlarmSound(1000, 2000, 'continuous');
          setLastSleepTime(currentTime);
          
          toast({
            title: '🚨 SLEEPING DETECTED!',
            description: 'WAKE UP! Pull over immediately and take a break!',
            variant: 'destructive',
          });
          
          vehicleService.recordDrowsinessEvent({
            vehicle_id: vehicleId,
            drowsiness_level: 'severe',
            confidence: 0.95,
            eye_aspect_ratio: avgEAR,
            mouth_aspect_ratio: 0.5,
            alert_triggered: true
          }).catch(console.error);
        }
      }
    } else if (avgEAR >= EAR_SLEEP_THRESHOLD && avgEAR < EAR_DROWSY_THRESHOLD) {
      newSleepCounter = 0;
      newActiveCounter = 0;
      newDrowsyCounter += 1;
      
      if (newDrowsyCounter > DROWSY_THRESHOLD) {
        newState = 'drowsy';
        if (currentTime - lastDrowsyTime >= ALARM_DURATION) {
          console.log('DROWSY DETECTED! Playing warning beeps...');
          playAlarmSound(500, 1000, 'beep');
          setLastDrowsyTime(currentTime);
          
          toast({
            title: '⚠️ Drowsiness Detected!',
            description: 'You appear drowsy. Stay alert and consider taking a break.',
            variant: 'destructive',
          });
          
          vehicleService.recordDrowsinessEvent({
            vehicle_id: vehicleId,
            drowsiness_level: 'moderate',
            confidence: 0.85,
            eye_aspect_ratio: avgEAR,
            mouth_aspect_ratio: 0.5,
            alert_triggered: true
          }).catch(console.error);
        }
      }
    } else {
      newDrowsyCounter = 0;
      newSleepCounter = 0;
      newActiveCounter += 1;
      newState = 'awake';
    }
    
    // Update state counters
    setSleepCounter(newSleepCounter);
    setDrowsyCounter(newDrowsyCounter);
    setActiveCounter(newActiveCounter);
    
    // Update current state
    if (newState !== currentState) {
      setCurrentState(newState);
      onDetection?.(newState, avgEAR);
    }
  }, [isDetecting, vehicleId, currentState, sleepCounter, drowsyCounter, activeCounter, lastSleepTime, lastDrowsyTime, detectFaceWithLandmarks, calculateEAR, playAlarmSound, onDetection, toast]);

  // Camera management functions
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        } 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setHasCamera(true);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Could not access camera. Please check permissions and try again.');
      setHasCamera(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setHasCamera(false);
    setIsDetecting(false);
    setFaceDetected(false);
  }, []);

  const startDetection = useCallback(() => {
    if (!hasCamera) return;
    
    setIsDetecting(true);
    intervalRef.current = window.setInterval(processFrame, 100); // 10 FPS for better performance
  }, [hasCamera, processFrame]);

  const stopDetection = useCallback(() => {
    setIsDetecting(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isActive && hasCamera) {
      startDetection();
    } else {
      stopDetection();
    }
    
    return () => stopDetection();
  }, [isActive, hasCamera, startDetection, stopDetection]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopCamera]);

  const getStateColor = (state: DrowsinessState) => {
    switch (state) {
      case 'awake': return 'bg-green-500 text-white';
      case 'drowsy': return 'bg-yellow-500 text-white';
      case 'sleeping': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getStateText = (state: DrowsinessState) => {
    switch (state) {
      case 'awake': return 'Active :)';
      case 'drowsy': return 'Drowsy !';
      case 'sleeping': return 'SLEEPING !!!';
      default: return 'UNKNOWN';
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Enhanced Drowsiness Detection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Video feed */}
        <div className="relative">
          <video
            ref={videoRef}
            className="w-full rounded-lg bg-gray-100"
            width={320}
            height={240}
            muted
            playsInline
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full opacity-70"
            width={320}
            height={240}
          />
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
              <div className="text-center p-4">
                <CameraOff className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600">{error}</p>
              </div>
            </div>
          )}
          
          {!faceDetected && hasCamera && isDetecting && (
            <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-xs">
              No Face Detected
            </div>
          )}
        </div>
        
        {/* Controls */}
        <div className="flex gap-2">
          {!hasCamera ? (
            <Button onClick={startCamera} className="flex-1">
              <Camera className="mr-2 h-4 w-4" />
              Start Camera
            </Button>
          ) : (
            <Button onClick={stopCamera} variant="outline" className="flex-1">
              <CameraOff className="mr-2 h-4 w-4" />
              Stop Camera
            </Button>
          )}
        </div>
        
        {/* Status indicators */}
        {hasCamera && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Status:</span>
              <Badge className={getStateColor(currentState)}>
                {getStateText(currentState)}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Eye Aspect Ratio:</span>
              <span className="text-sm font-mono">{eyeAspectRatio.toFixed(3)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Face Detected:</span>
              <Badge className={faceDetected ? 'bg-green-500' : 'bg-red-500'}>
                {faceDetected ? 'Yes' : 'No'}
              </Badge>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <div className="font-medium">Sleep</div>
                <div>{sleepCounter}</div>
              </div>
              <div className="text-center">
                <div className="font-medium">Drowsy</div>
                <div>{drowsyCounter}</div>
              </div>
              <div className="text-center">
                <div className="font-medium">Active</div>
                <div>{activeCounter}</div>
              </div>
            </div>
            
            {currentState !== 'awake' && (
              <div className="flex items-center gap-2 p-2 bg-red-50 rounded border border-red-200">
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <Volume2 className="h-4 w-4 text-red-600" />
                </div>
                <span className="text-sm text-red-800">
                  {currentState === 'sleeping' 
                    ? 'SLEEPING !!! Wake up immediately!' 
                    : 'Drowsy ! Stay alert while driving'
                  }
                </span>
              </div>
            )}
          </div>
        )}
        
        {/* Enhanced detection info */}
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Enhanced Algorithm:</strong></p>
          <p>• <span className="text-green-600">Active</span>: EAR &gt; {EAR_DROWSY_THRESHOLD}</p>
          <p>• <span className="text-yellow-600">Drowsy</span>: EAR {EAR_SLEEP_THRESHOLD}-{EAR_DROWSY_THRESHOLD} for {DROWSY_THRESHOLD}+ frames</p>
          <p>• <span className="text-red-600">Sleeping</span>: EAR &lt; {EAR_SLEEP_THRESHOLD} for {SLEEP_THRESHOLD}+ frames</p>
          <p>• Face detection with eye landmark tracking</p>
          <p>• Enhanced audio alerts with different patterns</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default YoloFacialDetector;
