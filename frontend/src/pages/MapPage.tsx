import React from 'react';
import { useGovernmentDashboard } from '../hooks/useApi';
import { HeatRiskMap } from '../components/map/HeatRiskMap';
import { MapLegend } from '../components/map/MapLegend';
import { useAppStore } from '../stores/appStore';

export const MapPage: React.FC = () => {
  const { data, isLoading } = useGovernmentDashboard();
  const selectedLocation = useAppStore((state) => state.selectedLocation);

  if (isLoading || !data) return <div className="p-8 text-center text-gray-400">Loading map data...</div>;

  return (
    <div className="h-[calc(100vh-64px)] w-full relative">
      <HeatRiskMap cities={data.cities} center={[selectedLocation.lat, selectedLocation.lon]} zoom={7} />
      <MapLegend />
      <div className="absolute top-4 left-4 z-[400] glass-card p-4">
        <h2 className="text-xl font-bold text-white mb-2">Live Heat Risk Map</h2>
        <p className="text-sm text-gray-400 max-w-xs">Interactive GIS mapping of thermal stress across monitored locations.</p>
      </div>
    </div>
  );
};
