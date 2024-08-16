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

  return new Promise<Listing[]>((resolve) => {
    queue.on("progress", (progress) => {
      bar.increment();
      multiBar.log(
        `finished checking url ${progress.result.url} with ${progress.result.listings.length} listings\n`
      );

      if (progress.result.listings.length === 0) {
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
