import React, { useEffect, useState } from 'react';
import './App.css';
import MapComponent from './components/MapComponent';
import { FeatureCollection } from './types';

function App() {
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [minElevation, setMinElevation] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(0);
  const [updateInProgress, setUpdateInProgress] = useState<boolean>(false);

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    try {
      setLoading(true);
      // Note that the endpoint is '/listings' according to the server routes
      const response = await fetch('/api/listings');
      console.log(response)
      if (!response.ok) {
        console.error('HTTP error!', response.status);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: FeatureCollection = await response.json();
      console.log('Fetched listings:', data);
      // Convert the data to GeoJSON format if necessary
      setGeoJsonData(data);
    } catch (e: any) {
      setError(e.message);
      console.error('Failed to fetch listings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateClick = async () => {
    try {
      setUpdateInProgress(true);
      // Note that the endpoint is '/run-full-update' according to the server routes
      const response = await fetch('/api/update', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.text();
      console.log(data);

      // Refresh listings after update
      fetchListings();
    } catch (e: any) {
      console.error('Failed to run update:', e);
    } finally {
      setUpdateInProgress(false);
    }
  };

  return (
    <div className="App">
      {loading && (
        <div className="loading-container">
          <div className="loading-text">Loading map data...</div>
        </div>
      )}

      {updateInProgress && (
        <div className="loading-container">
          <div className="loading-text">Updating listings...</div>
        </div>
      )}

      {error && (
        <div className="loading-container">
          <div className="loading-text">Error: {error}</div>
        </div>
      )}

      <input
        className="form-input elevation-input"
        placeholder="Minimal Elevation (m)"
        type="number"
        value={minElevation || ''}
        onChange={(e) => setMinElevation(Number(e.target.value))}
      />

      <input
        className="form-input price-input"
        placeholder="Max Price (€)"
        type="number"
        value={maxPrice || ''}
        onChange={(e) => setMaxPrice(Number(e.target.value))}
      />

      {geoJsonData && (
        <MapComponent
          geoJsonData={geoJsonData}
          minElevation={minElevation}
          maxPrice={maxPrice}
          onUpdateClick={handleUpdateClick}
        />
      )}
    </div>
  );
}

export default App;