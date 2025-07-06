import Bottleneck from "bottleneck";
import cheerio from "cheerio";
import crypto from "crypto";
import fs from "fs";
import { Listing, ListingWithDetails, ListingWithElevation } from "../types/types";
import { PromiseQueue } from "./PromiseQueue";
import { parseDataStructure } from "./utils";

const baseUrl = "https://www.funda.nl/zoeken/koop";

export async function getAllListingsFromFunda(municipalities: string[] = []) {
  const startUrls = municipalities.map(
    (municipality) => `${baseUrl}?selected_area=["${municipality}"]`
  );

  const queue = new PromiseQueue([], 4);
  const tasks = startUrls.map(
    (url) => () => fetchSearchResultsPerUrlV2(url, true)
  );
  queue.add(tasks);

  queue.run();

  const retriesPerUrlMap = new Map<string, number>();

  return new Promise<Listing[]>((resolve) => {
    queue.on("progress", (progress) => {
      console.log(`${ queue.complete.length + queue.failed.length }/${queue.total} finished checking url ${progress.result.url} with ${progress.result.listings.length} listings`);

      if (progress.result.listings.length === 0) {
        const retryIndex = retriesPerUrlMap.get(progress.result.url) || 0;
        retriesPerUrlMap.set(progress.result.url, retryIndex + 1);
        if (retryIndex >= 3) {
          console.log(`reached max retries for url: ${progress.result.url}`);
          return;
        }

        console.log(`retrying url ${progress.result.url}, attempt ${retryIndex}`);
        queue.add([() => fetchSearchResultsPerUrlV2(progress.result.url)]); // TODO add limited retries
      }

      if (progress.result.urlsToCheck?.length) {
        queue.add(
          progress.result.urlsToCheck.map(
            (url: string) => () => fetchSearchResultsPerUrlV2(url)
          )
        );
      }
    });

    queue.on("complete", async (results) => {
      const allListings: Listing[] = results.completed
        .map((result: any) => result.listings)
        .flat();

      console.log("Retrieved all listings from funda", allListings.length);
      resolve(allListings);
    });
  });
}

export async function fetchSearchResultsPerUrlV2(url: string, isFirstPage = false) {
  const searchResultsPerPage = 15;
  const urlsToCheck: string[] = [];

  const result = await fetch(encodeURI(url));
  const html = await result.text();
  const $ = cheerio.load(html);

  // the div containing all listings has ID PageListings
  const listingsDiv = $("#PageListings");

  // somewhere within the listingsDiv there are multiple divs that each contain a <a> tag with the attribute data-testid="listingDetailsAddress"
  const listingElements = listingsDiv.find(
    '[data-testid="listingDetailsAddress"]'
  );

  // get the href attribute of each <a> tag
  const links = listingElements
    .map((_, el) => {
      return $(el).attr("href");
    })
    .get();
  

  const listings: Listing[] = links.map((link) => {
    const id = crypto
      .createHash("md5")
      .update(link)
      .digest("hex");

    return {
      id,
      link: `https://www.funda.nl${link}`,
    } as Listing;
  })

  if (isFirstPage) {
    // if this is the first page of the search results, also return a array with urls to add to the task queue
    const searchResults = $("h1")
      .text()
      .trim()
      .split(" ")[0]
      .replace(".", "")
      .trim();

    const amountOfSearchPages = Math.ceil(
      parseInt(searchResults) / searchResultsPerPage
    );

    for (let i = 2; i <= amountOfSearchPages; i++) {
      urlsToCheck.push(`${url}&search_result=${i}`);
    }
  }

  if (listings.length === 0) {
    console.log("no listings found for url", url);
    fs.writeFileSync(`./output/no-listings-${Date.now()}.html`, html);
  }


  return {
    url,
    listings,
    urlsToCheck,
  };
}


export async function getListingDetails(listings: Listing[]) {
  const limiter = new Bottleneck({
    minTime: 150,
    maxConcurrent: 4,
  });
  let count = 0;

  const result: ListingWithDetails[] = await Promise.all(
    listings.map((listing) => {
      return new Promise<ListingWithDetails>(async (resolve) => {
        const result = await limiter.schedule(
          fetchSingleListingDetailsV2,
          listing
        );

        count++
        console.log(
          `${count}/${listings.length} completed fetching details for listing ${result.addressTitle}, ${result.city}, ${result.coordinates.latitude}, ${result.coordinates.longitude}`
        );

        resolve(result);
      });
    })
  );
  // multiBar.stop();
  return result;
}

export async function fetchSingleListingDetailsV3(listing: Listing) {
  const result = await fetch(listing.link);
    const html = await result.text();

    // at the end of the html file there is a script tag like <script type="application/json" id="__NUXT_DATA__">[{"foo: "bar"}]</script>
    const $ = cheerio.load(html);
    const nuxtDataEl = $("script#__NUXT_DATA__").html();
    if (!nuxtDataEl) {
      throw new Error("no script tag found for listing");
    }

    const nuxtData = nuxtDataEl.substring(nuxtDataEl.indexOf("["));

    const parsedNuxtData = parseDataStructure(JSON.parse(nuxtData));

    fs.writeFileSync(
      `./output/temp/listing-${listing.id}-details.json`,
      JSON.stringify(parsedNuxtData, null, 2)
    );

}

export async function fetchSingleListingDetailsV2(listing: Listing): Promise<ListingWithDetails> {
  try {

    const result = await fetch(listing.link);
    const html = await result.text();

    // at the end of the html file there is a script tag like <script type="application/json" id="__NUXT_DATA__">[{"foo: "bar"}]</script>
    const $ = cheerio.load(html);
    const nuxtDataEl = $("script#__NUXT_DATA__").html();
    if (!nuxtDataEl) {
      throw new Error("no script tag found for listing");
    }

    const nuxtData = nuxtDataEl.substring(nuxtDataEl.indexOf("["));
    const parsedNuxtData: any[] = JSON.parse(nuxtData);

    // somewhere in the parsedNuxtData array there is a object { lat: 0.000, long: 0.000 }, lets find it
    const coordinateIndexes = parsedNuxtData.find((el) => {
      return el?.lat && el?.lng;
    });   

    const latitude = parsedNuxtData[coordinateIndexes?.lat] || 0;
    const longitude = parsedNuxtData[coordinateIndexes?.lng] || 0;

    const addressTitleIndex = parsedNuxtData.find((el) => el?.addressTitle);
    const addressTitle = parsedNuxtData[addressTitleIndex?.addressTitle] || "";

    const otherIndexes = parsedNuxtData.find((el) => el?.vraagprijs)

    const postalCode = parsedNuxtData[otherIndexes?.postcode] || "";
    const city = parsedNuxtData[otherIndexes?.plaats] || "";
    const livingArea = parseInt(parsedNuxtData[otherIndexes?.woonoppervlakte]) || 0;
    const rooms = parseInt(parsedNuxtData[otherIndexes?.aantalkamers]) || 0;
    const energyLabel = parsedNuxtData[otherIndexes?.energieklasse] || "";
    const price = parseInt(parsedNuxtData[otherIndexes?.vraagprijs]) || -1;

    const mediaIndexes = parsedNuxtData.find((el) => {
      return el?.layout && el?.photos && el?.videos;
    });

    const photosIndexes = parsedNuxtData[mediaIndexes?.photos];
    
    const photosItemsIndexes = parsedNuxtData[photosIndexes?.items];
    const firstThumbnailItemIndex = parsedNuxtData[photosItemsIndexes[0]]
    const firstThumbnailId = parsedNuxtData[firstThumbnailItemIndex?.id] || '';

    const thumbnailBaseUrl = parsedNuxtData[photosIndexes?.thumbnailBaseUrl] || '';

    const imageUrl = thumbnailBaseUrl.replace("{id}", firstThumbnailId);
    
    return {
      id: listing.id,
      link: listing.link,
      imageUrl,
      price,
      addressTitle,
      postalCode,
      city,
      livingArea,
      rooms,
      energyLabel,
      coordinates: {
        latitude,
        longitude,
      },
    }

  } catch (error) {
    console.error(`Error fetching details for listing ${listing.id}:`, error);
    
    return {
      ...listing,
      coordinates: {
        latitude: 0,
        longitude: 0,
      },
      addressTitle: "",
      postalCode: "",
      city: "",
      livingArea: 0,
      rooms: 0,
      energyLabel: "",
      price: -1,
    } as ListingWithDetails;
  }
}

export function getUpdates(
  newListingsById: Map<string, Listing>,
  savedListingsById: Map<string, ListingWithElevation>) {

  const toInsert: Listing[] = [];
  const toDelete: Listing[] = [];

  newListingsById.forEach((listing, id) => {
    if (!savedListingsById.has(id)) {
      toInsert.push(listing);
    }
  });

  savedListingsById.forEach((listing, id) => {
    if (!newListingsById.has(id)) {
      toDelete.push(listing);
    }
  });

  return { toInsert, toDelete };
}

export async function mapListingsToFeatureCollection(listings: ListingWithElevation[]) {
  const features = listings.map((listing) => {
    try {
      return {
        type: "Feature",
        id: listing.id,
        geometry: {
          type: "Point",
          coordinates: [
            listing.coordinates.longitude,
            listing.coordinates.latitude,
          ],
        },
        properties: {
          id: listing.id,
          price: listing.price,
          imageUrl: listing.imageUrl,
          addressTitle: listing.addressTitle,
          postalCode: listing.postalCode,
          city: listing.city,
          livingArea: listing.livingArea,
          rooms: listing.rooms,
          energyLabel: listing.energyLabel,
          link: listing.link,
          elevation: listing.elevation,
        },
      };
    } catch (error) {
      console.log("error mapping listing to feature", listing.id, error);
    }
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

export function mapFeatureCollectionToListings(
  featureCollection: any
): ListingWithElevation[] {
  return featureCollection.features.map((feature: any) => {
    return {
      id: feature.properties.id,
      header: feature.properties.streetName,
      link: feature.properties.link,
      imageUrl: feature.properties.imageUrl,
      streetName: feature.properties.streetName,
      postalCodeCity: `${feature.properties.postalCode} ${feature.properties.city}`,
      priceSale: feature.properties.price,
      woonoppervlakte: feature.properties.surface,
      perceel: feature.properties.land,
      kamers: feature.properties.rooms,
      energielabel: feature.properties.energyLabel,
      coordinates: {
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
      },
      elevation: feature.properties.elevation,
    };
  });
}


export function getTypedListingsMapById<T extends Listing | ListingWithDetails>(listings: T[]) {
  const listingsById = new Map<string, T>();
  listings.forEach((listing) => {
    listingsById.set(listing.id, listing);
  });

  return listingsById;
}


export function getListingsMapById(listings: (Listing | ListingWithElevation)[]) {
  const listingsById = new Map<string, (Listing | ListingWithElevation)>();
  listings.forEach((listing) => {
    listingsById.set(listing.id, listing);
  });

  return listingsById;
}
