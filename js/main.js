import sendMessage from './message.js';
import { provisionDevice } from './provision.js';
import { databaseUpgrade, lookupNetworkKey } from './database.js';

if (document.readyState == 'loading') {
  document.addEventListener('DOMContentLoaded', checkBluetoothAvailability);
} else {
  checkBluetoothAvailability();
}

async function checkBluetoothAvailability() {
  if (!("bluetooth" in navigator)) {
    sendMessage("This browser doesn't support Bluetooth, but it might be available as an experimental feature");
    sendMessage('For the Chrome browser go to chrome://flags#enable-experimental-web-platform-features in the address bar and select enable.');
    return;
  }

  const bluetoothAvailable = await navigator.bluetooth.getAvailability();

  if (!bluetoothAvailable) {
    sendMessage("Switch your computer or phone's Bluetooth on and reload the page");
    return;
  }

  const request = window.indexedDB.open("MeshNetworks", 1);
  request.addEventListener("upgradeneeded", databaseUpgrade);
  request.addEventListener("success", lookupNetworkKey);

  const provisionButton = /** @type {HTMLButtonElement} */(document.getElementById('provision-device'));
  provisionButton.addEventListener('click', provisionDevice);
  provisionButton.disabled = false;
}
