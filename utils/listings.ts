import Bottleneck from "bottleneck";
import cheerio from "cheerio";
import cliProgress from "cli-progress";
import crypto from "crypto";
import fs from "fs";
import { Listing } from "../types/types";
import { PromiseQueue } from "./PromiseQueue";

const baseUrl = "https://www.funda.nl/zoeken/koop";

export async function getAllListingsFromFunda(municipalities: string[] = []) {
  const multiBar = new cliProgress.MultiBar(
    {},
    cliProgress.Presets.shades_classic
  );
  const bar = multiBar.create(municipalities.length, 0);

  const startUrls = municipalities.map(
    (municipality) => `${baseUrl}?selected_area=["${municipality}"]`
  );

  const queue = new PromiseQueue([], 4);
  const tasks = startUrls.map(
    (url) => () => fetchSearchResultsPerUrl(url, true)
  );
  queue.add(tasks);

  queue.run();

  const retriesPerUrlMap = new Map<string, number>();

  return new Promise<Listing[]>((resolve) => {
    queue.on("progress", (progress) => {
      bar.increment();
      multiBar.log(
        `finished checking url ${progress.result.url} with ${progress.result.listings.length} listings\n`
      );

      if (progress.result.listings.length === 0) {
        const retryIndex = retriesPerUrlMap.get(progress.result.url) || 0;
        retriesPerUrlMap.set(progress.result.url, retryIndex + 1);
        if (retryIndex >= 3) {
          multiBar.log(`reached max retries for url: ${progress.result.url}\n`);
          return;
        }

        multiBar.log(
          `retrying url ${progress.result.url}, attempt ${retryIndex}\n`
        );
        queue.add([() => fetchSearchResultsPerUrl(progress.result.url)]); // TODO add limited retries
        bar.setTotal(queue.total);
      }

      if (progress.result.urlsToCheck?.length) {
        queue.add(
          progress.result.urlsToCheck.map(
            (url: string) => () => fetchSearchResultsPerUrl(url)
          )
        );
        bar.setTotal(queue.total);
      }
    });

    queue.on("complete", async (results) => {
      multiBar.stop();
      const allListings: Listing[] = results.completed
        .map((result: any) => result.listings)
        .flat();

      console.log("Retrieved all listings from funda", allListings.length);
      resolve(allListings);
    });
  });
}

async function fetchSearchResultsPerUrl(url: string, isFirstPage = false) {
  const searchResultsPerPage = 15;
  const urlsToCheck: string[] = [];
  const listings = await fetch(encodeURI(url))
    .then((res) => {
      if (!res.ok) {
        throw Error(res.statusText);
      }

      return res.text();
    })
    .then((html) => {
      const $ = cheerio.load(html);

      // find a div with attribute data-test-id="search-result-item"
      const listings = $("div[data-test-id=search-result-item]")
        .toArray()
        .map((el) => {
          const header = $(el).find("header").text().trim();
          const link = $(el).find("a").attr("href");
          const streetName = $(el)
            .find("h2[data-test-id=street-name-house-number]")
            .text()
            .trim();
          const postalCodeCity = $(el)
            .find("div[data-test-id=postal-code-city]")
            .text()
            .trim();
          const priceSale = parseInt(
            $(el)
              .find("p[data-test-id=price-sale]")
              .text()
              .replace("€", "")
              .replaceAll(".", "")
              .replace("k.k.", "")
              .trim()
          );
          const allLists = $(el).find("ul");
          const features = $(allLists[1])
            .find("li")
            .map((i, li) => $(li).text().trim())
            .get()
            .reduce((prev, curr, i) => {
              const determineType = (content: string, index: number) => {
                if (content.includes("m²")) {
                  if (index === 0) {
                    return {
                      woonoppervlakte: parseInt(
                        content.replace("m²", "").replace(".", "").trim()
                      ),
                    };
                  }
                  if (index === 1) {
                    return {
                      perceel: parseInt(
                        content.replace("m²", "").replace(".", "").trim()
                      ),
                    };
                  }
                }

                // if it's a number
                if (content.match(/\d+/)) {
                  return { kamers: parseInt(content) };
                }

                // if it's a single capital letter
                if (content.match(/[A-Z]/)) {
                  return { energielabel: content };
                }

                return { unknown: content };
              };

              return {
                ...prev,
                ...determineType(curr, i),
              };
            }, {});

          // use link as unique id
          const id = crypto
            .createHash("md5")
            .update(link as string)
            .digest("hex");

          return {
            id,
            header,
            link,
            streetName,
            postalCodeCity,
            priceSale,
            ...features,
          } as Listing;
        });

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

      return listings;
    });

  return {
    url,
    listings,
    urlsToCheck,
  };
}

export async function mapListingsToFeatureCollection(listings: Listing[]) {
  const features = listings.map((listing) => {
    try {
      const postalCode =
        listing.postalCodeCity.split(" ")[0] +
        " " +
        listing.postalCodeCity.split(" ")[1];
      const city = listing.postalCodeCity.split(" ")[2];

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
          price: listing.priceSale,
          postalCode,
          city,
          streetName: listing.streetName,
          surface: listing.woonoppervlakte,
          land: listing.perceel,
          rooms: listing.kamers,
          energyLabel: listing.energielabel,
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

export async function getListingDetails(listings: Listing[]) {
  const multiBar = new cliProgress.MultiBar(
    {},
    cliProgress.Presets.shades_classic
  );
  const bar = multiBar.create(listings.length, 0);

  const limiter = new Bottleneck({
    minTime: 150,
    maxConcurrent: 4,
  });

  const result = await Promise.all(
    listings.map((listing) => {
      return new Promise<Listing>(async (resolve) => {
        const result = await limiter.schedule(
          fetchSingleListingDetails,
          listing
        );
        bar.increment();
        multiBar.log(
          `completed fetching details for listing ${result.streetName}, ${result.postalCodeCity}, ${result.coordinates.latitude}, ${result.coordinates.longitude}\n`
        );
        resolve(result);
      });
    })
  );
  multiBar.stop();
  return result;
}

export async function fetchSingleListingDetails(listing: Listing) {
  const result = await fetch(listing.link);
  const html = await result.text();

  /* cut the coordinates out of this part: {"Latitude":255,"Longitude":256},51.930573,5.589854, */
  const start = html.indexOf('{"Latitude"');
  const end1 = html.indexOf("},", start);
  const end2 = html.indexOf(",", end1 + 2);
  const end3 = html.indexOf(",", end2 + 1);

  const latitude = parseFloat(html.substring(end1 + 2, end2));
  const longitude = parseFloat(html.substring(end2 + 1, end3));

  return {
    ...listing,
    coordinates: {
      latitude,
      longitude,
    },
  };
}
