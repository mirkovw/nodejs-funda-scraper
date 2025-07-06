import { Listing } from "../types/types";

export function getChunks<T>(array: T[], size: number): T[][] {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
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


type KeyValuePair = [string, number];
type DataElement = KeyValuePair | Record<string, number> | string | number | [];
type ParsedObject = Record<string, any>;

export function parseDataStructure(data: DataElement[]): any {
    const result: ParsedObject = {};
    let current = result;

    const cache: Map<number, any> = new Map(); // Cache to store already resolved indices

    function resolve(index: number): any {
        if (cache.has(index)) {
            return cache.get(index);
        }

        const item = data[index];

        let resolved: any;
        if (typeof item === 'object' && !Array.isArray(item)) {
            resolved = {};
            for (const [key, valIndex] of Object.entries(item)) {
                resolved[key] = resolve(valIndex);
            }
        } else {
            resolved = item;
        }

        cache.set(index, resolved);
        return resolved;
    }

    for (let i = 0; i < data.length; i++) {
        const item = data[i];

        if (Array.isArray(item) && item.length === 2 && typeof item[0] === "string") {
            const [key, index] = item;
            const obj = {};
            current[key] = obj;
            current = obj;
        } else if (typeof item === "object" && !Array.isArray(item)) {
            for (const [key, valIndex] of Object.entries(item)) {
                current[key] = resolve(valIndex);
            }
        }
    }

    return result;
}

export function getTimeStamp(): string {
  var tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
  var localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
  return localISOTime;  
}
export function getTimeStampWithOffset(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000; // offset in milliseconds
  const localDate = new Date(date.getTime() - offset);
  return localDate.toISOString();
}