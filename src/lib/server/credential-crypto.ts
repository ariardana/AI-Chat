import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";

const keyPair = generateKeyPairSync("rsa", {
  modulusLength: 4096,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

export function getCredentialPublicKey() {
  return keyPair.publicKey;
}

export function decryptCredential(value: string) {
  try {
    const decrypted = privateDecrypt(
      {
        key: keyPair.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(value, "base64"),
    );
    return decrypted.toString("utf8").trim();
  } catch {
    return "";
  }
}
