
import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  const faceMeshRef = useRef<any>(null);
  const frameCountRef = useRef(0);
  const closedFramesRef = useRef(0);
  const drowsyFramesRef = useRef(0);
  const animationFrameRef = useRef<number>();
  
  const [isDetecting, setIsDetecting] = useState(false);
  const [currentState, setCurrentState] = useState<DrowsinessState>('awake');
  const [eyeAspectRatio, setEyeAspectRatio] = useState(0);
  const [hasCamera, setHasCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();

  // Enhanced eye landmark indices for MediaPipe Face Mesh (468 landmarks)
  const LEFT_EYE_POINTS = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  const RIGHT_EYE_POINTS = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
  
  // More precise eye corner and eyelid points
  const LEFT_EYE_CORNERS = [33, 133]; // inner, outer corner
  const LEFT_EYE_VERTICAL = [159, 145]; // top, bottom eyelid center
  const RIGHT_EYE_CORNERS = [362, 263]; // inner, outer corner  
  const RIGHT_EYE_VERTICAL = [386, 374]; // top, bottom eyelid center

  // Calculate Enhanced Eye Aspect Ratio with multiple measurements
  const calculateEAR = useCallback((landmarks: any[]) => {
    try {
      // Get landmark points
      const getPoint = (idx: number) => landmarks[idx];
      
      // Left eye EAR calculation with multiple vertical measurements
      const leftP1 = getPoint(LEFT_EYE_CORNERS[0]); // inner corner
      const leftP2 = getPoint(LEFT_EYE_CORNERS[1]); // outer corner
      const leftP3 = getPoint(159); // top eyelid
      const leftP4 = getPoint(145); // bottom eyelid
      const leftP5 = getPoint(158); // top eyelid inner
      const leftP6 = getPoint(153); // bottom eyelid inner
      
      // Right eye EAR calculation with multiple vertical measurements
      const rightP1 = getPoint(RIGHT_EYE_CORNERS[0]); // inner corner
      const rightP2 = getPoint(RIGHT_EYE_CORNERS[1]); // outer corner
      const rightP3 = getPoint(386); // top eyelid
      const rightP4 = getPoint(374); // bottom eyelid
      const rightP5 = getPoint(387); // top eyelid inner
      const rightP6 = getPoint(373); // bottom eyelid inner
      
      // Calculate distances
      const distance = (p1: any, p2: any) => 
        Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
      
      // Left eye measurements
      const leftVertical1 = distance(leftP3, leftP4);
      const leftVertical2 = distance(leftP5, leftP6);
      const leftHorizontal = distance(leftP1, leftP2);
      const leftEAR = (leftVertical1 + leftVertical2) / (2.0 * leftHorizontal);
      
      // Right eye measurements
      const rightVertical1 = distance(rightP3, rightP4);
      const rightVertical2 = distance(rightP5, rightP6);
      const rightHorizontal = distance(rightP1, rightP2);
      const rightEAR = (rightVertical1 + rightVertical2) / (2.0 * rightHorizontal);
      
      // Return average EAR with higher sensitivity for closed eyes
      const avgEAR = (leftEAR + rightEAR) / 2;
      console.log(`EAR: ${avgEAR.toFixed(3)} (L: ${leftEAR.toFixed(3)}, R: ${rightEAR.toFixed(3)})`);
      
      return avgEAR;
    } catch (error) {
      console.error('EAR calculation error:', error);
      return 0.25; // Default to "awake" state on error
    }
  }, []);

  // Enhanced audio alert system
  const playAlert = useCallback((type: 'drowsy' | 'sleeping') => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (type === 'drowsy') {
        // Triple beep pattern for drowsy
        [0, 0.2, 0.4].forEach((delay, index) => {
          setTimeout(() => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.1);
          }, delay * 1000);
        });
      } else {
        // Continuous alarm for sleeping
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 1.5);
      }
    } catch (error) {
      console.error('Audio alert failed:', error);
    }
  }, []);

  // Enhanced detection logic with improved thresholds
  const processDetection = useCallback((ear: number) => {
    frameCountRef.current++;
    setEyeAspectRatio(ear);
    
    let newState: DrowsinessState = 'awake';
    
    // Enhanced thresholds for better detection
    if (ear < 0.15) {
      // Eyes definitely closed - more sensitive threshold
      closedFramesRef.current++;
      drowsyFramesRef.current = 0;
      
      // Faster detection: 1.5 seconds at ~15fps = 22 frames
      if (closedFramesRef.current >= 22) {
        newState = 'sleeping';
      }
    } else if (ear < 0.20) {
      // Eyes partially closed (drowsy) - more sensitive
      drowsyFramesRef.current++;
      closedFramesRef.current = 0;
      
      // 2 seconds at ~15fps = 30 frames
      if (drowsyFramesRef.current >= 30) {
        newState = 'drowsy';
      }
    } else {
      // Eyes clearly open
      closedFramesRef.current = 0;
      drowsyFramesRef.current = 0;
      newState = 'awake';
    }
    
    // State change detection and alerts
    if (newState !== currentState) {
      console.log(`State changed: ${currentState} -> ${newState} (EAR: ${ear.toFixed(3)})`);
      setCurrentState(newState);
      
      if (newState === 'sleeping') {
        playAlert('sleeping');
        toast({
          title: '🚨 SLEEPING DETECTED',
          description: 'Wake up! Pull over safely immediately!',
          variant: 'destructive',
        });
        
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

  // Load MediaPipe dynamically
  const loadMediaPipe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load MediaPipe scripts dynamically
      const loadScript = (src: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
          }
          
          const script = document.createElement('script');
          script.src = src;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`Failed to load ${src}`));
          document.head.appendChild(script);
        });
      };

      // Load MediaPipe dependencies
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');

      // Wait a bit for scripts to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Initialize Face Mesh
      if (typeof (window as any).FaceMesh !== 'undefined') {
        const faceMesh = new (window as any).FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5
        });

        faceMesh.onResults((results: any) => {
          const hasFace = results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0;
          setFaceDetected(hasFace);
          
          if (hasFace && isDetecting) {
            const landmarks = results.multiFaceLandmarks[0];
            const ear = calculateEAR(landmarks);
            processDetection(ear);
            
            // Draw landmarks on canvas
            drawLandmarks(landmarks);
          }
        });

        faceMeshRef.current = faceMesh;
        console.log('MediaPipe Face Mesh initialized successfully');
      } else {
        throw new Error('MediaPipe Face Mesh not available');
      }
    } catch (error) {
      console.error('MediaPipe loading error:', error);
      setError('Failed to load face detection. Please refresh and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [calculateEAR, processDetection, isDetecting]);

  // Draw eye landmarks on canvas
  const drawLandmarks = useCallback((landmarks: any[]) => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw left eye landmarks (green)
    ctx.fillStyle = '#00ff00';
    LEFT_EYE_POINTS.forEach(idx => {
      const point = landmarks[idx];
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw right eye landmarks (blue)
    ctx.fillStyle = '#0000ff';
    RIGHT_EYE_POINTS.forEach(idx => {
      const point = landmarks[idx];
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  }, []);

  // Start camera with enhanced settings
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 15, max: 30 }
        } 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setHasCamera(true);
        
        // Load MediaPipe after camera is ready
        await loadMediaPipe();
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Could not access camera. Please check permissions.');
      setHasCamera(false);
    }
  }, [loadMediaPipe]);

  // Stop camera and cleanup
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    
    setHasCamera(false);
    setIsDetecting(false);
    setFaceDetected(false);
    faceMeshRef.current = null;
  }, []);

  // Process video frames
  const processFrame = useCallback(async () => {
    if (!isDetecting || !videoRef.current || !faceMeshRef.current || !hasCamera) {
      return;
    }
    
    try {
      await faceMeshRef.current.send({ image: videoRef.current });
    } catch (error) {
      console.error('Frame processing error:', error);
    }
    
    if (isDetecting) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }
  }, [isDetecting, hasCamera]);

  // Start/stop detection
  useEffect(() => {
    if (isActive && hasCamera && faceMeshRef.current && !isDetecting) {
      setIsDetecting(true);
      console.log('Starting detection...');
      processFrame();
    } else if (!isActive && isDetecting) {
      setIsDetecting(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    }
  }, [isActive, hasCamera, isDetecting, processFrame]);

  // Cleanup on unmount
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
          Enhanced Eye Detection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Video feed with overlay */}
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
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            width={320}
            height={240}
          />
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
              <div className="text-white text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                <p className="text-sm">Loading face detection...</p>
              </div>
            </div>
          )}
          
          {/* Error display */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
              <div className="text-center p-4">
                <CameraOff className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600">{error}</p>
              </div>
            </div>
          )}
          
          {/* Status indicators */}
          {hasCamera && (
            <div className="absolute top-2 right-2 flex gap-2">
              <div className={`w-3 h-3 rounded-full ${faceDetected ? 'bg-green-500' : 'bg-red-500'}`} />
              {isDetecting && (
                <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
              )}
            </div>
          )}
        </div>
        
        {/* Controls */}
        <div className="flex gap-2">
          {!hasCamera ? (
            <Button onClick={startCamera} className="flex-1" disabled={isLoading}>
              <Camera className="mr-2 h-4 w-4" />
              {isLoading ? 'Loading...' : 'Start Camera'}
            </Button>
          ) : (
            <Button onClick={stopCamera} variant="outline" className="flex-1">
              <CameraOff className="mr-2 h-4 w-4" />
              Stop Camera
            </Button>
          )}
        </div>
        
        {/* Status display */}
        {hasCamera && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">State:</span>
              <Badge className={getStateColor(currentState)}>
                {currentState.toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Face:</span>
              <span className={`text-sm ${faceDetected ? 'text-green-600' : 'text-red-600'}`}>
                {faceDetected ? 'Detected' : 'Not Found'}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Eye Ratio:</span>
              <span className="text-sm font-mono">{eyeAspectRatio.toFixed(4)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Detection:</span>
              <span className={`text-sm ${isDetecting ? 'text-green-600' : 'text-gray-600'}`}>
                {isDetecting ? 'Active' : 'Inactive'}
              </span>
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
