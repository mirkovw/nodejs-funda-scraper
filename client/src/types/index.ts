export interface ListingProperties {
  price: number;
  imageUrl: string;
  addressTitle: string;
  postalCode: string;
  city: string;
  livingArea: number;
  rooms: number;
  energyLabel: string;
  link: string;
  elevation: number;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

export interface Feature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: ListingProperties;
}
