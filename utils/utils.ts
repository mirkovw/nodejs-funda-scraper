import { Listing } from "../types/types";

export function getChunks<T>(array: T[], size: number): T[][] {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function isValidAddress(listing: Listing) {
  // is valid streetnamne
  if (listing.streetName === "") {
    console.log(listing.streetName);
    return false;
  }

  // has full postcode
  const split = listing.postalCodeCity.split(" ");
  if (split[0].length !== 4 || split[1].length !== 2 || split.length < 3) {
    return false;
  }

  // has place
  if (split.slice(2).join(" ") === "") {
    return false;
  }

  return true;
}

/**
 * replaces characters in string to create a url friendly string
 * @param string
 * @returns string
 */
export function createUrlFriendlyString(string: string) {
  return string
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll("'", "")
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "");
}

/**
 *
 * @param allIndexes
 * @param numberOfNodes
 * @returns an array of arrays with indexes for each node
 */

export function getNodeArrays(allIndexes: number, numberOfNodes: number) {
  const pagesPerNode = Math.ceil(allIndexes / numberOfNodes);

  const nodeArrays = Array.from({ length: numberOfNodes }, (_, i) => {
    const start = i * pagesPerNode + 1;
    const end = Math.min((i + 1) * pagesPerNode, allIndexes);

    let array = [];
    for (i = start; i <= end; i++) {
      array.push(i);
    }
    return array;
  });

  return nodeArrays;
}
