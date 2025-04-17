
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isAuthenticated } from '@/services/authService';
import AppLayout from '@/components/layout/AppLayout';
import MapView from '@/components/map/MapView';

const MapPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [title, setTitle] = useState('Live Map');

  // Check if user is authenticated
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/auth');
    }

    // Check if a specific vehicle is being tracked
    const vehicleId = searchParams.get('vehicle');
    if (vehicleId) {
      setTitle('Tracking Vehicle');
    }
  }, [navigate, searchParams]);

  return (
    <AppLayout title={title}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Live Map</h1>
        <MapView />
      </div>
    </AppLayout>
  );
};

export default MapPage;
