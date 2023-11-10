import { proxyPDU } from "./mesh.js";
import sendMessage from "./message.js";

const SAR_COMPLETE = 0b00;

const BTM_ECDH_P256_CMAC_AES128_AES_CCM = 1 << 0;
const BTM_ECDH_P256_CMAC_SHA256_AES_CCM = 1 << 1;

export default class Provision {

  /** @type {BluetoothRemoteGATTCharacteristic} */
  #provisioningDataIn;

  /** @type {BluetoothRemoteGATTCharacteristic} */
  #provisioningDataOut;

  /** @type {HTMLButtonElement} */
  #provisionButton;

  /** @type {CryptoKey | undefined} */
  #publicKey;

  /** @type {CryptoKey | undefined} */
  #privateKey;

  /** @type {CryptoKey | undefined} */
  #deviceKey;

  /**
   * @param {BluetoothRemoteGATTCharacteristic} provisioningDataIn
   * @param {BluetoothRemoteGATTCharacteristic} provisioningDataOut
   * @param {HTMLButtonElement} provisionButton
   */
  constructor(provisioningDataIn, provisioningDataOut, provisionButton) {
    this.#provisioningDataIn = provisioningDataIn;
    this.#provisioningDataOut = provisioningDataOut;
    this.#provisionButton = provisionButton;

    this.#provisioningDataOut.addEventListener("characteristicvaluechanged", this);
  }

  async sendInvite() {
    await this.#provisioningDataOut.startNotifications();
    const provisioningPDU = this.#provisioningInvitePDU();
    await this.#provisioningDataIn.writeValueWithoutResponse(provisioningPDU.buffer);
  }

  /**
   * @param {Event} event
   */
  async handleEvent(event) {
    const proxyPDU = /**@type {BluetoothRemoteGATTCharacteristic}*/(event.target).value;
    if (!(proxyPDU instanceof DataView)) {
      sendMessage('No data received');
      this.#abortProvisioning();
      return;
    }

    const proxyPDUarray = new Uint8Array(proxyPDU.buffer);
    console.log(proxyPDUarray.toString());
    const firstOctet = proxyPDU.getUint8(0);

    if (firstOctet === undefined) {
      this.#abortProvisioning();
      return;
    }

    const SAR = firstOctet >> 6;
    const messageType = firstOctet & 0b00111111;
    const PROVISIONING_PDU = 0x03;

    if (messageType !== PROVISIONING_PDU) {
      sendMessage('Unexpected message type');
      this.#abortProvisioning();
      return;
    }

    if (SAR !== 0b00) {
      sendMessage('Received segmented message, this is not implemented');
      this.#abortProvisioning();
      return;
    }

    await this.#readProvisioningPDU(proxyPDU);
  }

  #abortProvisioning() {
    this.#provisioningDataOut.removeEventListener('characteristicvaluechange', this);
    this.#provisioningDataIn.service.device.gatt?.disconnect();
    this.#provisionButton.innerHTML = 'Add Device';
    this.#provisionButton.disabled = false;
  }

  /**
   * @param {DataView} proxyPDU
   * @return {Promise<void>}
   */
  async #readProvisioningPDU(proxyPDU) {
    const provisioningPDUType = proxyPDU.getInt8(1) & 0b00111111;
    switch (provisioningPDUType) {
      case 0x01: // Provisioning Capabilites
        await this.#readCapabilities(proxyPDU);
        return;
      case 0x03: // Provisioning Public Key
        sendMessage('Received Provisioning Public Key');
        this.#importDevicePublicKey(proxyPDU);
        return;
      case 0x04: // Provisioning Input Complete
        sendMessage('Provisioning Input Complete');
        return;
      case 0x09: // Provisioning Failed
        this.#readFailure(proxyPDU);
        return;
    }
  }

  /**
   * @param {DataView} proxyPDU
   * @return {Promise<void>}
   */
  async #readCapabilities(proxyPDU) {
    const numberOfElements = proxyPDU.getUint8(2);
    sendMessage('Number of Elements: ' + numberOfElements.toString(), 3000);

    const publicKeyType = proxyPDU.getUint8(5);

    let publicKey = 0x00;
    let algorithm = 0x00;
    let authenticationMethod = 0x00;
    let authenticationAction = 0x00;
    let authenticationSize = 0x00;

    if (publicKeyType & 0b00000001) {
      sendMessage('Public Key OOB available but not implemented');
    }

    const algorithms = proxyPDU.getUint16(3);

    if (algorithms & BTM_ECDH_P256_CMAC_AES128_AES_CCM) {
      sendMessage('AES128 available');
      algorithm = 0x00;
    }

    if (algorithms & BTM_ECDH_P256_CMAC_SHA256_AES_CCM) {
      sendMessage('SHA256 available but not implemented');
      // algorithm = 0x01;
    }

    const provisioningStartPDU = this.#provisioningStartPDU(
      algorithm,
      publicKey,
      authenticationMethod,
      authenticationAction,
      authenticationSize,
    );

    await this.#provisioningDataIn.writeValueWithoutResponse(provisioningStartPDU.buffer);

    const provisioningPublicKeyPDU = await this.#provisioningPublicKeyPDU();
    await this.#provisioningDataIn.writeValueWithoutResponse(provisioningPublicKeyPDU.buffer);
  }

  /**
   * @param {DataView} proxyPDU
   * @return {void}
   */
  #readFailure(proxyPDU) {
    let message = 'Unknown';
    const errorCode = proxyPDU.getUint8(2);
    switch (errorCode) {
      case 0x00: message = 'Prohibited'; break;
      case 0x01: message = 'Invalid PDU'; break;
      case 0x02: message = 'Invalid Format'; break;
      case 0x03: message = 'Unexpected PDU'; break;
      case 0x04: message = 'Confirmation Failed'; break;
      case 0x05: message = 'Out of Resources'; break;
      case 0x06: message = 'Decryption Failed'; break;
      case 0x07: message = 'Unexpected Error'; break;
      case 0x08: message = 'Cannot Assign Addresses'; break;
      case 0x09: message = 'Invalid Data'; break;
      default: message = 'RFU';
    }
    sendMessage("Provisioning Failed: " + message);
    this.#abortProvisioning();
  }

  /**
   * @return {Uint8Array}
   */
  #provisioningInvitePDU() {
    const PROVISIONING_INVITE = 0x00;
    const ATTENTION_DURATION = 0x00;
    const PDU = new Uint8Array(3);
    PDU.set([PROVISIONING_INVITE, ATTENTION_DURATION], 1);
    this.#proxyPDUfunc(PDU, SAR_COMPLETE);
    return PDU;
  }

  /**
   * @param {number} algorithm
   * @param {number} publicKey
   * @param {number} authenticationMethod
   * @param {number} authenticationAction
   * @param {number} authenticationSize
   * @return {Uint8Array}
   */
  #provisioningStartPDU(algorithm, publicKey, authenticationMethod, authenticationAction, authenticationSize) {
    const PROVISIONING_START = 0x02;
    const PDU = new Uint8Array(7);
    PDU.set([PROVISIONING_START, algorithm, publicKey, authenticationMethod, authenticationAction, authenticationSize], 1);
    this.#proxyPDUfunc(PDU, SAR_COMPLETE);
    return PDU
  }

  /**
   * @return {Promise<Uint8Array>}
   */
  async #provisioningPublicKeyPDU() {
    const PDU = new Uint8Array(66);
    const PROVISIONING_PUBLIC_KEY = 0x03;
    PDU.set([PROVISIONING_PUBLIC_KEY], 1);

    const key = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );

    this.#publicKey = key.publicKey;
    this.#privateKey = key.privateKey;

    const publicKeyBuffer = await crypto.subtle.exportKey("raw", this.#publicKey);
    const publicKeyArray = new Uint8Array(publicKeyBuffer);
    PDU.set(publicKeyArray.slice(1), 2);

    this.#proxyPDUfunc(PDU, SAR_COMPLETE);
    return PDU
  }

  /**
   * @param {DataView} proxyPDU
   * @return {Promise<void>}
   */
  async #importDevicePublicKey(proxyPDU) {

    const proxyPDUArray = new Uint8Array(proxyPDU.buffer);
    const rawKeyInput = new Uint8Array(65);

    // PDF: https://www.secg.org/sec1-v2.pdf
    // According to Section 2.3.3 Elliptic-Curve-Point-to-Octet-String Conversion the
    // first byte needs to be set to indicate that point compression is off, "Actions"
    // step 3.3 says that it needs to be set to 4 without any explanation as to why 4.
    rawKeyInput.set([4]);
    rawKeyInput.set(proxyPDUArray.slice(2), 1);
    this.#deviceKey = await crypto.subtle.importKey("raw", rawKeyInput, {name: "ECDH", namedCurve: "P-256"}, false, ["deriveBits"]);

  }

  /**
   * @typedef {(typeof proxyPDU.SAR)[keyof typeof proxyPDU.SAR]} SARTypes
   * @param {Uint8Array} PDU
   * @param {SARTypes} SAR 
   * @return {void}
   */
  #proxyPDUfunc(PDU, SAR) {
    const PROVISIONING_PDU = 0x03;
    PDU.set([(SAR << 6) + PROVISIONING_PDU]);
  }
}
