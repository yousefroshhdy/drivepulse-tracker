import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated } from '@/services/authService';
import AppLayout from '@/components/layout/AppLayout';
import DrowsinessDetector from '@/components/drowsiness/DrowsinessDetector';
import MobileGPSTracker from '@/components/tracking/MobileGPSTracker';
import { vehicleService } from '@/services/supabaseVehicleService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, Smartphone, Activity, AlertTriangle } from 'lucide-react';
import FacialLandmarkDetector from '@/components/drowsiness/FacialLandmarkDetector';
import YoloFacialDetector from '@/components/drowsiness/YoloFacialDetector';

const DriversMonitor = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/auth');
      return;
    }

    loadVehicles();
  }, [navigate]);

  const loadVehicles = async () => {
    try {
      const vehicleList = await vehicleService.getVehicles();
      setVehicles(vehicleList);
      
      if (vehicleList.length > 0 && !selectedVehicleId) {
        setSelectedVehicleId(vehicleList[0].id);
      }
    } catch (error) {
      console.error('Failed to load vehicles:', error);
    }
  };

  const handleDrowsinessDetection = (state: string, ear: number) => {
    const alert = {
      id: Date.now(),
      type: 'drowsiness',
      state,
      ear,
      timestamp: new Date(),
      vehicleId: selectedVehicleId
    };
    
    setRecentAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep last 10 alerts
  };

  const handlePositionUpdate = (position: { lat: number; lng: number; speed?: number }) => {
    console.log('Position updated:', position);
    // You could update a map or send this to other components
  };

  return (
    <AppLayout title="Driver Monitoring">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Driver Monitoring System</h1>
        </div>
        
        <Tabs defaultValue="drowsiness" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="drowsiness" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Drowsiness Detection
            </TabsTrigger>
            <TabsTrigger value="gps" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Mobile GPS
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Alerts
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="drowsiness" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <YoloFacialDetector
                vehicleId={selectedVehicleId}
                isActive={true}
                onDetection={handleDrowsinessDetection}
              />
              
              <Card>
                <CardHeader>
                  <CardTitle>Enhanced Detection Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm space-y-2">
                    <p className="font-medium">Enhanced Face Detection:</p>
                    <ul className="text-gray-600 space-y-1">
                      <li>• Advanced face detection algorithm</li>
                      <li>• Real-time eye landmark tracking</li>
                      <li>• Improved Eye Aspect Ratio (EAR) calculation</li>
                      <li>• Enhanced audio alerts with different patterns</li>
                      <li>• More sensitive drowsiness detection</li>
                      <li>• Automatic event logging to database</li>
                    </ul>
                  </div>
                  
                  <div className="text-sm space-y-2">
                    <p className="font-medium">Enhanced Algorithm:</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded"></div>
                        <span>Awake: EAR &gt; 0.22 (Normal state)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                        <span>Drowsy: EAR 0.18-0.22 for 3+ frames</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded"></div>
                        <span>Sleeping: EAR &lt; 0.18 for 3+ frames</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-sm space-y-2">
                    <p className="font-medium">Audio Alerts:</p>
                    <ul className="text-gray-600 space-y-1">
                      <li>• Drowsy: Triple beep pattern (500Hz)</li>
                      <li>• Sleeping: Continuous alarm (1000Hz)</li>
                      <li>• Cross-platform Web Audio API</li>
                      <li>• Works on mobile devices</li>
                    </ul>
                  </div>
                  
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Enhanced:</strong> This version uses more sophisticated face detection 
                      with improved eye tracking for better accuracy in detecting drowsiness states.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="gps" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <MobileGPSTracker onPositionUpdate={handlePositionUpdate} />
              
              <Card>
                <CardHeader>
                  <CardTitle>GPS Tracking Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm space-y-2">
                    <p className="font-medium">Mobile GPS Features:</p>
                    <ul className="text-gray-600 space-y-1">
                      <li>• Real-time location tracking</li>
                      <li>• Speed monitoring</li>
                      <li>• Route recording</li>
                      <li>• Position accuracy display</li>
                    </ul>
                  </div>
                  
                  <div className="text-sm space-y-2">
                    <p className="font-medium">Setup Instructions:</p>
                    <ol className="text-gray-600 space-y-1 list-decimal list-inside">
                      <li>Allow location permissions</li>
                      <li>Create or select a vehicle</li>
                      <li>Start GPS tracking</li>
                      <li>View real-time position on map</li>
                    </ol>
                  </div>
                  
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Tip:</strong> For best accuracy, ensure GPS is enabled and you have a clear view of the sky.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="alerts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Detection Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                {recentAlerts.length > 0 ? (
                  <div className="space-y-3">
                    {recentAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <AlertTriangle className={`h-5 w-5 ${
                            alert.state === 'sleeping' ? 'text-red-500' :
                            alert.state === 'drowsy' ? 'text-yellow-500' :
                            'text-green-500'
                          }`} />
                          <div>
                            <p className="font-medium capitalize">{alert.state || alert.level} Detection</p>
                            <p className="text-sm text-gray-600">
                              {alert.ear ? `EAR: ${alert.ear.toFixed(3)}` : 
                               alert.confidence ? `Confidence: ${(alert.confidence * 100).toFixed(1)}%` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-gray-500">
                          {alert.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No alerts yet</p>
                    <p className="text-sm">Start monitoring to see drowsiness alerts here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default DriversMonitor;
