/**
 * @param {Uint8Array} output 
 * @param {Uint8Array} N
 * @param {Uint8Array} salt
 * @param {string} P
 * @return {Promise<void>}
 */
export async function k1(output, N, salt, P) {
  const T = new Uint8Array(16);
  await AES_CMAC(T, salt, N);
  const message = Uint8Array.from(P.split('').map(c => c.charCodeAt(0)));
  await AES_CMAC(output, T, message);
}

/**
 * @param {Uint8Array} output 
 * @param {Uint8Array} message
 * @return {Promise<void>}
 */
export async function s1(output, message) {
  const constZero = new Uint8Array(16);
  await AES_CMAC(output, constZero, message);
}

/**
 * @param {Uint8Array} key
 * @param {Uint8Array} nonce
 * @param {Uint8Array} message
 * @param {Uint8Array} additional
 * @param {number} micLength
 * @return {Promise<Uint8Array>}
 */
export async function AES_CCM_with_header(key, nonce, message, additional = new Uint8Array(0), micLength = 8) {
  const keyCBC = await crypto.subtle.importKey("raw", key, "AES-CBC", true, ["encrypt", "decrypt"],);
  const keyCTR = await crypto.subtle.importKey("raw", key, "AES-CTR", true, ["encrypt", "decrypt"],);
  const constZero = new Uint8Array(16);
  
  const L = 15 - nonce.byteLength - 1;
  const M = (micLength - 2) / 2;
  const Adata = additional.byteLength > 0 ? 1 : 0;
  
  let lengthEncoding = 0;
  let additionalBlocks = 0;
  
  if (additional.byteLength > 0 && additional.byteLength < 2 ** 16 - 2 ** 8) {
    lengthEncoding = 2;
    additionalBlocks = Math.ceil((lengthEncoding + additional.byteLength) / 16);
  } else if (additional.byteLength >= 2 ** 16 - 2 ** 8 && additional.byteLength < 2 ** 32) {
    lengthEncoding = 6;
    additionalBlocks = Math.ceil((lengthEncoding + additional.byteLength) / 16);
  } else if (additional.byteLength >= 2 ** 32 && additional.byteLength < 2 ** 64) {
    lengthEncoding = 10;
    additionalBlocks = Math.ceil((lengthEncoding + additional.byteLength) / 16);
  }
  
  const messageBlocks = Math.ceil(message.byteLength / 16);
  
  const blockLength = 1 + additionalBlocks + messageBlocks;
  const B = new Uint8Array(blockLength * 16);
  B.set([(Adata << 6) + (M << 3) + L]);
  B.set(nonce, 1);
  
  for (let i = 0; i <= L; i++) {
    B.set([(message.byteLength >> (8 * (L - i))) & 255], 1 + nonce.byteLength + i);
  }
  
  let i = 0;
  
  if (lengthEncoding === 6) {
    i = 2;
    B.set([0xff, 0xfe], 16);
  } else if (lengthEncoding === 10) {
    i = 2;
    B.set([0xff, 0xff], 16);
  }
  
  for (i; i < lengthEncoding; i++) {
    B.set([(additional.byteLength >> (8 * (lengthEncoding - 1 - i))) & 255], 16 + i);
  }
  
  B.set(additional, 16 + lengthEncoding);
  B.set(message, (1 + additionalBlocks) * 16);
  const buffer = await crypto.subtle.encrypt({ name: "AES-CBC", iv: constZero }, keyCBC, B);
  const T = new Uint8Array(buffer.slice(-32, -32 + micLength))
  
  const A = new Uint8Array(16);
  A.set([L]);
  A.set(nonce, 1);
  const messageStream = new Uint8Array(16 + message.byteLength);
  messageStream.set(T);
  messageStream.set(message, 16);
  
  const keyStreamBuffer = await crypto.subtle.encrypt({ name: "AES-CTR", counter: A, length: (L + 1)*8 }, keyCTR, messageStream);
  const S = new Uint8Array(keyStreamBuffer);
  const output = new Uint8Array(additional.byteLength + message.byteLength + micLength);
  output.set(additional);
  output.set(S.subarray(16), additional.byteLength);
  output.set(S.subarray(0, micLength), additional.byteLength + message.byteLength);
  
  return output;
}

/**
 * @param {Uint8Array} output
 * @param {Uint8Array} key
 * @param {Uint8Array} nonce
 * @param {Uint8Array} message
 * @param {number} micLength
 * @return {Promise<void>}
 */
export async function AES_CCM(output, key, nonce, message, micLength = 8) {
  const keyCBC = await crypto.subtle.importKey("raw", key, "AES-CBC", false, ["encrypt"],);
  const keyCTR = await crypto.subtle.importKey("raw", key, "AES-CTR", false, ["encrypt"],);
  const constZero = new Uint8Array(16);
  
  const L = 15 - nonce.byteLength - 1;
  const M = (micLength - 2) / 2;
  
  const messageBlocks = Math.ceil(message.byteLength / 16);
  
  const blockLength = 1 + messageBlocks;
  const B = new Uint8Array(blockLength * 16);
  B.set([(M << 3) + L]);
  B.set(nonce, 1);
  
  for (let i = 0; i <= L; i++) {
    B.set([(message.byteLength >> (8 * (L - i))) & 255], 1 + nonce.byteLength + i);
  }
  
  B.set(message, 16);
  const buffer = await crypto.subtle.encrypt({ name: "AES-CBC", iv: constZero }, keyCBC, B);
  const T = new Uint8Array(buffer.slice(-32, -32 + micLength))
  
  const A = new Uint8Array(16);
  A.set([L]);
  A.set(nonce, 1);
  const messageStream = new Uint8Array(16 + message.byteLength);
  messageStream.set(T);
  messageStream.set(message, 16);
  
  const keyStreamBuffer = await crypto.subtle.encrypt({ name: "AES-CTR", counter: A, length: (L + 1)*8 }, keyCTR, messageStream);
  const S = new Uint8Array(keyStreamBuffer);
  output.set(S.subarray(16));
  output.set(S.subarray(0, micLength), message.byteLength);
}


/**
 * @param {Uint8Array} output
 * @param {Uint8Array} keyRaw
 * @param {Uint8Array} message
 * return {Promise<Uint8Array>}
 */
export async function AES_CMAC(output, keyRaw, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyRaw,
    "AES-CBC",
    true,
    ["encrypt", "decrypt"],
  );
  const blockLength = Math.ceil(message.byteLength / 16);
  const messagePadded = new Uint8Array(blockLength * 16);
  messagePadded.set(message);
  const padding = message.byteLength % 16;
  
  const constZero = new Uint8Array(16);
  
  const L = await crypto.subtle.encrypt({ name: "AES-CBC", iv: constZero }, key, constZero,);
  const subKey = new Uint8Array(L.slice(0, 16));
  
  generateSubkeyNew(subKey);
  
  if (padding !== 0) {
    messagePadded.set([128], messagePadded.byteLength - 16 + padding);
    generateSubkeyNew(subKey);
  }
  
  // XOR
  messagePadded.subarray(-16).forEach((element, index, array) => array.set([element^(subKey.at(index)??0)], index));
  
  const buffer = await crypto.subtle.encrypt({ name: "AES-CBC", iv: constZero }, key, messagePadded);
  const array = new Uint8Array(buffer.slice(-32, -16));
  output.set(array);
}

/**
 * @param {Uint8Array} key
 * @retrun {void}
 */
function generateSubkeyNew(key) {
  const Rb = (key.at(0) ?? 0) > 127 ? 0x87 : 0x00;
  key.forEach(leftShift);
  key.set([(key.at(-1) ?? 0) ^ Rb], key.byteLength - 1);
}

/**
 * @param {number} element
 * @param {number} index
 * @param {Uint8Array} array
 * @return {void}
 */
function leftShift(element, index, array) {
  const carryTheOne = (array.at(index + 1) ?? 0) > 127 ? 1 : 0;
  const leftShifted = (element << 1) + carryTheOne;
  array.set([leftShifted], index);
}
