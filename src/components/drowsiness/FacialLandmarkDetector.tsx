import React, { useRef, useEffect, useState, useCallback } from 'react';
import { vehicleService } from '@/services/supabaseVehicleService';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Eye, Camera, CameraOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface FacialLandmarkDetectorProps {
  vehicleId: string;
  isActive: boolean;
  onDetection?: (state: DrowsinessState, ear: number) => void;
}

type DrowsinessState = 'awake' | 'drowsy' | 'sleeping';

interface DetectionResult {
  state: DrowsinessState;
  ear: number;
  confidence: number;
}

const FacialLandmarkDetector: React.FC<FacialLandmarkDetectorProps> = ({
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
  
  // State counters matching your Python code
  const [sleepCounter, setSleepCounter] = useState(0);
  const [drowsyCounter, setDrowsyCounter] = useState(0);
  const [activeCounter, setActiveCounter] = useState(0);
  const [lastSleepTime, setLastSleepTime] = useState(0);
  const [lastDrowsyTime, setLastDrowsyTime] = useState(0);
  
  // Thresholds matching your Python implementation
  const ALARM_DURATION = 10; // seconds
  const SLEEP_THRESHOLD = 6; // frames
  const DROWSY_THRESHOLD = 6; // frames
  
  const { toast } = useToast();

  // Compute Euclidean distance (matching your Python function)
  const compute = useCallback((ptA: number[], ptB: number[]): number => {
    return Math.sqrt(Math.pow(ptA[0] - ptB[0], 2) + Math.pow(ptA[1] - ptB[1], 2));
  }, []);

  // Blink detection function (exact match to your Python code)
  const blinked = useCallback((a: number[], b: number[], c: number[], d: number[], e: number[], f: number[]): number => {
    const up = compute(b, d) + compute(c, e);
    const down = compute(a, f);
    const ratio = up / (2.0 * down);
    
    if (ratio > 0.25) {
      return 2; // Eye open
    } else if (0.21 < ratio && ratio <= 0.25) {
      return 1; // Drowsy
    } else {
      return 0; // Eye closed
    }
  }, [compute]);

  // Simulate facial landmarks (68 points like dlib)
  const detectFacialLandmarks = useCallback((): number[][] => {
    const landmarks: number[][] = [];
    
    // Simulate 68 facial landmarks with more realistic eye positions
    for (let i = 0; i < 68; i++) {
      if (i >= 36 && i <= 47) {
        // Eye landmarks - simulate with varying positions for blink detection
        const baseX = i < 42 ? 200 : 280; // Left vs right eye
        const baseY = 180;
        const variation = Math.random() * 10 - 5; // Add some variation
        landmarks.push([baseX + variation, baseY + variation]);
      } else {
        // Other facial landmarks
        landmarks.push([
          Math.random() * 320 + 160,
          Math.random() * 240 + 120
        ]);
      }
    }
    return landmarks;
  }, []);

  // Play alarm sound using Web Audio API (cross-platform compatible)
  const playAlarmSound = useCallback((frequency: number, duration: number) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const context = audioContextRef.current;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0, context.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, context.currentTime + duration / 1000);
    
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + duration / 1000);
  }, []);

  // Process frame using your exact algorithm
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isDetecting) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    // Draw current frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Detect facial landmarks
    const landmarks = detectFacialLandmarks();
    
    // Extract eye landmarks (matching your Python indices)
    const leftEyeLandmarks = [
      landmarks[36], landmarks[37], landmarks[38], // a, b, c
      landmarks[41], landmarks[40], landmarks[39]  // d, e, f
    ];
    const rightEyeLandmarks = [
      landmarks[42], landmarks[43], landmarks[44], // a, b, c
      landmarks[47], landmarks[46], landmarks[45]  // d, e, f
    ];
    
    // Blink detection for both eyes
    const leftBlink = blinked(
      leftEyeLandmarks[0], leftEyeLandmarks[1], leftEyeLandmarks[2],
      leftEyeLandmarks[3], leftEyeLandmarks[4], leftEyeLandmarks[5]
    );
    const rightBlink = blinked(
      rightEyeLandmarks[0], rightEyeLandmarks[1], rightEyeLandmarks[2],
      rightEyeLandmarks[3], rightEyeLandmarks[4], rightEyeLandmarks[5]
    );
    
    // Calculate EAR for display
    const leftRatio = (compute(leftEyeLandmarks[1], leftEyeLandmarks[4]) + 
                      compute(leftEyeLandmarks[2], leftEyeLandmarks[5])) / 
                     (2.0 * compute(leftEyeLandmarks[0], leftEyeLandmarks[3]));
    const rightRatio = (compute(rightEyeLandmarks[1], rightEyeLandmarks[4]) + 
                       compute(rightEyeLandmarks[2], rightEyeLandmarks[5])) / 
                      (2.0 * compute(rightEyeLandmarks[0], rightEyeLandmarks[3]));
    const avgRatio = (leftRatio + rightRatio) / 2.0;
    setEyeAspectRatio(avgRatio);
    
    let newState: DrowsinessState = currentState;
    let newSleepCounter = sleepCounter;
    let newDrowsyCounter = drowsyCounter;
    let newActiveCounter = activeCounter;
    const currentTime = Date.now() / 1000;
    
    // State detection (exact match to your Python logic)
    if (leftBlink === 0 || rightBlink === 0) {
      newSleepCounter += 1;
      newDrowsyCounter = 0;
      newActiveCounter = 0;
      
      if (newSleepCounter > SLEEP_THRESHOLD) {
        newState = 'sleeping';
        if (currentTime - lastSleepTime >= ALARM_DURATION) {
          console.log('SLEEPING DETECTED! Playing alarm...');
          playAlarmSound(1000, 1000); // 1000Hz for 1 second
          setLastSleepTime(currentTime);
          
          toast({
            title: '🚨 SLEEPING !!!',
            description: 'Wake up! Pull over safely and take a break!',
            variant: 'destructive',
          });
          
          // Record event to database
          vehicleService.recordDrowsinessEvent({
            vehicle_id: vehicleId,
            drowsiness_level: 'severe',
            confidence: 0.95,
            eye_aspect_ratio: avgRatio,
            mouth_aspect_ratio: 0.5,
            alert_triggered: true
          }).catch(console.error);
        }
      }
    } else if (leftBlink === 1 || rightBlink === 1) {
      newSleepCounter = 0;
      newActiveCounter = 0;
      newDrowsyCounter += 1;
      
      if (newDrowsyCounter > DROWSY_THRESHOLD) {
        newState = 'drowsy';
        if (currentTime - lastDrowsyTime >= ALARM_DURATION) {
          console.log('DROWSY DETECTED! Playing warning...');
          playAlarmSound(500, 1000); // 500Hz for 1 second
          setLastDrowsyTime(currentTime);
          
          toast({
            title: '⚠️ Drowsy !',
            description: 'You appear drowsy. Consider taking a break.',
            variant: 'destructive',
          });
          
          // Record event to database
          vehicleService.recordDrowsinessEvent({
            vehicle_id: vehicleId,
            drowsiness_level: 'moderate',
            confidence: 0.85,
            eye_aspect_ratio: avgRatio,
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
      onDetection?.(newState, avgRatio);
    }
  }, [isDetecting, vehicleId, currentState, sleepCounter, drowsyCounter, activeCounter, lastSleepTime, lastDrowsyTime, detectFacialLandmarks, blinked, compute, playAlarmSound, onDetection, toast]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 640, 
          height: 480,
          facingMode: 'user' 
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
      setError('Could not access camera. Please check permissions.');
      setHasCamera(false);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setHasCamera(false);
    setIsDetecting(false);
  }, []);

  // Start detection
  const startDetection = useCallback(() => {
    if (!hasCamera) return;
    
    setIsDetecting(true);
    intervalRef.current = window.setInterval(processFrame, 100); // 10 FPS
  }, [hasCamera, processFrame]);

  // Stop detection
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
    };
  }, [stopCamera]);

  const getStateColor = (state: DrowsinessState) => {
    switch (state) {
      case 'awake': return 'bg-green-500 text-white';
      case 'drowsy': return 'bg-red-500 text-white';
      case 'sleeping': return 'bg-blue-500 text-white';
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
          Drowsiness Detection
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
            className="absolute top-0 left-0 w-full h-full opacity-30"
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
        
        {/* Detection info */}
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Algorithm:</strong></p>
          <p>• <span className="text-green-600">Active</span>: Eyes open (ratio &gt; 0.25)</p>
          <p>• <span className="text-red-600">Drowsy</span>: Partially closed (0.21-0.25) for 6+ frames</p>
          <p>• <span className="text-blue-600">Sleeping</span>: Eyes closed (&lt; 0.21) for 6+ frames</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default FacialLandmarkDetector;
