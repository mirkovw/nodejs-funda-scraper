import fs from "fs";
import { municipalities } from "../data/municipalities";
import { FeatureCollection, Listing, ListingWithElevation } from "../types/types";
import { getElevationForListingsWithCoordinates } from "../utils/elevation";
import {
  getAllListingsFromFunda,
  getListingDetails,
  getTypedListingsMapById,
  getUpdates,
  mapListingsToFeatureCollection
} from "../utils/listings";
import { deleteListings, getAllListings, getListingsMapByIdFromDb, insertListings } from "../utils/mongodb";
import { getTimeStamp } from "../utils/utils";

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

  /* determine which listings are new, or deleted */
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
