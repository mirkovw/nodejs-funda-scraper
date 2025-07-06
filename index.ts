import "dotenv/config";
import fs from "fs";
import localtunnel from 'localtunnel';
import isEqual from "lodash.isequal";
import cron from "node-cron";
import { municipalities } from "./data/municipalities";
import { FeatureCollection, Listing, ListingWithElevation } from "./types/types";
import { getElevationForListingsWithCoordinates } from "./utils/elevation";
import {
  getAllListingsFromFunda,
  getListingDetails,
  getTypedListingsMapById,
  getUpdates,
  mapListingsToFeatureCollection
} from "./utils/listings";
import { deleteListings, getAllListings, getListingsMapByIdFromDb, insertListings } from "./utils/mongodb";
import { startServer } from "./utils/server";
import { getTimeStamp, getTimeStampWithOffset, parseDataStructure } from "./utils/utils";


export async function startCronJobs() {
  // schedule incremental updates 4 times a day
  cron.schedule("0 0,6,12,18 * * *", () => {
    console.log("running update");
    runUpdate();
  });
}

(async () => {
  startServer(3001);
  // startCronJobs();

  const tunnel = await localtunnel({ port: 3001, subdomain: 'funda-listings' });
  console.log(`Tunnel URL: ${tunnel.url}`);


})();

export async function runUpdate() {
  /* get all listings from the database */
  const savedListingsById = await getListingsMapByIdFromDb();
  console.log(`loaded ${savedListingsById.size} saved listings`);

  /* get all current listings from funda */
  const newListings = await getAllListingsFromFunda(municipalities);
  fs.writeFileSync(
    "./output/temp/listings_funda.json",
    JSON.stringify(newListings, null, 2)
  );
  console.log(`loaded ${newListings.length} listings from funda`);
  
  const newListingsById = getTypedListingsMapById(newListings);

  /* determine which listings are new, updated or deleted */
  const { toInsert, toDelete } = getUpdates(
    newListingsById,
    savedListingsById
  );

  console.log(
    `toInsert: ${toInsert.length}, toDelete: ${toDelete.length}`
  );

  /* NEW LISTINGS */

  /* get details and elevation for new listings */
  const newListingsWithElevation = await getListingDetails(
    toInsert
  ).then((listings) => getElevationForListingsWithCoordinates(listings));
  
  fs.writeFileSync(
    "./output/temp/new_listings_with_details.json",
    JSON.stringify(newListingsWithElevation, null, 2)
  );

  /* insert new listings into the database */
  await insertListings(newListingsWithElevation);


  /* DELETED LISTINGS */

  /* remove deleted listings from the database */
  await deleteListings(toDelete);


  /* finally, create a featureCollection of all listings and save it to public folder */
  const allListings = await getAllListings();
  const featureCollection = await mapListingsToFeatureCollection(allListings);

  console.log("writing to file");
  fs.writeFileSync(
    "./public/listings_feature_collection.json",
    JSON.stringify(featureCollection, null, 2)
  );

  console.log(`Update completed at ${getTimeStamp()}`);
}
