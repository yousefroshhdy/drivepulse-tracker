
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
  const [drowsyFrameCount, setDrowsyFrameCount] = useState(0);
  const [sleepingFrameCount, setSleepingFrameCount] = useState(0);
  
  // Thresholds based on the GitHub repository
  const EAR_THRESHOLD_DROWSY = 0.25;
  const EAR_THRESHOLD_SLEEPING = 0.20;
  const DROWSY_FRAME_THRESHOLD = 15; // frames to confirm drowsiness
  const SLEEPING_FRAME_THRESHOLD = 30; // frames to confirm sleeping
  
  const { toast } = useToast();

  // Calculate Eye Aspect Ratio using facial landmarks
  const calculateEAR = useCallback((landmarks: number[][]): number => {
    // Eye landmark indices (based on dlib 68-point model)
    const leftEye = [36, 37, 38, 39, 40, 41];
    const rightEye = [42, 43, 44, 45, 46, 47];
    
    const calculateSingleEAR = (eyePoints: number[]) => {
      // Vertical distances
      const A = Math.sqrt(
        Math.pow(landmarks[eyePoints[1]][0] - landmarks[eyePoints[5]][0], 2) +
        Math.pow(landmarks[eyePoints[1]][1] - landmarks[eyePoints[5]][1], 2)
      );
      const B = Math.sqrt(
        Math.pow(landmarks[eyePoints[2]][0] - landmarks[eyePoints[4]][0], 2) +
        Math.pow(landmarks[eyePoints[2]][1] - landmarks[eyePoints[4]][1], 2)
      );
      
      // Horizontal distance
      const C = Math.sqrt(
        Math.pow(landmarks[eyePoints[0]][0] - landmarks[eyePoints[3]][0], 2) +
        Math.pow(landmarks[eyePoints[0]][1] - landmarks[eyePoints[3]][1], 2)
      );
      
      return (A + B) / (2.0 * C);
    };
    
    const leftEAR = calculateSingleEAR(leftEye);
    const rightEAR = calculateSingleEAR(rightEye);
    
    return (leftEAR + rightEAR) / 2.0;
  }, []);

  // Simulate facial landmark detection (in production, use OpenCV.js with face detection)
  const detectFacialLandmarks = useCallback((): number[][] => {
    // Simulate 68 facial landmarks
    // In a real implementation, this would use OpenCV.js face detection
    const landmarks: number[][] = [];
    for (let i = 0; i < 68; i++) {
      landmarks.push([
        Math.random() * 320 + 160, // x coordinate
        Math.random() * 240 + 120  // y coordinate
      ]);
    }
    return landmarks;
  }, []);

  // Play alarm sound for sleeping detection
  const playAlarmSound = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const context = audioContextRef.current;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    
    oscillator.frequency.setValueAtTime(800, context.currentTime); // 800 Hz tone
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0, context.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, context.currentTime + 0.5);
    
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.5);
  }, []);

  // Analyze drowsiness state
  const analyzeDrowsinessState = useCallback((ear: number): DetectionResult => {
    let newDrowsyCount = drowsyFrameCount;
    let newSleepingCount = sleepingFrameCount;
    let state: DrowsinessState = 'awake';
    let confidence = 0.9;
    
    if (ear < EAR_THRESHOLD_SLEEPING) {
      newSleepingCount++;
      newDrowsyCount = 0;
      
      if (newSleepingCount >= SLEEPING_FRAME_THRESHOLD) {
        state = 'sleeping';
        confidence = 0.95;
      } else {
        state = 'drowsy';
        confidence = 0.8;
      }
    } else if (ear < EAR_THRESHOLD_DROWSY) {
      newDrowsyCount++;
      newSleepingCount = 0;
      
      if (newDrowsyCount >= DROWSY_FRAME_THRESHOLD) {
        state = 'drowsy';
        confidence = 0.85;
      } else {
        state = 'awake';
        confidence = 0.7;
      }
    } else {
      newDrowsyCount = 0;
      newSleepingCount = 0;
      state = 'awake';
      confidence = 0.9;
    }
    
    setDrowsyFrameCount(newDrowsyCount);
    setSleepingFrameCount(newSleepingCount);
    
    return { state, ear, confidence };
  }, [drowsyFrameCount, sleepingFrameCount]);

  // Process video frame
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
    
    // Calculate EAR
    const ear = calculateEAR(landmarks);
    setEyeAspectRatio(ear);
    
    // Analyze drowsiness state
    const result = analyzeDrowsinessState(ear);
    
    // Update state if changed
    if (result.state !== currentState) {
      setCurrentState(result.state);
      
      // Play alarm for sleeping state
      if (result.state === 'sleeping') {
        playAlarmSound();
        
        toast({
          title: '🚨 SLEEPING DETECTED!',
          description: 'Wake up! Pull over safely and take a break!',
          variant: 'destructive',
        });
      } else if (result.state === 'drowsy') {
        toast({
          title: '⚠️ Drowsiness Detected',
          description: 'You appear drowsy. Consider taking a break.',
          variant: 'destructive',
        });
      }
      
      // Record drowsiness event
      if (result.state !== 'awake') {
        vehicleService.recordDrowsinessEvent({
          vehicle_id: vehicleId,
          drowsiness_level: result.state === 'sleeping' ? 'severe' : 'moderate',
          confidence: result.confidence,
          eye_aspect_ratio: ear,
          mouth_aspect_ratio: 0.5,
          alert_triggered: result.state === 'sleeping'
        }).catch(console.error);
      }
      
      onDetection?.(result.state, ear);
    }
  }, [isDetecting, vehicleId, calculateEAR, analyzeDrowsinessState, currentState, playAlarmSound, onDetection, toast]);

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
      case 'awake': return 'bg-green-500';
      case 'drowsy': return 'bg-yellow-500';
      case 'sleeping': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStateText = (state: DrowsinessState) => {
    switch (state) {
      case 'awake': return 'AWAKE';
      case 'drowsy': return 'DROWSY';
      case 'sleeping': return 'SLEEPING';
      default: return 'UNKNOWN';
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Facial Landmark Drowsiness Detection
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
              <span className="text-sm font-medium">Detection State:</span>
              <Badge className={`${getStateColor(currentState)} text-white`}>
                {getStateText(currentState)}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Eye Aspect Ratio:</span>
              <span className="text-sm font-mono">{eyeAspectRatio.toFixed(3)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Drowsy Frames:</span>
              <span className="text-sm">{drowsyFrameCount}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Sleeping Frames:</span>
              <span className="text-sm">{sleepingFrameCount}</span>
            </div>
            
            {currentState !== 'awake' && (
              <div className="flex items-center gap-2 p-2 bg-red-50 rounded border border-red-200">
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  {currentState === 'sleeping' && <Volume2 className="h-4 w-4 text-red-600" />}
                </div>
                <span className="text-sm text-red-800">
                  {currentState === 'sleeping' 
                    ? 'WAKE UP! Pull over immediately!' 
                    : 'Stay alert while driving'
                  }
                </span>
              </div>
            )}
          </div>
        )}
        
        {/* Detection info */}
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Three States:</strong></p>
          <p>• <span className="text-green-600">Awake</span>: EAR &gt; 0.25</p>
          <p>• <span className="text-yellow-600">Drowsy</span>: EAR 0.20-0.25 for 15+ frames</p>
          <p>• <span className="text-red-600">Sleeping</span>: EAR &lt; 0.20 for 30+ frames (with alarm)</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default FacialLandmarkDetector;
