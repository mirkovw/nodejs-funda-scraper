import React, { useEffect, useState } from 'react';
import './App.css';

interface FeatureCollection {
  type: string;
  features: any[];
}

function App() {
  const [listings, setListings] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchListings = async () => {
      try {
        const response = await fetch('/api/listings');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: FeatureCollection = await response.json();
        setListings(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, []);

  if (loading) {
    return <div className="App">Loading listings...</div>;
  }

  if (error) {
    return <div className="App">Error: {error}</div>;
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Funda Listings</h1>
        <pre>{JSON.stringify(listings, null, 2)}</pre>
      </header>
    </div>
  );
}

export default App;