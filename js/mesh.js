export const mesh = {
  provisioning: {
    uuid: '00001827-0000-1000-8000-00805f9b34fb',
    characteristic: {
      dataIn: '00002adb-0000-1000-8000-00805f9b34fb',
      dataOut: '00002adc-0000-1000-8000-00805f9b34fb',
    }
  },
  proxy: {
    uuid: '00001828-0000-1000-8000-00805f9b34fb',
    characteristic: {
      dataIn: '00002add-0000-1000-8000-00805f9b34fb',
      dataOut: '00002ade-0000-1000-8000-00805f9b34fb',
    }
  },
  proxySolicitation: {
    uuid: '00001859-0000-1000-8000-00805f9b34fb',
  },
};

export const proxyPDU = /** @type {const} */({
  // SAR message assembly and reassembly information
  SAR: {
    complete: 0b00,
    first: 0b01,
    continuation: 0b10,
    last: 0b11,
  },
  messageType: {
    networkPDU: 0x00,
    meshBeacon: 0x01,
    proxyConfiguratoin: 0x02,
    provisioningPDU: 0x03,
  },
});

export const provisioningPDU = {
  invite: 0x00,
  capabilites: 0x02,
  publicKey: 0x03,
  inputComplete: 0x04,
  confirmation: 0x05,
  random: 0x06,
  data: 0x07,
  complete: 0x08,
  failed: 0x09,
  recordRequest: 0x0A,
  recordResponse: 0x0B,
  recordsGet: 0x0C,
  recordsList: 0x0D,
};
