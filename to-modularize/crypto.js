import * as cryptoBrowserifyModule from '../node_modules/crypto-browserify/index.js';

export default { ...cryptoBrowserifyModule };
// const webcrypto = window.crypto;

// const cryptoBrowserify = cryptoBrowserifyModule && cryptoBrowserifyModule.default
//   ? cryptoBrowserifyModule.default
//   : cryptoBrowserifyModule;

// const {
//   createHash: createBrowserHash,
//   createHmac: createBrowserHmac
// } = cryptoBrowserify;

// const HASH_ALGORITHM_MAP = {
//   'md5': 'md5',
//   'sha1': 'sha1',
//   'sha224': 'sha224',
//   'sha256': 'sha256',
//   'sha384': 'sha384',
//   'sha512': 'sha512',
//   'ripemd160': 'rmd160',
//   'rmd160': 'rmd160'
// };

// const HASH_ALGORITHMS = Array.from(new Set(Object.keys(HASH_ALGORITHM_MAP)));

// const CIPHER_ALGORITHMS = [
//   'aes-128-cbc',
//   'aes-192-cbc',
//   'aes-256-cbc',
//   'aes-128-gcm',
//   'aes-256-gcm'
// ];

// const CURVE_ALGORITHMS = [
//   'prime256v1',
//   'secp256k1',
//   'secp384r1',
//   'secp521r1'
// ];

// const HASH_ALIAS_CACHE = Object.create(null);

// const setEngine = undefined;

// function normalizeHashName(name) {
//   if (typeof name !== 'string') {
//     throw new TypeError('Hash algorithm name must be a string');
//   }
//   return name.toLowerCase().replace(/-/g, '');
// }

// function toBuffer(data) {
//   if (typeof Buffer === 'undefined') {
//     throw new Error('Buffer is not available in this environment');
//   }
//   if (Buffer.isBuffer(data)) {
//     return data;
//   }
//   if (data instanceof ArrayBuffer) {
//     return Buffer.from(new Uint8Array(data));
//   }
//   if (ArrayBuffer.isView(data)) {
//     return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
//   }
//   return Buffer.from(data);
// }

// class Hash {
//   constructor(algorithm, options = {}) {
//     this.algorithm = normalizeHashName(algorithm);
//     const mappedAlgorithm = HASH_ALGORITHM_MAP[this.algorithm];
//     if (!mappedAlgorithm) {
//       throw new Error(`Hash algorithm ${algorithm} not supported in this environment`);
//     }
//     this.options = options;
//     this._hash = createBrowserHash(mappedAlgorithm, options);
//   }

//   update(data, inputEncoding) {
//     if (typeof data === 'string') {
//       this._hash.update(data, inputEncoding);
//     } else {
//       this._hash.update(toBuffer(data));
//     }
//     return this;
//   }

//   digest(encoding = 'buffer') {
//     const outputEncoding = encoding === 'buffer' || encoding === undefined ? undefined : encoding;
//     const result = this._hash.digest(outputEncoding);
//     if (outputEncoding) {
//       return result;
//     }
//     return Buffer.isBuffer(result) ? result : Buffer.from(result);
//   }
// }

// class Hmac {
//   constructor(algorithm, key, options = {}) {
//     this.algorithm = normalizeHashName(algorithm);
//     const mappedAlgorithm = HASH_ALGORITHM_MAP[this.algorithm];
//     if (!mappedAlgorithm) {
//       throw new Error(`HMAC algorithm ${algorithm} not supported in this environment`);
//     }
//     const keyMaterial = typeof key === 'string' ? key : toBuffer(key);
//     this.options = options;
//     this._hmac = createBrowserHmac(mappedAlgorithm, keyMaterial, options);
//   }

//   update(data, inputEncoding) {
//     if (typeof data === 'string') {
//       this._hmac.update(data, inputEncoding);
//     } else {
//       this._hmac.update(toBuffer(data));
//     }
//     return this;
//   }

//   digest(encoding = 'buffer') {
//     const outputEncoding = encoding === 'buffer' || encoding === undefined ? undefined : encoding;
//     const result = this._hmac.digest(outputEncoding);
//     if (outputEncoding) {
//       return result;
//     }
//     return Buffer.isBuffer(result) ? result : Buffer.from(result);
//   }
// }

// class Cipher {
//   constructor() {
//     this.key = null;
//     this.iv = null;
//     this.mode = null;
//   }

//   setAutoPadding(autoPadding = true) {
//     this.autoPadding = autoPadding;
//     return this;
//   }
// }

// class Decipher extends Cipher {
//   constructor() {
//     super();
//   }
// }

// // Random bytes generation
// function randomBytes(size, callback) {
//   if (callback) {
//     try {
//       const bytes = webcrypto.getRandomValues(new Uint8Array(size));
//       callback(null, Buffer.from(bytes));
//     } catch (error) {
//       callback(error);
//     }
//     return;
//   }

//   return new Promise((resolve, reject) => {
//     try {
//       const bytes = webcrypto.getRandomValues(new Uint8Array(size));
//       resolve(Buffer.from(bytes));
//     } catch (error) {
//       reject(error);
//     }
//   });
// }

// // Pseudo-random bytes generation (less secure)
// function pseudoRandomBytes(size, callback) {
//   return randomBytes(size, callback);
// }

// // Timing-safe comparison
// function timingSafeEqual(a, b) {
//   if (a.length !== b.length) {
//     return false;
//   }

//   let result = 0;
//   for (let i = 0; i < a.length; i++) {
//     result |= a[i] ^ b[i];
//   }

//   return result === 0;
// }

// // Create cipher/decipher instances
// function createCipher(algorithm, password, options = {}) {
//   const cipher = new Cipher();
//   cipher.algorithm = algorithm;
//   cipher.password = password;
//   cipher.options = options;
//   return cipher;
// }

// function createDecipher(algorithm, password, options = {}) {
//   const decipher = new Decipher();
//   decipher.algorithm = algorithm;
//   decipher.password = password;
//   decipher.options = options;
//   return decipher;
// }

// function createCipheriv(algorithm, key, iv, options = {}) {
//   const cipher = new Cipher();
//   cipher.algorithm = algorithm;
//   cipher.key = key;
//   cipher.iv = iv;
//   cipher.options = options;
//   return cipher;
// }

// function createDecipheriv(algorithm, key, iv, options = {}) {
//   const decipher = new Decipher();
//   decipher.algorithm = algorithm;
//   decipher.key = key;
//   decipher.iv = iv;
//   decipher.options = options;
//   return decipher;
// }

// // Public key cryptography
// function generateKeyPair(type, options, callback) {
//   if (callback) {
//     generateKeyPairAsync(type, options).then(result => callback(null, result)).catch(callback);
//     return;
//   }
//   return generateKeyPairAsync(type, options);
// }

// async function generateKeyPairAsync(type, options) {
//   if (type !== 'rsa' && type !== 'ec') {
//     throw new Error('Only RSA and EC key generation is supported');
//   }

//   const algorithm = type === 'rsa'
//     ? {
//         name: 'RSASSA-PKCS1-v1_5',
//         modulusLength: options.modulusLength || 2048,
//         publicExponent: new Uint8Array([1, 0, 1]),
//         hash: options.hash || 'SHA-256'
//       }
//     : {
//         name: 'ECDSA',
//         namedCurve: options.namedCurve || 'P-256'
//       };

//   const keyPair = await webcrypto.subtle.generateKey(
//     algorithm,
//     true,
//     ['sign', 'verify']
//   );

//   return {
//     publicKey: keyPair.publicKey,
//     privateKey: keyPair.privateKey
//   };
// }

// function createSign(algorithm) {
//   return {
//     algorithm,
//     update(data) {
//       if (typeof data === 'string') {
//         data = new TextEncoder().encode(data);
//       }
//       this.data = this.data ? new Uint8Array([...this.data, ...data]) : new Uint8Array(data);
//       return this;
//     },
//     async sign(privateKey, encoding = 'buffer') {
//       if (!webcrypto.subtle || !this.data) {
//         throw new Error('Web Crypto API not available');
//       }

//       const signature = await webcrypto.subtle.sign(
//         { name: algorithm.toUpperCase() },
//         privateKey,
//         this.data
//       );

//       if (encoding === 'buffer' || encoding === undefined) {
//         return Buffer.from(signature);
//       }
//       if (encoding === 'hex') {
//         return Array.from(new Uint8Array(signature))
//           .map(b => b.toString(16).padStart(2, '0'))
//           .join('');
//       }
//       return Buffer.from(signature);
//     }
//   };
// }

// function createVerify(algorithm) {
//   return {
//     algorithm,
//     update(data) {
//       if (typeof data === 'string') {
//         data = new TextEncoder().encode(data);
//       }
//       this.data = this.data ? new Uint8Array([...this.data, ...data]) : new Uint8Array(data);
//       return this;
//     },
//     async verify(publicKey, signature, encoding = 'buffer') {
//       if (!webcrypto.subtle || !this.data) {
//         throw new Error('Web Crypto API not available');
//       }

//       const sigBuf = encoding === 'buffer' ? signature : Buffer.from(signature, 'hex');
//       return await webcrypto.subtle.verify(
//         { name: algorithm.toUpperCase() },
//         publicKey,
//         sigBuf,
//         this.data
//       );
//     }
//   };
// }

// function getCiphers() {
//   return [...CIPHER_ALGORITHMS];
// }

// function getCurves() {
//   return [...CURVE_ALGORITHMS];
// }

// function getHashes() {
//   return [...HASH_ALGORITHMS];
// }

// function secureHeapUsed() {
//   return undefined;
// }

// function getCachedAliases() {
//   return { ...HASH_ALIAS_CACHE };
// }

// function getOpenSSLSecLevelCrypto() {
//   return 0;
// }

// const EVP_PKEY_ML_DSA_44 = 0;
// const EVP_PKEY_ML_DSA_65 = 0;
// const EVP_PKEY_ML_DSA_87 = 0;
// const EVP_PKEY_ML_KEM_512 = 0;
// const EVP_PKEY_ML_KEM_768 = 0;
// const EVP_PKEY_ML_KEM_1024 = 0;

// const kKeyVariantAES_OCB_128 = false;

// const Argon2Job = undefined;
// const KmacJob = undefined;

// export default { ...cryptoBrowserify };
// export default {
// //   Hash,
//   Hash: cryptoBrowserify.Hash,
//   Hmac,
//   Cipher,
//   Decipher,
//   getCiphers,
//   getCurves,
//   getHashes,
//   setEngine,
//   secureHeapUsed,
//   getCachedAliases,
//   getOpenSSLSecLevelCrypto,
//   EVP_PKEY_ML_DSA_44,
//   EVP_PKEY_ML_DSA_65,
//   EVP_PKEY_ML_DSA_87,
//   EVP_PKEY_ML_KEM_512,
//   EVP_PKEY_ML_KEM_768,
//   EVP_PKEY_ML_KEM_1024,
//   kKeyVariantAES_OCB_128,
//   Argon2Job,
//   KmacJob,
//   randomBytes,
//   pseudoRandomBytes,
// timingSafeEqual,
// createHash: createBrowserHash,
// createHmac: createBrowserHmac,
//   createCipher,
//   createDecipher,
//   createCipheriv,
//   createDecipheriv,
//   generateKeyPair,
//   generateKeyPairSync: generateKeyPair,
//   createSign,
//   createVerify,
//   // Constants
//   constants: {
//     SSL_OP_NO_TLSv1: 1,
//     SSL_OP_NO_TLSv1_1: 2,
//     SSL_OP_NO_TLSv1_2: 4,
//   }
// };
