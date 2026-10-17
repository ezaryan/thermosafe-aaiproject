import React from 'react';
import { Search, MapPin } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { DemoScenarioSelector } from '../dashboard/DemoScenarioSelector';

export const Header: React.FC = () => {
  const { selectedLocation, setLocation } = useAppStore();
  const [search, setSearch] = React.useState(selectedLocation.name);
  const [locationStatus, setLocationStatus] = React.useState('');
  const [isLocating, setIsLocating] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);

  React.useEffect(() => {
    setSearch(selectedLocation.name);
  }, [selectedLocation.name]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = search.trim();
    if (!query) {
      setLocationStatus('Enter a city name to search.');
      return;
    }

    setLocationStatus('');
    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        name: query,
        count: '1',
        language: 'en',
        format: 'json',
        countryCode: 'IN',
      });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      if (!response.ok) {
        throw new Error(`Location search failed (${response.status}).`);
      }

      const data: { results?: { name: string; latitude: number; longitude: number }[] } = await response.json();
      const match = data.results?.[0];
      if (!match) {
        setLocationStatus(`No Indian city found for "${query}". Check the spelling and try again.`);
        return;
      }

      setLocation({ lat: match.latitude, lon: match.longitude, name: match.name });
    } catch (error) {
      console.error('Could not search for location.', error);
      setLocationStatus('Could not search for that location. Check your connection and try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Location is not supported by this browser.');
      return;
    }

    setIsLocating(true);
    setLocationStatus('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ lat: coords.latitude, lon: coords.longitude, name: 'My Location' });
        setSearch('My Location');
        setLocationStatus('');
        setIsLocating(false);
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Allow location access in your browser and try again.'
          : error.code === error.POSITION_UNAVAILABLE
            ? 'Your current location is unavailable. Try again when your device has a location signal.'
            : 'Could not get your location in time. Please try again.';
        setLocationStatus(message);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <header className="relative p-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-dark-600 bg-dark-800">
      <div className="flex-1 w-full max-w-md">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-dark-700 border border-dark-600 text-white rounded-full py-2 pl-10 pr-4 focus:outline-none focus:border-accent transition-colors"
            placeholder="Search city..."
            disabled={isSearching}
          />
          <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
        </form>
      </div>
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={isLocating}
          className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors bg-dark-700 px-4 py-2 rounded-full border border-dark-600 disabled:cursor-wait disabled:opacity-60"
        >
          <MapPin className="w-4 h-4" />
          {isLocating ? 'Locating...' : 'Use My Location'}
        </button>
        <DemoScenarioSelector />
      </div>
      {locationStatus && (
        <p className="w-full text-center text-sm text-red-300 sm:absolute sm:top-full sm:left-0 sm:z-50 sm:bg-dark-800 sm:px-4 sm:py-2" role="alert">
          {locationStatus}
        </p>
      )}
    </header>
  );
};
