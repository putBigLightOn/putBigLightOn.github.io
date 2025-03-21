import { provisionDevice } from './provision.js';
import { databaseUpgrade, lookupNetworkKey, databaseOpenError }
  from './database.js';

/*
if (document.readyState == 'loading') {
  document.addEventListener('DOMContentLoaded', checkBluetoothAvailability);
} else {
  checkBluetoothAvailability();
}
*/

async function checkBluetoothAvailability() {
  const message = /** @type {HTMLParagraphElement} */
    (document.getElementById('error-message'));

  const fix = /** @type {HTMLParagraphElement} */
    (document.getElementById('error-fix'));

  if (!("bluetooth" in navigator)) {
    message.innerText = "This browser doesn't support Bluetooth,\
      but it might be available as an experimental feature";

    fix.innerText = 'For the Chrome browser go to\
      chrome://flags#enable-experimental-web-platform-features\
      in the address bar and select enable.';

    return;
  }

  const bluetoothAvailable = await navigator.bluetooth.getAvailability();

  if (!bluetoothAvailable) {
    message.innerText = "Your phone or computer's bluetooth\
      appears to be switched off.";

    fix.innerText = "Switch Bluetooth on and reload the page";

    return;
  }

  const errors = /** @type {HTMLDivElement} */
    (document.getElementById('errors'));
  errors.remove();

  const request = window.indexedDB.open("MeshNetworks", 1);
  request.addEventListener("upgradeneeded", databaseUpgrade);
  request.addEventListener("success", lookupNetworkKey);
  request.addEventListener("error", databaseOpenError);

  const provisionButton = /** @type {HTMLButtonElement} */
    (document.getElementById('provision-device'));

  provisionButton.addEventListener('click', provisionDevice);
  provisionButton.disabled = false;
}

checkBluetoothAvailability();
