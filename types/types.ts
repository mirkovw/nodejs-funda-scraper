export type Address = {
  address_line1: string;
  postcode: string;
  place: string;
};

export type Listing = {
  id: string;
  header: string;
  link: string;
  streetName: string;
  postalCodeCity: string;
  priceSale: number;
  woonoppervlakte: number;
  perceel: number;
  kamers: number;
  energielabel: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  elevation: number;
};

export type GeoCodeResult = {
  batch: FeatureCollection[];
};

export type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

export type Feature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    mapbox_id: string;
    feature_type: string;
    full_address: string;
    name: string;
    name_preferred: string;
    coordinates: {
      longitude: number;
      latitude: number;
      accuracy: string;
      routable_points: {
        name: string;
        latitude: number;
        longitude: number;
      }[];
    };
    place_formatted: string;
    match_code: {
      address_number: string;
      street: string;
      postcode: string;
      place: string;
      region: string;
      locality: string;
      country: string;
      confidence: string;
    };
    context: {
      address: {
        mapbox_id: string;
        address_number: string;
        street_name: string;
        name: string;
      };
      street: {
        mapbox_id: string;
        name: string;
      };
      postcode: {
        mapbox_id: string;
        name: string;
      };
      place: {
        mapbox_id: string;
        name: string;
        wikidata_id: string;
      };
      region: {
        mapbox_id: string;
        name: string;
        wikidata_id: string;
        region_code: string;
        region_code_full: string;
      };
      country: {
        mapbox_id: string;
        name: string;
        wikidata_id: string;
        country_code: string;
        country_code_alpha_3: string;
      };
    };
  };
};

export type DbUpdate = {
  toUpdate: Listing[];
  toInsert: Listing[];
  toDelete: Listing[];
};

export type ElevationApiReturn = {
  results: {
    location: {
      lat: number;
      lng: number;
    };
    elevation: number;
    resolution: number;
  }[];
};

export type NomatimGeocodeResult = {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name: string;
  display_name: string;
  boundingbox: string[];
};
