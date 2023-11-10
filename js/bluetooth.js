import sendMessage from './message.js';
import Proxy from './proxy.js';
import { proxyPDU, mesh } from './mesh.js';
import Device from './device.js';

export default class BluetoothController {

  /** @type {HTMLTableSectionElement} */
  #tableBody

  constructor() {
    const table = document.createElement('table');
    table.id = "bluetooth-controller";

    const header = document.createElement('th');
    header.colSpan = 3;
    header.innerText = "Known Devices";

    table.createTHead().insertRow().append(header);
    this.#tableBody = table.createTBody();
    this.#tableBody.id = "known-devices";

    const footer = document.createElement('th');
    footer.colSpan = 2;
    footer.innerText = "Scan for new devices:";

    const row = table.createTFoot().insertRow();
    row.append(footer);
    const scanForDevicesButton = document.createElement('button');
    scanForDevicesButton.innerText = 'Scan';
    scanForDevicesButton.addEventListener('click', this.#scanForDevices);
    row.insertCell().append(scanForDevicesButton);
  }

  async displayKnownDevices() {

    const devices = await navigator.bluetooth.getDevices();

    for (const device of devices) {
      if (typeof device.gatt === 'undefined') {
        device.forget();
        continue;
      }

      this.#addToKnownDevices(device.gatt, this.#tableBody);
    }

    document.getElementsByTagName('header')[0].prepend(table);
  }

  #scanForDevices() {
  }

  /**
   * @param {BluetoothRemoteGATTServer} gattServer
   * @param {HTMLTableSectionElement} table
   * @returns {void}
   */
  #addToKnownDevices(gattServer, table) {
    const row = table.insertRow(0);
    row.insertCell().innerText = gattServer.device.name ?? gattServer.device.id;
    row.id = gattServer.device.id;

    const provisionButton = document.createElement('button');
    provisionButton.innerText = "Provision";
    row.insertCell().append(provisionButton);

    const forgetButton = document.createElement('button');
    forgetButton.innerText = "Forget";
    row.insertCell().append(forgetButton);

    new Device(gattServer, provisionButton, forgetButton, row);
  }
}

export async function displayBluetooth() {
  const table = document.createElement('table');
  const header = document.createElement('th');
  header.colSpan = 3;
  header.innerText = "Known Devices";
  table.createTHead().insertRow().append(header);
  const tableBody = table.createTBody();
  const devices = await navigator.bluetooth.getDevices();

  for (const device of devices) {
    if (typeof device.gatt !== 'undefined') {
      addToKnownDevices(device.gatt, tableBody);
    } else {
      device.forget();
    }
  }

  const row = tableBody.insertRow();
  row.insertCell().innerText = "Scan for new devices: ";
  const scanForDevicesButton = document.createElement('button');
  scanForDevicesButton.innerText = "Scan";
  scanForDevicesButton.addEventListener('click', () => scanForDevices(scanForDevicesButton, tableBody));
  row.insertCell();
  row.insertCell().append(scanForDevicesButton);
  document.getElementsByTagName('header')[0].prepend(table);
  const button = document.createElement('button');
  button.innerHTML = "Event listener removal test";
  const proxy = new Proxy();
  button.addEventListener('click', proxy);
  document.getElementsByTagName('main')[0].append(button);
}

/**
@param {HTMLButtonElement} button
@param {HTMLTableSectionElement} table
@returns {Promise<void>}
*/
async function scanForDevices(button, table) {
  button.disabled = true;
  button.innerText = "Scanning";
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [mesh.provisioning.uuid] }],
      optionalServices: [
        mesh.proxy.uuid,
      ]
    });

    if (typeof device.gatt !== 'undefined') {
      const connectButton = addToKnownDevices(device.gatt, table);
      connectToDevice(device.gatt, connectButton);
    } else {
      throw new DOMException("No GATT Server found")
    }

  } catch (error) {
    if (error instanceof DOMException) {
      sendMessage(error.message);
    }
  } finally {
    button.innerText = "Scan";
    button.disabled = false;
  }
}

/**
@param {BluetoothRemoteGATTServer} gattServer
@param {HTMLButtonElement} connectButton
@returns {Promise<void>}
*/
async function connectToDevice(gattServer, connectButton) {
  sendMessage("Connecting", 3000);
  try {
    gattServer = await gattServer.connect()
    const provisioningService = await gattServer.getPrimaryService(mesh.provisioning.uuid);

    console.log("Get data out characteristic");
    const provisioningDataOut = await provisioningService.getCharacteristic(mesh.provisioning.characteristic.dataOut);
    const provisioningPDU = provisioningInvitePDU();

    console.log(provisioningPDU.toString());
    console.log("Add event listener");
    // const provisioner = new Provisioner();
    provisioningDataOut.addEventListener("characteristicvaluechanged", provisioningResponse);
    provisioningDataOut.startNotifications();

    connectButton.innerText = "Disconnect";
    const controller = new AbortController();

    // @ts-ignore
    gattServer.device.addEventListener(
      "gattserverdisconnected",
      () => onDisconnected(connectButton, controller),
      { signal: controller.signal }
    );

    const provisioningDataIn = await provisioningService.getCharacteristic(mesh.provisioning.characteristic.dataIn);
    await provisioningDataIn.writeValueWithoutResponse(provisioningPDU.buffer);

  } catch (error) {
    if (error instanceof DOMException) {
      sendMessage(error.message);
    }
  }
}

/**
@param {Event} event
@return {void}
*/
function provisioningResponse(event) {
  const packet = /**@type {BluetoothRemoteGATTCharacteristic}*/(event.target).value;
  if (!(packet instanceof DataView)) return;

  const proxyPDU = new Uint8Array(packet.buffer);
  console.log(proxyPDU.toString());
  const firstOctet = proxyPDU.at(0);
  const data = proxyPDU.subarray(1);

  if (firstOctet === undefined) return;

  const SAR = firstOctet >> 6;
  const messageType = firstOctet & 0b00111111;

  console.log("Expected a Provisioning PDU, but received:");
  switch (messageType) {
    case 0x00: // Network PDU
      console.log("Network PDU"); break;
    case 0x01: // Mesh Beacon
      console.log("Mesh Beacon"); break;
    case 0x02: // Proxy Configuration
      console.log("Proxy Configuration"); break;
    case 0x03: // Provisioning PDU
    // this.#readProvisioningPDU(data, SAR); return;
    default: // Reserved for Future Use (FRU)
      console.log("Reserved for Future Use (RFU): " + messageType.toString(16));
  }
  // switch (SAR) {
  //   case proxyPDU.SAR.complete:
  //     console.log("Complete proxy message");
  //     readCapabilities(array.subarray(1));
  //     break;
  //   case proxyPDU.SAR.first:
  //   case proxyPDU.SAR.continuation:
  //   case proxyPDU.SAR.last: console.log("Not implemented"); break;
  // }
}

/**
 * @param {Uint8Array} provisioningPDU
 * @return {void}
 */
function readCapabilities(provisioningPDU) {
  const type = provisioningPDU.at(1);
  if (type !== undefined) {
  }
}

/**
 * @return {Uint8Array}
 */
function provisioningInvitePDU() {
  const PROVISIONING_INVITE = 0x00;
  const ATTENTION_DURATION = 0x00;
  const PDU = new Uint8Array(3);
  PDU.set([PROVISIONING_INVITE, ATTENTION_DURATION], 1);
  proxyPDUfunc(PDU, proxyPDU.SAR.complete);
  return PDU;
}

/**
 * @typedef {(typeof proxyPDU.SAR)[keyof typeof proxyPDU.SAR]} SARTypes
 * @param {Uint8Array} PDU
 * @param {SARTypes} SAR 
 * @return {void}
 */
function proxyPDUfunc(PDU, SAR) {
  PDU.set([(SAR << 6) + proxyPDU.messageType.provisioningPDU]);
}

/**
@param {BluetoothRemoteGATTServer} gattServer
@param {HTMLTableSectionElement} table
@returns {HTMLButtonElement}
*/
function addToKnownDevices(gattServer, table) {
  const row = table.insertRow(0);
  row.insertCell().innerText = gattServer.device.name ?? gattServer.device.id;
  row.id = gattServer.device.id;
  const connectButton = document.createElement('button');
  connectButton.innerText = "Connect";
  connectButton.addEventListener('click', () => connectToGATTServer(gattServer, connectButton));
  row.insertCell().append(connectButton);

  const forgetButton = document.createElement('button');
  forgetButton.innerText = "Forget";
  forgetButton.addEventListener('click', () => forgetDevice(forgetButton, row, gattServer))
  row.insertCell().append(forgetButton);

  return connectButton;
}

/**
@param {BluetoothRemoteGATTServer} gattServer
@param {HTMLButtonElement} connectButton
@returns {Promise<void>}
*/
async function connectToGATTServer(gattServer, connectButton) {
  connectButton.disabled = true;
  if (gattServer.connected) {
    sendMessage("Disconnecting", 3000);
    gattServer.disconnect();
    sendMessage("Disconnected", 3000);
    connectButton.innerText = "Connect";
  } else {
    try {
      connectToDevice(gattServer, connectButton);
    } catch (error) {
      if (error instanceof DOMException) {
        sendMessage(error.message);
      }
    } finally {
      connectButton.disabled = false;
    }
  }
  connectButton.disabled = false;
}

/**
 * @param {HTMLButtonElement} button
 * @param {HTMLTableRowElement} row
 * @param {BluetoothRemoteGATTServer} gattServer
 * @returns {void}
 **/
function forgetDevice(button, row, gattServer) {
  button.disabled = true;
  if (gattServer.connected) {
    gattServer.disconnect();
  }
  gattServer.device.forget();
  button.innerText = "Removed";
  setTimeout(() => row.remove(), 600);
}

/**
@param {HTMLButtonElement} button
@param {AbortController} controller
*/
function onDisconnected(button, controller) {
  button.innerText = "Connect";
  // dashboard.remove();
  controller.abort();
  sendMessage("Device disconnected", 3000);
}
