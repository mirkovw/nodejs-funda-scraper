import "dotenv/config";
import express from "express";
import fs from "fs";
import isEqual from "lodash.isequal";
import cron from "node-cron";
import { municipalities } from "./data/municipalities";
import { Listing } from "./types/types";
import { getElevationForListingsWithCoordinates } from "./utils/elevation";
import {
  getAllListingsFromFunda,
  getChanges,
  getListingDetails,
  getListingsMapById,
  mapFeatureCollectionToListings,
  mapListingsToFeatureCollection,
} from "./utils/listings";
import { startServer } from "./utils/server";

export async function startCronJobs() {
  // schedule incremental updates 4 times a day
  cron.schedule("0 0,6,12,18 * * *", () => {
    console.log("running update");
    runUpdate();
  });
}

(async () => {
  startServer();
  startCronJobs();
  // runUpdate();
  // addMissingCoordinatesToSavedListings();
})();

async function addMissingCoordinatesToSavedListings() {
  /* get saved listings */
  const listings = JSON.parse(
    fs.readFileSync("./output/listings.json", "utf-8")
  ) as Listing[];
  const listingsById = getListingsMapById(listings);

  /* determine which listings are missing coordinates */
  const listingsWithoutCoordinates = listings.filter(
    (listing) => !listing.coordinates
  );

  /* add coordinates to listings */
  const listingsWithCoordinates = await getListingDetails(
    listingsWithoutCoordinates
  ).then((listings) => getElevationForListingsWithCoordinates(listings));

  listingsWithCoordinates.forEach((listing) => {
    listingsById.set(listing.id, listing);
  });

  /* save all listings back to same file */
  fs.writeFileSync(
    "./output/listings.json",
    JSON.stringify([...listingsById.values()], null, 2)
  );

  console.log("done");
}

export async function runUpdate() {
  const savedListings =
    (fs.existsSync("./output/listings.json") &&
      (JSON.parse(
        fs.readFileSync("./output/listings.json", "utf-8")
      ) as Listing[])) ||
    [];
  console.log(`loaded ${savedListings.length} saved listings`);
  const savedListingsById = getListingsMapById(savedListings);

  /* get all current listings from funda */
  const newListings = await getAllListingsFromFunda(municipalities);
  console.log(`loaded ${newListings.length} listings from funda`);
  fs.writeFileSync(
    "./output/temp/listings_funda.json",
    JSON.stringify(newListings, null, 2)
  );

  // const newListings = JSON.parse(
  //   fs.readFileSync("./output/temp/listings_funda.json", "utf-8")
  // ) as Listing[];

  const newListingsById = getListingsMapById(newListings);

  /* determine which listings are new, updated or deleted */
  const { toUpdate, toInsert, toDelete } = getChanges(
    newListingsById,
    savedListingsById
  );

  console.log(
    `toUpdate: ${toUpdate.length}, toInsert: ${toInsert.length}, toDelete: ${toDelete.length}`
  );

  /* NEW LISTINGS */

  /* add coordinates to new listings */
  const newListingsWithCoordinatesAndElevation = await getListingDetails(
    toInsert
  ).then((listings) => getElevationForListingsWithCoordinates(listings));
  fs.writeFileSync(
    "./output/temp/new_listings_with_details.json",
    JSON.stringify(newListingsWithCoordinatesAndElevation, null, 2)
  );

  /* set listings in the savedListings map */
  newListingsWithCoordinatesAndElevation.forEach((listing) => {
    savedListingsById.set(listing.id, listing);
  });

  /* UPDATED LISTINGS */

  /* determine if the updated listings need new coordinates */
  const toUpdateChanges = toUpdate.map((listing) => {
    const savedListing = savedListingsById.get(listing.id) as Listing;

    const changedFields = Object.keys(listing).filter((key) => {
      return !isEqual(
        listing[key as keyof Listing],
        savedListing[key as keyof Listing]
      );
    });

    return {
      id: listing.id,
      changedFields,
    };
  });

  const toUpdateWithCoordinates = toUpdate.filter((listing) => {
    const changes = toUpdateChanges.find((change) => change.id === listing.id);

    if (changes === undefined) return false;

    return (
      changes.changedFields.includes("postalCodeCity") ||
      changes.changedFields.includes("streetName")
    );
  });

  /* add coordinates to update listings */
  const updatedListingsWithCoordinatesAndElevation = await getListingDetails(
    toUpdateWithCoordinates
  ).then((listings) => getElevationForListingsWithCoordinates(listings));

  /* merge updatedListingsWithCoordinates back into toUpdate */
  updatedListingsWithCoordinatesAndElevation.forEach((listing) => {
    const index = toUpdate.findIndex((l) => l.id === listing.id);
    toUpdate[index] = listing;
  });

  /* set listings in the savedListings map */
  toUpdate.forEach((listing) => {
    savedListingsById.set(listing.id, listing);
  });

  /* DELETED LISTINGS */

  /* remove deleted listings from savedListings */
  toDelete.forEach((listing) => {
    savedListingsById.delete(listing.id);
  });

  /* save all listings to file */
  fs.writeFileSync(
    "./output/listings.json",
    JSON.stringify([...savedListingsById.values()], null, 2)
  );

  /* finally, create a featureCollection of all listings and save it to public folder */
  const featureCollection = await mapListingsToFeatureCollection([
    ...savedListingsById.values(),
  ]);

  console.log("writing to file");
  fs.writeFileSync(
    "./public/listings_feature_collection.json",
    JSON.stringify(featureCollection, null, 2)
  );

  console.log("all done");
}
