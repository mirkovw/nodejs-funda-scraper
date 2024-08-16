import cliProgress from "cli-progress";
import fs from "fs";
import { Address, GeoCodeResult, Listing } from "../types/types";
import { isValidAddress } from "./utils";

export async function getCoordinatesForListings(listings: Listing[]) {
  const addresses: Address[] = listings
    // .filter(isValidAddress)
    .map((listing) => {
      // split postalCode city to postcode and place using regexp. postalCodeCity is in the format "1234 AB City"
      const splitPostalCodeCity = listing.postalCodeCity.split(" ");
      const postcode = `${splitPostalCodeCity[0]} ${splitPostalCodeCity[1]}`;
      const place = splitPostalCodeCity.slice(2).join(" ");

      return {
        address_line1: listing.streetName,
        postcode,
        place,
      };
    });

  fs.writeFileSync(
    "./output/addresses.json",
    JSON.stringify(addresses, null, 2)
  );

  console.log("addresses", addresses.length);
  const geoCodeResult = await geocodeAddresses(addresses);

  console.log("geocode results", geoCodeResult.length);
  const listingsWithCoordinates = listings.map((listing, index) => {
    return {
      ...listing,
      coordinates: geoCodeResult[index].coordinates,
    };
  });

  return listingsWithCoordinates;
}

async function geocodeAddresses(addresses: Address[]) {
  const url = "https://api.mapbox.com/search/geocode/v6/batch";
  const requestBody = addresses.map((address) => {
    return {
      ...address,
      country: "Netherlands",
      limit: 1,
    };
  });

  // divide the request body up into chunks of 1000 using splice
  const rbChunks = [];
  while (requestBody.length) rbChunks.push(requestBody.splice(0, 1000));

  const multiBar = new cliProgress.MultiBar(
    {},
    cliProgress.Presets.shades_classic
  );
  const bar = multiBar.create(rbChunks.length, 0);

  const results = [];
  for (const requestBodyChunk of rbChunks) {
    const response = await fetch(
      `${url}?access_token=${process.env.ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBodyChunk),
      }
    );

    bar.increment();

    const data: GeoCodeResult = await response.json();

    fs.writeFileSync("./output/geocode.json", JSON.stringify(data, null, 2));

    results.push(
      data.batch.map((fc, index) => {
        try {
          const feature = fc.features[0];
          return {
            name: feature.properties.name,
            address: feature.properties.full_address,

            coordinates: {
              latitude: feature.properties.coordinates.latitude,
              longitude: feature.properties.coordinates.longitude,
            },
            success: true,
          };
        } catch (error) {
          return {
            name: requestBodyChunk[index].address_line1,
            address: "unknown",
            coordinates: {
              latitude: 52.55645815879817,
              longitude: 5.254893045195342,
            },
            success: false,
          };
        }
      })
    );
  }

  multiBar.stop();
  return results.flat();
}

export async function getCoordinatesFromNominatim(
  address: {
    street: string;
    city: string;
    country: string;
    postalcode: string;
  }[]
) {
  // ?street=Himalaya+78&city=Utrecht&country=Netherlands&postalcode=3524+XG&format=jsonv2
  const url = "https://nominatim.openstreetmap.org/search.php";
  const format = "jsonv2";

  const results = await Promise.all(
    address.map(async (address) => {
      const response = await fetch(
        `${url}?street=${address.street}&city=${address.city}&country=${address.country}&postalcode=${address.postalcode}&format=${format}`
      );
      return response.json();
    })
  );

  console.log(results);
}
