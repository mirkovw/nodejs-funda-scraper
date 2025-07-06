import { MongoClient } from "mongodb";
import { Listing, ListingWithElevation } from "../types/types";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = "funda-scraper";

let client: MongoClient;

export async function connectToDatabase() {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }
  return client.db(dbName);
}

export async function getListingsCollection() {
  const db = await connectToDatabase();
  return db.collection<ListingWithElevation>("listings");
}

export async function getAllListings() {
  const collection = await getListingsCollection();
  return collection.find().toArray();
}

export async function insertListings(listings: ListingWithElevation[]) {
  const collection = await getListingsCollection();
  if (listings.length === 0) return;
  return collection.insertMany(listings);
}

export async function deleteListings(listings: Listing[]) {
  const collection = await getListingsCollection();
  const ids = listings.map((listing) => listing.id);
  if (ids.length === 0) return;
  return collection.deleteMany({ id: { $in: ids } });
}

export async function getListingsById(ids: string[]) {
  const collection = await getListingsCollection();
  return collection.find({ id: { $in: ids } }).toArray();
}

export async function getListingsMapByIdFromDb() {
  const listings = await getAllListings();
  const listingsById = new Map<string, ListingWithElevation>();
  listings.forEach((listing) => {
    listingsById.set(listing.id, listing);
  });
  return listingsById;
}
