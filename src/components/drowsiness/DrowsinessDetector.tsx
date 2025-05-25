
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { vehicleService } from '@/services/supabaseVehicleService';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Eye, Camera, CameraOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DrowsinessDetectorProps {
  vehicleId: string;
  isActive: boolean;
  onDetection?: (level: string, confidence: number) => void;
}

type DrowsinessLevel = 'alert' | 'mild' | 'moderate' | 'severe';

const DrowsinessDetector: React.FC<DrowsinessDetectorProps> = ({
  vehicleId,
  isActive,
  onDetection
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  
  const [isDetecting, setIsDetecting] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<DrowsinessLevel>('alert');
  const [confidence, setConfidence] = useState(0);
  const [eyeAspectRatio, setEyeAspectRatio] = useState(0);
  const [hasCamera, setHasCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Simple drowsiness detection based on eye aspect ratio
  const calculateEyeAspectRatio = useCallback((eyePoints: number[][]): number => {
    // Simplified EAR calculation
    // In a real implementation, you'd use more sophisticated computer vision
    const verticalDist1 = Math.abs(eyePoints[1][1] - eyePoints[5][1]);
    const verticalDist2 = Math.abs(eyePoints[2][1] - eyePoints[4][1]);
    const horizontalDist = Math.abs(eyePoints[0][0] - eyePoints[3][0]);
    
    return (verticalDist1 + verticalDist2) / (2.0 * horizontalDist);
  }, []);

  const analyzeDrowsiness = useCallback((ear: number): { level: DrowsinessLevel; confidence: number } => {
    // Thresholds for drowsiness detection
    if (ear > 0.25) {
      return { level: 'alert', confidence: 0.9 };
    } else if (ear > 0.22) {
      return { level: 'mild', confidence: 0.7 };
    } else if (ear > 0.18) {
      return { level: 'moderate', confidence: 0.8 };
    } else {
      return { level: 'severe', confidence: 0.95 };
    }
  }, []);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isDetecting) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    // Draw current frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Simulate eye detection (in reality, you'd use a face detection library)
    // For demo purposes, we'll simulate varying eye aspect ratios
    const simulatedEAR = 0.2 + Math.random() * 0.1 + Math.sin(Date.now() / 1000) * 0.05;
    
    setEyeAspectRatio(simulatedEAR);
    
    const { level, confidence: detectedConfidence } = analyzeDrowsiness(simulatedEAR);
    setCurrentLevel(level);
    setConfidence(detectedConfidence);
    
    // Record drowsiness event if not alert
    if (level !== 'alert') {
      vehicleService.recordDrowsinessEvent({
        vehicle_id: vehicleId,
        drowsiness_level: level,
        confidence: detectedConfidence,
        eye_aspect_ratio: simulatedEAR,
        mouth_aspect_ratio: 0.5,
        alert_triggered: level === 'severe'
      }).catch(console.error);
      
      // Trigger alert for severe drowsiness
      if (level === 'severe') {
        toast({
          title: '⚠️ SEVERE DROWSINESS DETECTED',
          description: 'Please pull over safely and take a break!',
          variant: 'destructive',
        });
      }
      
      onDetection?.(level, detectedConfidence);
    }
  }, [isDetecting, vehicleId, analyzeDrowsiness, onDetection, toast]);

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

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setHasCamera(false);
    setIsDetecting(false);
  }, []);

  const startDetection = useCallback(() => {
    if (!hasCamera) return;
    
    setIsDetecting(true);
    intervalRef.current = window.setInterval(processFrame, 100); // 10 FPS
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
    };
  }, [stopCamera]);

  const getDrowsinessColor = (level: DrowsinessLevel) => {
    switch (level) {
      case 'alert': return 'bg-green-500';
      case 'mild': return 'bg-yellow-500';
      case 'moderate': return 'bg-orange-500';
      case 'severe': return 'bg-red-500';
      default: return 'bg-gray-500';
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
            className="absolute top-0 left-0 w-full h-full opacity-50"
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
              <Badge className={getDrowsinessColor(currentLevel)}>
                {currentLevel.toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Confidence:</span>
              <span className="text-sm">{(confidence * 100).toFixed(1)}%</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Eye Ratio:</span>
              <span className="text-sm">{eyeAspectRatio.toFixed(3)}</span>
            </div>
            
            {currentLevel !== 'alert' && (
              <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  {currentLevel === 'severe' ? 'Take a break immediately!' : 'Stay alert while driving'}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DrowsinessDetector;
