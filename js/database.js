/**
 * @param {IDBVersionChangeEvent} event
 * @return {void}
 */
export function databaseUpgrade(event) {
  // let objectStore;
  const db = /** @type {IDBOpenDBRequest}*/(event.target).result;
  if (!db.objectStoreNames.contains("MeshNetworks")) {
    db.createObjectStore("MeshNetworks");
  }
}

/**
 * @param {Event} event
 */
export function lookupNetworkKey(event) {
  const db = /** @type {IDBOpenDBRequest}*/(event.target).result;
  db.transaction
}
