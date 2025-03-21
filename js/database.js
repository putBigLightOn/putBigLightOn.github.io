const DB_NAME = 'MeshNetworks';
const OBJ_STR_NETWORKS = 'Networks';

/**
 * @param {IDBVersionChangeEvent} event
 * @return {void}
 */
export function databaseUpgrade(event) {
  // let objectStore;
  //
  const db = /** @type {IDBOpenDBRequest}*/(event.target).result;
  let networks;
  if (!db.objectStoreNames.contains(OBJ_STR_NETWORKS)) {
    networks = db.createObjectStore(OBJ_STR_NETWORKS);
  }
}

/**
 * @param {Event} event
 */
export function lookupNetworkKey(event) {
  if (!(event.target instanceof IDBOpenDBRequest))
    return;

  const db = event.target.result;
  event.target.removeEventListener("success", lookupNetworkKey);
  event.target.removeEventListener("error", databaseOpenError);
  event.target.removeEventListener("upgradeneeded", databaseUpgrade);
  db.transaction
}

/**
 * @param {Event} event
 */
export function databaseOpenError(event) {
  const db = /** @type {IDBOpenDBRequest}*/(event.target).result;
}
