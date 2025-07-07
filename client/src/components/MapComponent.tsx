import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { FeatureCollection, Feature } from '../types';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWlya292dyIsImEiOiJjbHoydDlvdnIwMXd6MmxzOTh6ZGRjNDJzIn0.bVUj4FRgi4cBaaDD17Rjzg';

interface MapComponentProps {
    geoJsonData: FeatureCollection;
    minElevation: number;
    maxPrice: number;
    onUpdateClick: () => void;
}

interface FormValues {
    maxPrice: number;
    elevation: number;
}

const MapComponent: React.FC<MapComponentProps> = ({
    geoJsonData,
    minElevation,
    maxPrice,
    onUpdateClick
}) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const [filteredData, setFilteredData] = useState<any>(geoJsonData);

    // Filter listings based on elevation and price
    useEffect(() => {
        if (!geoJsonData) return;

        const formValues: FormValues = {
            maxPrice: maxPrice,
            elevation: minElevation,
        };

        const filteredFeatures = geoJsonData.features.filter((feature: any) => {
            return (
                (formValues.maxPrice && formValues.maxPrice > 0
                    ? feature.properties.price <= formValues.maxPrice
                    : true) &&
                feature.properties.elevation >= formValues.elevation
            );
        });

        setFilteredData({
            type: "FeatureCollection",
            features: filteredFeatures,
        });

        // If map is loaded, update the source data
        if (map.current?.isStyleLoaded() && map.current?.getSource('earthquakes')) {
            (map.current.getSource('earthquakes') as mapboxgl.GeoJSONSource).setData({
                type: "FeatureCollection",
                features: filteredFeatures,
            });
        }
    }, [geoJsonData, minElevation, maxPrice]);

    // Initialize map when component mounts
    useEffect(() => {
        if (!mapContainer.current) return; // wait for the container to be available

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/streets-v11',
            center: [5.506484398523903, 52.3953340156272],
            zoom: 8,
        });

        map.current.on('load', () => {
            if (!map.current) return;

            // Add GeoJSON source
            map.current.addSource("earthquakes", {
                type: "geojson",
                data: filteredData,
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 35,
            });

            // Add AHN WMS raster source
            const tileUrl =
                `https://service.pdok.nl/rws/ahn/wms/v1_0?service=WMS&request=getMap` +
                `&version=1.3.0&layers=dsm_05m&styles=&format=image/png&crs=EPSG:3857&` +
                `bbox={bbox-epsg-3857}&width=256&height=256&transparent=true`;

            map.current.addSource("ahn-wms-source", {
                type: "raster",
                tiles: [tileUrl],
                tileSize: 256,
            });

            // Add AHN layer
            map.current.addLayer(
                {
                    id: "ahn-layer",
                    type: "raster",
                    source: "ahn-wms-source",
                    paint: {},
                },
                "building" // Place layer under labels, roads and buildings
            );

            // Add clusters layer
            map.current.addLayer({
                id: "clusters",
                type: "circle",
                source: "earthquakes",
                filter: ["has", "point_count"],
                paint: {
                    "circle-color": [
                        "step",
                        ["get", "point_count"],
                        "#51bbd6",
                        100,
                        "#f1f075",
                        750,
                        "#f28cb1",
                    ],
                    "circle-radius": [
                        "step",
                        ["get", "point_count"],
                        20,
                        100,
                        30,
                        750,
                        40,
                    ],
                },
            });

            // Add cluster count layer
            map.current.addLayer({
                id: "cluster-count",
                type: "symbol",
                source: "earthquakes",
                filter: ["has", "point_count"],
                layout: {
                    "text-field": ["get", "point_count_abbreviated"],
                    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
                    "text-size": 12,
                },
            });

            // Add unclustered point layer
            map.current.addLayer({
                id: "unclustered-point",
                type: "symbol",
                source: "earthquakes",
                filter: ["!", ["has", "point_count"]],
                layout: {
                    "text-field": [
                        "number-format",
                        ["get", "price"],
                        {
                            currency: "EUR",
                        },
                    ],
                    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
                    "text-size": 12,
                },
                paint: {
                    "text-color": "#000",
                    "background-color": "#FF0000",
                    "text-halo-color": "#32de84",
                    "text-halo-width": 10,
                },
            });

            // Handle cluster click
            map.current.on("click", "clusters", (e) => {
                if (!map.current) return;

                const features = map.current.queryRenderedFeatures(e.point, {
                    layers: ["clusters"],
                });

                if (!features.length) return;

                const clusterId = features[0].properties?.cluster_id;

                if (clusterId) {
                    (map.current.getSource("earthquakes") as mapboxgl.GeoJSONSource)
                        .getClusterExpansionZoom(clusterId, (err, zoom) => {
                            if (err || !map.current) return;

                            map.current.easeTo({
                                center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number],
                                zoom: zoom || map.current.getZoom() + 1,
                            });
                        });
                }
            });

            // Handle unclustered point click
            map.current.on("click", "unclustered-point", (e) => {
                if (!map.current || !e.features || !e.features[0]) return;

                const coordinates = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];

                // Ensure that if the map is zoomed out such that
                // multiple copies of the feature are visible, the
                // popup appears over the copy being pointed to.
                if (map.current.getProjection() && ["mercator", "equirectangular"].includes(map.current.getProjection().name)) {
                    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
                    }
                }

                new mapboxgl.Popup({ className: "popup" })
                    .setLngLat(coordinates)
                    .setMaxWidth("750px")
                    .setHTML(getListingHtmlFromFeature(e.features[0]))
                    .addTo(map.current);
            });

            // Change cursor on hover
            map.current.on("mouseenter", "clusters", () => {
                if (map.current) {
                    map.current.getCanvas().style.cursor = "pointer";
                }
            });

            map.current.on("mouseleave", "clusters", () => {
                if (map.current) {
                    map.current.getCanvas().style.cursor = "";
                }
            });
        });

        // Clean up on unmount
        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    // Reset map view function
    const resetView = () => {
        if (map.current) {
            map.current.flyTo({ center: [5.506484398523903, 52.3953340156272], zoom: 8 });
        }
    };

    // Helper function to generate HTML for popups
    const getListingHtmlFromFeature = (feature: mapboxgl.MapboxGeoJSONFeature) => {
        if (!feature.properties) return "";

        const {
            price,
            imageUrl,
            addressTitle,
            postalCode,
            city,
            livingArea,
            rooms,
            energyLabel,
            link,
            elevation,
        } = feature.properties;

        return `
      <div class="popup_inner">
        <div class="popup_inner_left">
          <img src="${imageUrl}" style="width: 100%; height: auto" />
        </div>
        <div class="popup_inner_right">
          <h3>${addressTitle}, ${city}</h3>
          <p>Price: €${price}</p>
          <p>Rooms: ${rooms}</p>
          <p>Elevation: ${Math.round(elevation * 100) / 100} m</p>
          <p>Energy label: ${energyLabel}</p>
          <p>Surface: ${livingArea} m²</p>
          <a href="${link}" target="_blank">More info</a>
        </div>
      </div>
    `;
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
            <div ref={mapContainer} style={{ position: 'absolute', top: 0, bottom: 0, width: '100%' }} />

            <button
                style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1 }}
                onClick={resetView}
            >
                Reset view
            </button>

            <button
                style={{ position: 'absolute', top: '40px', right: '10px', zIndex: 1 }}
                onClick={onUpdateClick}
            >
                Update
            </button>
        </div>
    );
};

export default MapComponent;
