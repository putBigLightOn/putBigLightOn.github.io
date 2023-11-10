import sendMessage from './message.js';
import Provision from './provisioner.js';

export default class Device {

  /** @type {BluetoothRemoteGATTServer} */
  #gattServer;

  /** @type {HTMLButtonElement} */
  #provisionButton;

  /** @type {HTMLButtonElement} */
  #forgetButton;

  /** @type {HTMLTableRowElement} */
  #row;

  /**
   * @param {BluetoothRemoteGATTServer} gattServer
   * @param {HTMLButtonElement} provisionButton
   * @param {HTMLButtonElement} forgetButton
   * @param {HTMLTableRowElement} row
   */
  constructor(gattServer, provisionButton, forgetButton, row) {
    this.#gattServer = gattServer;
    this.#provisionButton = provisionButton;
    this.#forgetButton = forgetButton;
    this.#row = row;

    provisionButton.addEventListener('click', this.#provision);
    forgetButton.addEventListener('click', this.#forgetDevice);
  }

  async #provision() {
    this.#provisionButton.disabled = true;

    if (this.#gattServer.connected) {
      this.#gattServer.disconnect();
      this.#provisionButton.innerHTML = 'Provision';
      this.#provisionButton.disabled = false;
      return;
    }

    let provisioningDataIn;
    let provisioningDataOut;

    try {
      const PROVISIONING_SERVICE = '00001827-0000-1000-8000-00805f9b34fb';
      const PROVISIONING_DATA_IN = '00002adb-0000-1000-8000-00805f9b34fb';
      const PROVISIONING_DATA_OUT = '00002adc-0000-1000-8000-00805f9b34fb';
      await this.#gattServer.connect();
      const provisioningService = await this.#gattServer.getPrimaryService(PROVISIONING_SERVICE);
      provisioningDataOut = await provisioningService.getCharacteristic(PROVISIONING_DATA_OUT);
      provisioningDataIn = await provisioningService.getCharacteristic(PROVISIONING_DATA_IN);
    } catch (error) {
      if (error instanceof DOMException) sendMessage(error.message);
      this.#provisionButton.disabled = false;
      return;
    }
    
    const provisioner = new Provision(provisioningDataIn, provisioningDataOut);
    await provisioner.sendInvite();

    this.#provisionButton.disabled = false;
  }

  #forgetDevice() {
    this.#forgetButton.disabled = true;
    if (this.#gattServer.connected) {
      this.#gattServer.disconnect();
    }
    this.#gattServer.device.forget();
    this.#forgetButton.innerText = "Removed";
    setTimeout(() => this.#row.remove(), 600);
  }
}
