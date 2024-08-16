import "dotenv/config";
import fs from "fs";
import isEqual from "lodash.isequal";
import { municipalities } from "./data/municipalities";
import { Listing } from "./types/types";
import { getElevationForListingsWithCoordinates } from "./utils/elevation";
import { getCoordinatesForListings } from "./utils/geocoding";
import { getAllListingsFromFunda } from "./utils/listings";
import {
  getChanges,
  getDbListings,
  getListingsMapById,
  updateListingsInDb,
} from "./utils/mongodb";

(async () => {
  /* get all current listings from funda */
  const currentListings = await getAllListingsFromFunda(municipalities);
  fs.writeFileSync(
    "./output/localListings.json",
    JSON.stringify(currentListings, null, 2)
  );
  // const currentListings = JSON.parse(
  //   fs.readFileSync("./output/localListings.json", "utf-8")
  // ) as Listing[];

  const currentListingsById = getListingsMapById(currentListings);
  console.log(`local listings: `, currentListings.length);

  /* get saved listings from db */
  const dbListings = await getDbListings();
  const dbListingsById = getListingsMapById(dbListings);
  console.log(`db listings: `, dbListings.length);

  /* determine which listings are new, updated or deleted */
  const { toUpdate, toInsert, toDelete } = getChanges(
    currentListingsById,
    dbListingsById
  );

  /* add coordinates to new listings */
  const newListingsWithCoordinatesAndElevation =
    await getCoordinatesForListings(toInsert).then((listings) =>
      getElevationForListingsWithCoordinates(listings)
    );
  fs.writeFileSync(
    "./output/newListingsWithCoordinates.json",
    JSON.stringify(newListingsWithCoordinatesAndElevation, null, 2)
  );

  /* determine if the updated listings need new coordinates */
  const toUpdateChanges = toUpdate.map((listing) => {
    const dbListing = dbListingsById.get(listing.id) as Listing;

    const changedFields = Object.keys(listing).filter((key) => {
      return !isEqual(
        listing[key as keyof Listing],
        dbListing[key as keyof Listing]
      );
    });

    return {
      id: listing.id,
      changedFields,
    };
  });

  fs.writeFileSync(
    "./output/changes.json",
    JSON.stringify(toUpdateChanges, null, 2)
  );

  const toUpdateWithCoordinates = toUpdate.filter((listing) => {
    const changes = toUpdateChanges.find((change) => change.id === listing.id);

    if (changes === undefined) return false;

    return (
      changes.changedFields.includes("postalCodeCity") ||
      changes.changedFields.includes("streetName")
    );
  });

  /* add coordinates to update listings */
  const updatedListingsWithCoordinates = await getCoordinatesForListings(
    toUpdateWithCoordinates
  ).then((listings) => getElevationForListingsWithCoordinates(listings));

  /* merge updatedListingsWithCoordinates back into toUpdate */
  updatedListingsWithCoordinates.forEach((listing) => {
    const index = toUpdate.findIndex((l) => l.id === listing.id);
    toUpdate[index] = listing;
  });

  /* update listings in db */
  await updateListingsInDb({
    toInsert: newListingsWithCoordinatesAndElevation,
    toDelete,
    toUpdate,
  });

  console.log("all done");
})();
