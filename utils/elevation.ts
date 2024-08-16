import { ElevationApiReturn, Listing } from "../types/types";

const apiKey = process.env.GMAPS_ELEVATION_APIKEY as string;
const baseUrl = "https://maps.googleapis.com/maps/api/elevation/json";

export async function getElevationForListingsWithCoordinates(
  listings: Listing[]
) {
  /* divide the listings up into chunks of 512 using splice */
  const listingChunks = [];
  while (listings.length) listingChunks.push(listings.splice(0, 256));

  const results: Listing[] = [];

  for (const chunk of listingChunks) {
    /* get locations as a single string with pipe separator */
    const locations = chunk
      .map((listing) => {
        const { latitude, longitude } = listing.coordinates;
        if (latitude === undefined || longitude === undefined) {
          console.log("no coordinates for listing", listing.id);
        }

        return `${latitude},${longitude}`;
      })
      .join("|");

    const params = {
      key: apiKey,
      locations,
    };

    const url = `${baseUrl}?${new URLSearchParams(params)}`;
    // console.log(url);
    const res = await fetch(url);

    try {
      const data: ElevationApiReturn = await res.json();
      data.results.forEach((result, index) => {
        results.push({
          ...chunk[index],
          elevation: result.elevation,
        });
      });
    } catch (error) {
      console.log(`error fetching elevation data: ${error}`);
      console.log(res);
      results.push(...chunk);
    }
  }

  return results.flat();
}
