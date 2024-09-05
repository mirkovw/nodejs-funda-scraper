import Bottleneck from "bottleneck";
import { get } from "cheerio/lib/api/traversing";
import cliProgress from "cli-progress";
import fs from "fs";
import {
  Address,
  FeatureCollection,
  GeoCodeResult,
  Listing,
  NomatimGeocodeResult,
} from "../types/types";
import { PromiseQueue } from "./PromiseQueue";
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
  const url = "https://api.mapbox.com/search/geocode/v6/forward";
  const multiBar = new cliProgress.MultiBar(
    {},
    cliProgress.Presets.shades_classic
  );
  const bar = multiBar.create(addresses.length, 0);

  const limiter = new Bottleneck({
    minTime: 60,
  });

  const results = [];
  for (const address of addresses) {
    const requestParams = new URLSearchParams({
      ...address,
      country: "Netherlands",
      limit: "1",
    }).toString();

    const requestUrl = `${url}?${requestParams}&access_token=${process.env.ACCESS_TOKEN}`;

    const response = await limiter.schedule(() =>
      fetch(requestUrl, {
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    bar.increment();

    const data: FeatureCollection = await response.json();

    try {
      const feature = data.features[0];

      // console.log(feature);
    } catch (e) {
      console.error("Could not load feature");
    }

    results.push({
      name: "",
      address: "",
      coordinates: {
        latitude: 0,
        longitude: 0,
      },
      success: true,
    });
  }

  multiBar.stop();
  return results;
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

export async function getCoordinatesForListings2(listings: Listing[]) {
  console.log("fetching coordinates for listings", listings.length);
  const baseUrl = "https://nominatim.openstreetmap.org/search.php";
  const multiBar = new cliProgress.MultiBar(
    {},
    cliProgress.Presets.shades_classic
  );
  const bar = multiBar.create(listings.length, 0);

  const urls = listings.map((listing) => {
    const { street, number } = getAddressParts(listing.streetName);
    const splitPostalCodeCity = listing.postalCodeCity.split(" ");
    const postalcode = `${splitPostalCodeCity[0]} ${splitPostalCodeCity[1]}`;
    const city = splitPostalCodeCity.slice(2).join(" ");
    const urlParams = new URLSearchParams({
      street: listing.streetName,
      postalcode,
      city,
      country: "Netherlands",
      format: "jsonv2",
    });

    return `${baseUrl}?${urlParams.toString()}`;
  });

  const results = [];
  for (const url of urls) {
    multiBar.log(`fetching url: ${url}\n`);
    const result: NomatimGeocodeResult = await fetchGeocodePerUrl(url);
    bar.increment();
    results.push(result);
  }

  multiBar.stop();

  const allListings: Listing[] = results.map(
    (result: NomatimGeocodeResult, index) => {
      try {
        return {
          ...listings[index],
          coordinates: {
            latitude: parseFloat(result.lat),
            longitude: parseFloat(result.lon),
          },
        };
      } catch (error) {
        return {
          ...listings[index],
          coordinates: {
            latitude: 0,
            longitude: 0,
          },
        };
      }
    }
  );

  return allListings;

  // const queue = new PromiseQueue([], 1);
  // const tasks = urls.map((url) => () => fetchGeocodePerUrl(url, true));
  // queue.add(tasks);

  // queue.run();

  // queue.on("progress", (progress) => {
  //   multiBar.log(`finished checking ${progress?.result?.display_name}\n`);
  //   bar.increment();
  // });

  // return new Promise<Listing[]>((resolve) => {
  //   queue.on(
  //     "complete",
  //     async (results: { completed: NomatimGeocodeResult[] }) => {
  //       const allListings: Listing[] = results.completed.map(
  //         (result: NomatimGeocodeResult, index) => {
  //           // console.log(result);

  //           try {
  //             return {
  //               ...listings[index],
  //               coordinates: {
  //                 latitude: parseFloat(result.lat),
  //                 longitude: parseFloat(result.lon),
  //               },
  //             };
  //           } catch (error) {
  //             return {
  //               ...listings[index],
  //               coordinates: {
  //                 latitude: 0,
  //                 longitude: 0,
  //               },
  //             };
  //           }
  //         }
  //       );

  //       multiBar.stop();
  //       resolve(allListings);
  //     }
  //   );
  // });
}

function fetchGeocodePerUrl(url: string, log = false) {
  // console.log("fetching url", url);
  return fetch(url)
    .then((response) => response.json())
    .then((data) => {
      if (log) {
        console.log(data[0]);
      }
      return data[0];
    });
}

function getAddressParts(address: string) {
  // address can be like 'street name 38' or 'street name 38A' or 'street name 38 A'
  const parts = address.split(" ");

  // street number is the part that has numbers in it or numbers with letters, and any part that comes after that
  const streetNumber = parts.find((part) => part.match(/\d+/));
  const fullStreetNumber = streetNumber
    ? parts.slice(parts.indexOf(streetNumber)).join(" ")
    : "";

  // street name is all the parts before the street number
  const streetName = streetNumber
    ? parts.slice(0, parts.indexOf(streetNumber)).join(" ")
    : parts.join(" ");

  return {
    street: streetName,
    number: fullStreetNumber,
  };
}
