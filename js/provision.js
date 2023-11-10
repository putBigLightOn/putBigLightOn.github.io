import sendMessage from "./message.js";
import Provisioner from "./provisioner.js";

/**
 * @param {Event} event
 */
export async function provisionDevice(event) {
  const provisionButton = /** @type {HTMLButtonElement} */(event.target);
  provisionButton.disabled = true;
  provisionButton.innerHTML = 'Adding Device';

  let device;
  try {
    const MESH_PROVISIONING_SERVICE = '00001827-0000-1000-8000-00805f9b34fb';
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [MESH_PROVISIONING_SERVICE] }],
    });
  } catch (error) {
    if (error instanceof DOMException) {
      sendMessage(error.message);
    }
    provisionButton.innerHTML = 'Add Device';
    provisionButton.disabled = false;
    return;
  }

  if (typeof device.gatt === 'undefined') {
    sendMessage('No GATT server found');
    provisionButton.innerHTML = 'Add Device';
    provisionButton.disabled = false;
    return;
  }

  let provisioningDataIn;
  let provisioningDataOut;

  try {
    const PROVISIONING_SERVICE = '00001827-0000-1000-8000-00805f9b34fb';
    const PROVISIONING_DATA_IN = '00002adb-0000-1000-8000-00805f9b34fb';
    const PROVISIONING_DATA_OUT = '00002adc-0000-1000-8000-00805f9b34fb';
    const gattServer = await device.gatt.connect()
    const provisioningService = await gattServer.getPrimaryService(PROVISIONING_SERVICE);
    provisioningDataOut = await provisioningService.getCharacteristic(PROVISIONING_DATA_OUT);
    provisioningDataIn = await provisioningService.getCharacteristic(PROVISIONING_DATA_IN);
  } catch (error) {
    if (error instanceof DOMException) {
      sendMessage(error.message);
    }
    provisionButton.innerHTML = 'Add Device';
    provisionButton.disabled = false;
    return;
  }

  const provisioner = new Provisioner(provisioningDataIn, provisioningDataOut, provisionButton);
  await provisioner.sendInvite();
}
