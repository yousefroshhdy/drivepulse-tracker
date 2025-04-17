
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Vehicle } from '@/services/mockData';
import { getVehicles, subscribeToVehicleUpdates } from '@/services/vehicleService';
import { useTheme } from '@/contexts/ThemeContext';

// For demo purposes we're using a public token
// In a production app, this would come from environment variables
mapboxgl.accessToken = 'pk.eyJ1IjoibG92YWJsZS1kZXYiLCJhIjoiY2x0ZHpmZzFwMDFtMDJrcWZ1YmJ0cjR1ZCJ9.agiJxd4Lr04pUSxr3jouMg';

const MapView = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<{ [key: string]: mapboxgl.Marker }>({});
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    // Fetch vehicles
    const fetchVehicles = async () => {
      try {
        const data = await getVehicles();
        setVehicles(data);
      } catch (error) {
        console.error('Failed to fetch vehicles:', error);
      }
    };

    fetchVehicles();

    // Initialize map with correct style based on theme
    if (!mapContainer.current) return;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: theme === 'dark' 
        ? 'mapbox://styles/mapbox/dark-v11' 
        : 'mapbox://styles/mapbox/light-v11',
      center: [-122.431297, 37.773972], // San Francisco
      zoom: 12
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Setup map events
    map.current.on('load', () => {
      // This would normally load any custom map layers
    });

    // Subscribe to vehicle updates
    const unsubscribe = subscribeToVehicleUpdates((updatedVehicle) => {
      setVehicles((prevVehicles) =>
        prevVehicles.map((vehicle) =>
          vehicle.id === updatedVehicle.id ? updatedVehicle : vehicle
        )
      );
    });

    return () => {
      if (map.current) {
        map.current.remove();
      }
      unsubscribe();
    };
  }, [theme]);

  // Update markers when vehicles change
  useEffect(() => {
    if (!map.current) return;

    vehicles.forEach((vehicle) => {
      if (!vehicle.lastPosition) return;

      const { lat, lng } = vehicle.lastPosition;
      
      // Create or update marker
      if (markers.current[vehicle.id]) {
        markers.current[vehicle.id].setLngLat([lng, lat]);
      } else {
        // Create marker element
        const el = document.createElement('div');
        el.className = 'vehicle-marker';
        el.innerHTML = `
          <div class="h-12 w-12 flex items-center justify-center">
            <div class="h-8 w-8 rounded-full bg-white shadow-md flex items-center justify-center
                ${vehicle.status === 'driving' ? 'ring-2 ring-green-500' : 
                  vehicle.status === 'parked' ? 'ring-2 ring-blue-500' : 'ring-2 ring-gray-400'}">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" 
                stroke="${vehicle.status === 'driving' ? '#10B981' : 
                        vehicle.status === 'parked' ? '#3B82F6' : '#9CA3AF'}" 
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C1.4 11.3 1 12.1 1 13v3c0 .6.4 1 1 1h2"></path>
                <circle cx="7" cy="17" r="2"></circle>
                <path d="M9 17h6"></path>
                <circle cx="17" cy="17" r="2"></circle>
              </svg>
            </div>
          </div>
        `;
        
        // Create and add marker to map
        markers.current[vehicle.id] = new mapboxgl.Marker({
          element: el,
          anchor: 'bottom',
        })
          .setLngLat([lng, lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<div class="p-2">
              <div class="font-bold">${vehicle.name}</div>
              <div class="text-sm">${vehicle.make} ${vehicle.model}</div>
              <div class="text-sm">${vehicle.status.charAt(0).toUpperCase() + vehicle.status.slice(1)}</div>
              ${vehicle.status === 'driving' && vehicle.lastPosition.speed ? 
                `<div class="text-sm">Speed: ${Math.round(vehicle.lastPosition.speed)} mph</div>` : ''}
            </div>`
          ))
          .addTo(map.current);
          
        // Add click event
        el.addEventListener('click', () => {
          setSelectedVehicle(vehicle);
        });
      }
    });

    // Remove markers for vehicles that no longer exist
    Object.keys(markers.current).forEach((id) => {
      if (!vehicles.find((v) => v.id === id)) {
        markers.current[id].remove();
        delete markers.current[id];
      }
    });

    // Fit bounds to include all markers if we have any
    if (Object.keys(markers.current).length > 0 && map.current) {
      const bounds = new mapboxgl.LngLatBounds();
      vehicles.forEach((vehicle) => {
        if (vehicle.lastPosition) {
          bounds.extend([vehicle.lastPosition.lng, vehicle.lastPosition.lat]);
        }
      });
      
      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 15
      });
    }
  }, [vehicles]);

  // Update map style when theme changes
  useEffect(() => {
    if (map.current) {
      map.current.setStyle(
        theme === 'dark' 
          ? 'mapbox://styles/mapbox/dark-v11' 
          : 'mapbox://styles/mapbox/light-v11'
      );
    }
  }, [theme]);
  
  return (
    <div className="relative h-[calc(100vh-14rem)]">
      <style>
        {`
        .vehicle-marker {
          cursor: pointer;
          transition: transform 0.3s;
        }
        .vehicle-marker:hover {
          transform: scale(1.1);
        }
        .mapboxgl-popup {
          z-index: 10;
        }
        .mapboxgl-popup-content {
          ${theme === 'dark' ? 'background-color: #1A1F2C; color: white;' : ''}
        }
        .mapboxgl-ctrl-group {
          ${theme === 'dark' ? 'background-color: #1A1F2C;' : ''}
        }
        .mapboxgl-ctrl button {
          ${theme === 'dark' ? 'filter: invert(1);' : ''}
        }
        `}
      </style>
      
      <div ref={mapContainer} className="absolute inset-0 rounded-lg shadow-sm" />
      
      {/* Vehicle info panel when selected */}
      {selectedVehicle && (
        <div className={`absolute bottom-4 left-4 right-4 ${theme === 'dark' ? 'bg-drivepulse-dark text-white' : 'bg-white'} rounded-lg shadow-lg p-4 max-w-md mx-auto`}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-lg">{selectedVehicle.name}</h3>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>
                {selectedVehicle.make} {selectedVehicle.model} • {selectedVehicle.year}
              </p>
            </div>
            <button
              onClick={() => setSelectedVehicle(null)}
              className={`p-1 rounded-full ${theme === 'dark' ? 'bg-sidebar-accent hover:bg-sidebar-accent-foreground' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className={`p-2 ${theme === 'dark' ? 'bg-sidebar-accent' : 'bg-gray-50'} rounded`}>
              <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}>Status:</span>
              <span className={`ml-1 font-medium 
                ${selectedVehicle.status === 'driving' ? 'text-green-500' : 
                selectedVehicle.status === 'parked' ? 'text-blue-500' : 'text-gray-400'}`}>
                {selectedVehicle.status.charAt(0).toUpperCase() + selectedVehicle.status.slice(1)}
              </span>
            </div>
            
            <div className={`p-2 ${theme === 'dark' ? 'bg-sidebar-accent' : 'bg-gray-50'} rounded`}>
              <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}>License:</span>
              <span className="ml-1 font-medium">{selectedVehicle.licensePlate}</span>
            </div>
            
            {selectedVehicle.status === 'driving' && selectedVehicle.lastPosition?.speed && (
              <div className={`p-2 ${theme === 'dark' ? 'bg-sidebar-accent' : 'bg-gray-50'} rounded`}>
                <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}>Speed:</span>
                <span className="ml-1 font-medium">
                  {Math.round(selectedVehicle.lastPosition.speed)} mph
                </span>
              </div>
            )}
            
            <div className={`p-2 ${theme === 'dark' ? 'bg-sidebar-accent' : 'bg-gray-50'} rounded`}>
              <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}>Fuel:</span>
              <span className="ml-1 font-medium">
                {selectedVehicle.fuelLevel ? Math.round(selectedVehicle.fuelLevel * 100) : 'N/A'}%
              </span>
            </div>
            
            {selectedVehicle.drivingScore && (
              <div className={`p-2 ${theme === 'dark' ? 'bg-sidebar-accent' : 'bg-gray-50'} rounded col-span-2`}>
                <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}>Driving Score:</span>
                <span className={`ml-1 font-medium 
                  ${selectedVehicle.drivingScore >= 90 ? 'text-green-500' : 
                  selectedVehicle.drivingScore >= 70 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {selectedVehicle.drivingScore}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;
