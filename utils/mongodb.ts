import env from "env-var";
import isEqual from "lodash.isequal";
import { AnyBulkWriteOperation, MongoClient, ServerApiVersion } from "mongodb";
import { DbUpdate, Listing } from "../types/types";

const uri = env.get("MONGO_URI").required().asString();

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

export async function getDbListings() {
  await client.connect();
  const collection = client.db("listings_app").collection<Listing>("listings");
  const listings = await collection.find({}).toArray();
  await client.close();

  return listings;
}

export async function updateListingsInDb({
  toInsert,
  toDelete,
  toUpdate,
}: DbUpdate) {
  await client.connect();
  const collection = client.db("listings_app").collection<Listing>("listings");

  console.log("to delete", toDelete.length);
  console.log("to update", toUpdate.length);
  console.log("to insert", toInsert.length);

  const bulkOperations = getBulkOperations(toUpdate, toInsert, toDelete);

  if (bulkOperations.length > 0) {
    console.log("Updating db...");
    await collection.bulkWrite(bulkOperations);
  }

  console.log("Closing connection to MongoDB...");
  await client.close();
}

export function getListingsMapById(listings: Listing[]) {
  const listingsById = new Map<string, Listing>();
  listings.forEach((listing) => {
    listingsById.set(listing.id, listing);
  });

  return listingsById;
}

export function getChanges(
  localListingsById: Map<string, Listing>,
  dbListingsById: Map<string, Listing>
) {
  const toUpdate: Listing[] = [];
  const toInsert: Listing[] = [];
  const toDelete: Listing[] = [];

  localListingsById.forEach((listing, id) => {
    if (dbListingsById.has(id)) {
      const dbListing: Partial<Listing> = { ...dbListingsById.get(id) };
      delete (dbListing as any)._id;
      delete dbListing.coordinates;
      delete dbListing.elevation;

      if (!isEqual(dbListing, listing)) {
        console.log("SOMETHING CHANGED");
        console.log(dbListing);
        console.log(listing);
        toUpdate.push(listing);
      }
    } else {
      toInsert.push(listing);
    }
  });

  dbListingsById.forEach((listing, id) => {
    if (!localListingsById.has(id)) {
      toDelete.push(listing);
    }
  });

  return { toUpdate, toInsert, toDelete };
}

export function getBulkOperations(
  toUpdate: Listing[],
  toInsert: Listing[],
  toDelete: Listing[]
): AnyBulkWriteOperation<Listing>[] {
  const bulkOperations: AnyBulkWriteOperation<Listing>[] = [];

  if (toUpdate.length > 0) {
    toUpdate.forEach((listing) => {
      bulkOperations.push({
        updateOne: {
          filter: { id: listing.id },
          update: { $set: listing },
        },
      });
    });
  }

  if (toInsert.length > 0) {
    toInsert.forEach((listing) => {
      bulkOperations.push({
        insertOne: {
          document: listing,
        },
      });
    });
  }

  if (toDelete.length > 0) {
    toDelete.forEach((listing) => {
      bulkOperations.push({
        deleteOne: {
          filter: { id: listing.id },
        },
      });
    });
  }

  return bulkOperations;
}
