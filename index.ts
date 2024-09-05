import "dotenv/config";
import express from "express";
import fs from "fs";
import isEqual from "lodash.isequal";
import { municipalities } from "./data/municipalities";
import { GeoCodeResult, Listing } from "./types/types";
import { getElevationForListingsWithCoordinates } from "./utils/elevation";
import {
  getCoordinatesForListings,
  getCoordinatesForListings2,
} from "./utils/geocoding";
import {
  getAllListingsFromFunda,
  getListingDetails,
  mapListingsToFeatureCollection,
} from "./utils/listings";
import {
  getChanges,
  getDbListings,
  getListingsMapById,
  updateListingsInDb,
} from "./utils/mongodb";

(async () => {
  // startServer();
  runUpdate2();
  // scheduleCronJobs(); // TODO implement

  // const listings = JSON.parse(
  //   fs.readFileSync("./output/listings.json", "utf-8")
  // ) as Listing[];

  // // console.log(listings[0]);

  // const featureCollection = await mapListingsToFeatureCollection(listings);

  // fs.writeFileSync(
  //   "./public/listings.json",
  //   JSON.stringify(featureCollection, null, 2)
  // );

  // const allFundaListings = await getAllListingsFromFunda(municipalities);
  // fs.writeFileSync(
  //   "./output/allFundaListings.json",
  //   JSON.stringify(allFundaListings, null, 2)
  // );

  // const allFundaListings = JSON.parse(
  //   fs.readFileSync("./output/allFundaListings.json", "utf-8")
  // ) as Listing[];

  // const listingsWithDetails = await getListingDetails(allFundaListings);

  // fs.writeFileSync(
  //   "./output/listingsDetails.json",
  //   JSON.stringify(listingsWithDetails, null, 2)
  // );

  // const listingsWithDetails = JSON.parse(
  //   fs.readFileSync("./output/listingsDetails.json", "utf-8")
  // );

  // const listingsWithElevation = await getElevationForListingsWithCoordinates(
  //   listingsWithDetails
  // );

  // fs.writeFileSync(
  //   "./output/listings.json",
  //   JSON.stringify(listingsWithElevation, null, 2)
  // );

  // return;
})();

export function startServer() {
  let updateRunning = false;
  const app = express();
  app.use(express.static("public"));

  app.get("/run-full-update", (req, res) => {
    if (!updateRunning) {
      updateRunning = true;
      runUpdate().then(() => {
        console.log("update done");
        updateRunning = false;
      });
    } else {
      res.send("update already running");
    }

    res.send("Running full update, should take a few minutes");
  });

  const port = 3000;
  app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
  });
}

export async function runUpdate2() {
  const savedListings =
    (fs.existsSync("./output/listings.json") &&
      (JSON.parse(
        fs.readFileSync("./output/listings.json", "utf-8")
      ) as Listing[])) ||
    [];

  const savedListingsById = getListingsMapById(savedListings);

  /* get all current listings from funda */
  const newListings = await getAllListingsFromFunda(municipalities);
  fs.writeFileSync(
    "./output/newListings.json",
    JSON.stringify(newListings, null, 2)
  );

  const newListingsById = getListingsMapById(newListings);

  /* determine which listings are new, updated or deleted */
  const { toUpdate, toInsert, toDelete } = getChanges(
    newListingsById,
    savedListingsById
  );

  console.log(`toUpdate: ${toUpdate.length}`);
  console.log(`toInsert: ${toInsert.length}`);
  console.log(`toDelete: ${toDelete.length}`);

  /* add coordinates to new listings */
  const newListingsWithCoordinatesAndElevation = await getListingDetails(
    toInsert
  ).then((listings) => getElevationForListingsWithCoordinates(listings));

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

  /* finally, create a featureCollection of all listings and save it to public folder */
  const featureCollection = await mapListingsToFeatureCollection(
    newListingsWithCoordinatesAndElevation
  );

  console.log("writing to file");
  fs.writeFileSync(
    "./public/listings.json",
    JSON.stringify(featureCollection, null, 2)
  );

  console.log("all done");

  return;
}

export async function runUpdate() {
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

  // update listings geoJson for the map
  const updatedDbListings = await getDbListings();
  const featureCollection = await mapListingsToFeatureCollection(
    updatedDbListings
  );

  console.log("writing to file");
  fs.writeFileSync(
    "./public/listings.json",
    JSON.stringify(featureCollection, null, 2)
  );

  console.log("all done");
}
