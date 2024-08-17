import { proxyPDU } from "./mesh.js";
import sendMessage from "./message.js";
import { AES_CMAC, s1, k1, AES_CCM } from "./crypto.js";
import {databaseUpgrade} from "./database.js";

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

  // Invite(1) + Capabilities(11) + Start(5) + Provisioner X (32) + Provisioner Y (32)
  // + Device X (32) + Device Y (32)
  /** @type {Uint8Array} */
  #confirmationInputs = new Uint8Array(1 + 11 + 5 + 32 * 4);

  /** @type {CryptoKey | undefined} */
  #publicKey;

  /** @type {CryptoKey | undefined} */
  #privateKey;

  /** @type {CryptoKey | undefined} */
  #deviceKey;

  /** @type {Uint8Array} */
  #ECDHSecret = new Uint8Array(32);

  /** @type {Uint8Array} */
  #confirmationSalt = new Uint8Array(16);

  /** @type {Uint8Array} */
  #randomProvisioner = new Uint8Array(16);

  /** @type {Uint8Array} */
  #randomDevice = new Uint8Array(16);

  /** @type {Uint8Array} */
  #confirmationKey = new Uint8Array(16);

  /** @type {Uint8Array} */
  #confirmationProvisioner = new Uint8Array(16);

  /** @type {Uint8Array} */
  #confirmationDevice = new Uint8Array(16);

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
    await this.#send(provisioningPDU);
  }

  /**
   * @param {Uint8Array} PDU
   * @return {Promise<void>}
   */
  async #send(PDU) {
    await this.#provisioningDataIn.writeValueWithoutResponse(PDU.buffer);
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
        await this.#provisioningStartPDU(proxyPDU);
        await this.#provisioningPublicKeyPDU();
        return;
      case 0x03: // Provisioning Public Key
        console.log('Received Provisioning Public Key');
        await this.#importDevicePublicKey(proxyPDU);
        await this.#provisioningConfirmationPDU();
        return;
      case 0x04: // Provisioning Input Complete
        sendMessage('Provisioning Input Complete');
        console.log('Provisioning Input Complete');
        this.#abortProvisioning();
        return;
      case 0x05: // Provisioning Confirmation
        console.log('Received confirmation PDU');
        this.#readDeviceConfirmation(proxyPDU);
        await this.#provisioningRandomPDU();
        return;
      case 0x06: // Provisioning Random
        console.log('Received random PDU');
        await this.#checkConfirmation(proxyPDU);
        this.#getNetworkKey();
        // await this.#provisioningDataPDU();
        return;
      case 0x08:
        console.log('Provisioning complete');
        return
      case 0x09: // Provisioning Failed
        this.#readFailure(proxyPDU);
        return;
    }
  }

  /**
   * @param {DataView} proxyPDU
   * @return {Promise<void>}
   */
  async #provisioningStartPDU(proxyPDU) {
    const provisioningCapabilities = new Uint8Array(proxyPDU.buffer.slice(2));
    this.#confirmationInputs.set(provisioningCapabilities, 1);

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

    const PROVISIONING_START = 0x02;
    const PDU = new Uint8Array(7);
    PDU.set([PROVISIONING_START, algorithm, publicKey, authenticationMethod, authenticationAction, authenticationSize], 1);
    this.#confirmationInputs.set(PDU.subarray(2), 12);
    this.#proxyPDUfunc(PDU, SAR_COMPLETE);
    await this.#send(PDU);
  }

  /**
   * @return {Uint8Array}
   */
  #provisioningInvitePDU() {
    const PROVISIONING_INVITE = 0x00;
    const ATTENTION_DURATION = 0x00;
    this.#confirmationInputs.set([ATTENTION_DURATION]);
    const PDU = new Uint8Array(3);
    PDU.set([PROVISIONING_INVITE, ATTENTION_DURATION], 1);
    this.#proxyPDUfunc(PDU, SAR_COMPLETE);
    return PDU;
  }

  /**
   * @return {Promise<void>}
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
    PDU.set(publicKeyArray.subarray(1), 2);
    this.#confirmationInputs.set(publicKeyArray.subarray(1), 17);

    this.#proxyPDUfunc(PDU, SAR_COMPLETE);
    await this.#send(PDU);
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
    rawKeyInput.set(proxyPDUArray.subarray(2), 1);
    console.log("raw key");

    this.#deviceKey = await crypto.subtle.importKey("raw", rawKeyInput, { name: "ECDH", namedCurve: "P-256" }, false, []);

    if (typeof this.#privateKey === 'undefined') {
      this.#abortProvisioning;
      return;
    }

    this.#confirmationInputs.set(proxyPDUArray.subarray(2), 17 + 64);

    const ECDHSecretBuffer = await crypto.subtle.deriveBits({ name: "ECDH", public: this.#deviceKey }, this.#privateKey, 256);
    this.#ECDHSecret = new Uint8Array(ECDHSecretBuffer);
  }

  /**
   * @return {Promise<void>}
   */
  async #provisioningConfirmationPDU() {
    console.log("Confirmation inputs:");
    console.log(this.#confirmationInputs.toString());
    await s1(this.#confirmationSalt, this.#confirmationInputs);

    // "prck" = (pr)ovisioning (c)onfirmation (k)ey
    await k1(this.#confirmationKey, this.#ECDHSecret, this.#confirmationSalt, "prck");

    crypto.getRandomValues(this.#randomProvisioner);
    const inputs = new Uint8Array(32);
    inputs.set(this.#randomProvisioner);

    const PDU = new Uint8Array(18);
    const PROVISIONING_CONFIRMATION = 0x05;
    PDU.set([PROVISIONING_CONFIRMATION], 1);
    this.#proxyPDUfunc(PDU, SAR_COMPLETE);

    await AES_CMAC(this.#confirmationProvisioner, this.#confirmationKey, inputs);

    PDU.set(this.#confirmationProvisioner, 2);

    await this.#send(PDU);
  }

  /**
   * @param {DataView} proxyPDU
   * @return {void}
   */
  #readDeviceConfirmation(proxyPDU) {
    const confirmationDevice = new Uint8Array(proxyPDU.buffer.slice(2));
    let counter = 0;
    for (let i=0; i < confirmationDevice.byteLength; i++) {
      if (confirmationDevice.at(i) === this.#confirmationProvisioner.at(i)) {
        console.log("Confirmation provisioner and device the same at: " + i);
        counter++;
        if (counter === 16) {
          this.#abortProvisioning();
          return;
        }
      }
    }
    this.#confirmationDevice.set(confirmationDevice);
  }

  /**
   * @return {Promise<void>}
   */
  async #provisioningRandomPDU() {
    const PDU = new Uint8Array(18);
    const PROVISIONING_RANDOM = 0x06;
    PDU.set([PROVISIONING_RANDOM], 1);
    this.#proxyPDUfunc(PDU, SAR_COMPLETE);

    PDU.set(this.#randomProvisioner, 2);
    console.log("Random Provisioner:");
    console.log(this.#randomProvisioner.toString());
    console.log(PDU.toString());
    await this.#send(PDU);
  }

  /**
   * @param {DataView} proxyPDU
   * @return {Promise<void>}
   */
  async #checkConfirmation(proxyPDU) {
    const confirmationDevice = new Uint8Array(16);
    const randomDevice = new Uint8Array(proxyPDU.buffer.slice(2));
    this.#randomDevice.set(randomDevice);

    const inputs = new Uint8Array(32);
    inputs.set(randomDevice);
    await AES_CMAC(confirmationDevice, this.#confirmationKey, inputs);

    for (let i = 0; i < confirmationDevice.byteLength; i++) {
      if (confirmationDevice.at(i) !== this.#confirmationDevice.at(i)) {
        sendMessage("Confirmation failed");
        console.log("Calculated, received:");
        console.log(confirmationDevice.toString());
        console.log(this.#confirmationDevice.toString());
        this.#abortProvisioning();
      }
    }
  }

  /**
   * @return {void}
   */
  #getNetworkKey() {
    const request = window.indexedDB.open("MeshNetworks", 1);
    request.addEventListener("upgradeneeded", databaseUpgrade);
    request.addEventListener("success", lookupNetworkKey);
    this.#abortProvisioning();
  }

  /**
   * @return {Promise<void>}
   */
  async #provisioningDataPDU() {
    const PDU = new Uint8Array(35);
    const PROVISIONING_DATA = 0x07;
    PDU.set([PROVISIONING_DATA], 1);
    this.#proxyPDUfunc(PDU, SAR_COMPLETE);

    const provisioningSaltInput = new Uint8Array(48);
    provisioningSaltInput.set(this.#confirmationProvisioner);
    provisioningSaltInput.set(this.#randomProvisioner, 16);
    provisioningSaltInput.set(this.#randomDevice, 32);

    const provisioningSalt = new Uint8Array(16);
    s1(provisioningSalt, provisioningSaltInput);

    const sessionKey = new Uint8Array(16);
    // "prsk" = (pr)ovisioning (s)ession (k)ey
    await k1(sessionKey, this.#ECDHSecret, provisioningSalt, "prsk");

    const sessionNonce = new Uint8Array(16);
    // "prsn" = (pr)ovisioning (s)ession (n)once
    await k1(sessionNonce, this.#ECDHSecret, provisioningSalt, "prsn");

    const provisioningData = new Uint8Array(25);

    await AES_CCM(PDU.subarray(2), sessionKey, sessionNonce.subarray(3), provisioningData);

    // await this.#send(PDU);
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
    console.log("Provisioning Failed: " + message);
    this.#abortProvisioning();
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
