
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import { vehicleService } from '@/services/supabaseVehicleService';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Eye, Camera, CameraOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MediaPipeDrowsinessDetectorProps {
  vehicleId: string;
  isActive: boolean;
  onDetection?: (state: string, ear: number) => void;
}

type DrowsinessState = 'awake' | 'drowsy' | 'sleeping';

const MediaPipeDrowsinessDetector: React.FC<MediaPipeDrowsinessDetectorProps> = ({
  vehicleId,
  isActive,
  onDetection
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const frameCountRef = useRef(0);
  const closedFramesRef = useRef(0);
  const drowsyFramesRef = useRef(0);
  
  const [isDetecting, setIsDetecting] = useState(false);
  const [currentState, setCurrentState] = useState<DrowsinessState>('awake');
  const [eyeAspectRatio, setEyeAspectRatio] = useState(0);
  const [hasCamera, setHasCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  
  const { toast } = useToast();

  // Eye landmark indices for MediaPipe Face Mesh
  const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

  // Calculate Eye Aspect Ratio using MediaPipe landmarks
  const calculateEAR = useCallback((landmarks: any[]) => {
    const getPoint = (idx: number) => landmarks[idx];
    
    // Calculate EAR for left eye
    const leftEyePoints = LEFT_EYE.map(idx => getPoint(idx));
    const leftEAR = calculateSingleEyeEAR(leftEyePoints);
    
    // Calculate EAR for right eye
    const rightEyePoints = RIGHT_EYE.map(idx => getPoint(idx));
    const rightEAR = calculateSingleEyeEAR(rightEyePoints);
    
    // Return average EAR
    return (leftEAR + rightEAR) / 2;
  }, []);

  const calculateSingleEyeEAR = (eyePoints: any[]) => {
    // Get key points for EAR calculation
    const p1 = eyePoints[1]; // Top eyelid
    const p2 = eyePoints[5]; // Bottom eyelid
    const p3 = eyePoints[2]; // Top eyelid
    const p4 = eyePoints[4]; // Bottom eyelid
    const p5 = eyePoints[0]; // Left corner
    const p6 = eyePoints[3]; // Right corner
    
    // Calculate distances
    const vertical1 = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    const vertical2 = Math.sqrt(Math.pow(p3.x - p4.x, 2) + Math.pow(p3.y - p4.y, 2));
    const horizontal = Math.sqrt(Math.pow(p5.x - p6.x, 2) + Math.pow(p5.y - p6.y, 2));
    
    // Calculate EAR
    return (vertical1 + vertical2) / (2.0 * horizontal);
  };

  // Play audio alert
  const playAlert = useCallback((type: 'drowsy' | 'sleeping') => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      if (type === 'drowsy') {
        // Triple beep for drowsy
        oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
        
        setTimeout(() => {
          const osc2 = audioContext.createOscillator();
          const gain2 = audioContext.createGain();
          osc2.connect(gain2);
          gain2.connect(audioContext.destination);
          osc2.frequency.setValueAtTime(500, audioContext.currentTime);
          gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
          osc2.start();
          osc2.stop(audioContext.currentTime + 0.1);
        }, 200);
        
        setTimeout(() => {
          const osc3 = audioContext.createOscillator();
          const gain3 = audioContext.createGain();
          osc3.connect(gain3);
          gain3.connect(audioContext.destination);
          osc3.frequency.setValueAtTime(500, audioContext.currentTime);
          gain3.gain.setValueAtTime(0.3, audioContext.currentTime);
          osc3.start();
          osc3.stop(audioContext.currentTime + 0.1);
        }, 400);
      } else {
        // Continuous alarm for sleeping
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 1);
      }
    } catch (error) {
      console.error('Audio alert failed:', error);
    }
  }, []);

  // Process detection results
  const processDetection = useCallback((ear: number) => {
    frameCountRef.current++;
    setEyeAspectRatio(ear);
    
    let newState: DrowsinessState = 'awake';
    
    // Determine state based on EAR thresholds
    if (ear < 0.18) {
      // Eyes likely closed
      closedFramesRef.current++;
      drowsyFramesRef.current = 0;
      
      // After 2 seconds at 10fps = 20 frames
      if (closedFramesRef.current >= 20) {
        newState = 'sleeping';
      }
    } else if (ear < 0.22) {
      // Eyes partially closed (drowsy)
      drowsyFramesRef.current++;
      closedFramesRef.current = 0;
      
      // After 2 seconds at 10fps = 20 frames
      if (drowsyFramesRef.current >= 20) {
        newState = 'drowsy';
      }
    } else {
      // Eyes open
      closedFramesRef.current = 0;
      drowsyFramesRef.current = 0;
      newState = 'awake';
    }
    
    // Update state and trigger alerts
    if (newState !== currentState) {
      setCurrentState(newState);
      
      if (newState === 'sleeping') {
        playAlert('sleeping');
        toast({
          title: '🚨 SLEEPING DETECTED',
          description: 'Wake up! Pull over safely immediately!',
          variant: 'destructive',
        });
        
        // Record event
        vehicleService.recordDrowsinessEvent({
          vehicle_id: vehicleId,
          drowsiness_level: 'severe',
          confidence: 0.95,
          eye_aspect_ratio: ear,
          mouth_aspect_ratio: 0.5,
          alert_triggered: true
        }).catch(console.error);
        
      } else if (newState === 'drowsy') {
        playAlert('drowsy');
        toast({
          title: '⚠️ DROWSINESS DETECTED',
          description: 'Stay alert! Consider taking a break.',
          variant: 'destructive',
        });
        
        // Record event
        vehicleService.recordDrowsinessEvent({
          vehicle_id: vehicleId,
          drowsiness_level: 'moderate',
          confidence: 0.8,
          eye_aspect_ratio: ear,
          mouth_aspect_ratio: 0.5,
          alert_triggered: false
        }).catch(console.error);
      }
      
      onDetection?.(newState, ear);
    }
  }, [currentState, vehicleId, playAlert, toast, onDetection]);

  // Initialize MediaPipe Face Mesh
  const initializeFaceMesh = useCallback(() => {
    if (faceMeshRef.current) return;
    
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    
    faceMesh.onResults((results) => {
      setFaceDetected(results.multiFaceLandmarks.length > 0);
      
      if (results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        const ear = calculateEAR(landmarks);
        processDetection(ear);
        
        // Draw landmarks on canvas
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw eye landmarks
            ctx.fillStyle = '#00ff00';
            LEFT_EYE.forEach(idx => {
              const point = landmarks[idx];
              ctx.fillRect(point.x * canvas.width - 2, point.y * canvas.height - 2, 4, 4);
            });
            
            ctx.fillStyle = '#0000ff';
            RIGHT_EYE.forEach(idx => {
              const point = landmarks[idx];
              ctx.fillRect(point.x * canvas.width - 2, point.y * canvas.height - 2, 4, 4);
            });
          }
        }
      }
    });
    
    faceMeshRef.current = faceMesh;
  }, [calculateEAR, processDetection]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 640, 
          height: 480,
          facingMode: 'user',
          frameRate: 10 // Optimize for intermediate speed
        } 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setHasCamera(true);
        
        // Initialize MediaPipe
        initializeFaceMesh();
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Could not access camera. Please check permissions.');
      setHasCamera(false);
    }
  }, [initializeFaceMesh]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setHasCamera(false);
    setIsDetecting(false);
    setFaceDetected(false);
  }, []);

  // Start detection
  const startDetection = useCallback(() => {
    if (!hasCamera || !faceMeshRef.current || !videoRef.current) return;
    
    setIsDetecting(true);
    
    const processFrame = async () => {
      if (!isDetecting || !videoRef.current || !faceMeshRef.current) return;
      
      await faceMeshRef.current.send({ image: videoRef.current });
      
      if (isDetecting) {
        setTimeout(processFrame, 100); // 10 FPS for intermediate speed
      }
    };
    
    processFrame();
  }, [hasCamera, isDetecting]);

  // Stop detection
  const stopDetection = useCallback(() => {
    setIsDetecting(false);
    frameCountRef.current = 0;
    closedFramesRef.current = 0;
    drowsyFramesRef.current = 0;
  }, []);

  // Effects
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

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          MediaPipe Eye Detection
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
            className="absolute top-0 left-0 w-full h-full"
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
          
          {/* Face detection indicator */}
          {hasCamera && (
            <div className="absolute top-2 right-2">
              <div className={`w-3 h-3 rounded-full ${faceDetected ? 'bg-green-500' : 'bg-red-500'}`} />
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
              <span className="text-sm font-medium">State:</span>
              <Badge className={getStateColor(currentState)}>
                {currentState.toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Face Detected:</span>
              <span className={`text-sm ${faceDetected ? 'text-green-600' : 'text-red-600'}`}>
                {faceDetected ? 'Yes' : 'No'}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Eye Ratio:</span>
              <span className="text-sm">{eyeAspectRatio.toFixed(3)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Frames:</span>
              <span className="text-sm">{frameCountRef.current}</span>
            </div>
            
            {currentState !== 'awake' && (
              <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  {currentState === 'sleeping' ? 'WAKE UP! Pull over now!' : 'Stay alert while driving'}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MediaPipeDrowsinessDetector;
