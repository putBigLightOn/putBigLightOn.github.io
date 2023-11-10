import sendMessage from './message.js';
// import BluetoothController from './bluetooth.js';
import { provisionDevice } from './provision.js';

if (document.readyState == 'loading') {
  console.log("Adding initial event listener");
  document.addEventListener('DOMContentLoaded', checkBluetoothAvailability);
} else {
  checkBluetoothAvailability();
}

async function checkBluetoothAvailability() {
  if (!("bluetooth" in navigator)) {
    sendMessage("This browser doesn't support Bluetooth, but it might be available as an experimental feature");
    sendMessage('For the Chrome browser go to chrome://flags#enable-web-bluetooth in the address bar and select enable.');
    sendMessage('Additionally chrome://flags#enable-web-bluetooth-new-permissions-backend needs to be enabled.');
    return;
  }

  const bluetoothAvailable = await navigator.bluetooth.getAvailability();

  if (!bluetoothAvailable) {
    sendMessage("Switch your computer or phone's Bluetooth on and reload the page");
    return;
  }

  const provisionButton = /** @type {HTMLButtonElement} */(document.getElementById('provision-device'));
  provisionButton.addEventListener('click', provisionDevice);
  provisionButton.disabled = false;

  // const bluetooth = new BluetoothController();
  // await bluetooth.displayKnownDevices();
}
