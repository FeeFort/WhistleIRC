const DATABASE_NAME = "whistleirc-auth";
const DATABASE_VERSION = 1;
const CREDENTIALS_STORE = "credentials";
const KEYS_STORE = "keys";
const CREDENTIALS_KEY = "default";
const OSU_AUTH_KEY = "osu-auth";
const ENCRYPTION_KEY = "credential-key";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CREDENTIALS_STORE)) {
        database.createObjectStore(CREDENTIALS_STORE);
      }
      if (!database.objectStoreNames.contains(KEYS_STORE)) {
        database.createObjectStore(KEYS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readValue(storeName, key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeValue(storeName, key, value) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteValue(storeName, key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function saveEncryptedValue(storeName, keyName, value) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  await writeValue(storeName, keyName, {
    iv: Array.from(iv),
    encrypted: Array.from(new Uint8Array(encrypted)),
  });
}

async function loadEncryptedValue(storeName, keyName) {
  const record = await readValue(storeName, keyName);
  if (!record) return null;

  const key = await readValue(KEYS_STORE, ENCRYPTION_KEY);
  if (!key) return null;

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(record.iv) },
    key,
    new Uint8Array(record.encrypted),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function getEncryptionKey() {
  const existingKey = await readValue(KEYS_STORE, ENCRYPTION_KEY);
  if (existingKey) return existingKey;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await writeValue(KEYS_STORE, ENCRYPTION_KEY, key);
  return key;
}

export async function saveRememberedCredentials(login, password) {
  await saveEncryptedValue(CREDENTIALS_STORE, CREDENTIALS_KEY, {
    login,
    password,
  });
}

export async function loadRememberedCredentials() {
  try {
    return await loadEncryptedValue(CREDENTIALS_STORE, CREDENTIALS_KEY);
  } catch {
    return null;
  }
}

export async function saveOsuAuthData(data) {
  await saveEncryptedValue(CREDENTIALS_STORE, OSU_AUTH_KEY, data);
}

export async function loadOsuAuthData() {
  try {
    return await loadEncryptedValue(CREDENTIALS_STORE, OSU_AUTH_KEY);
  } catch {
    return null;
  }
}

export async function clearRememberedCredentials() {
  try {
    await deleteValue(CREDENTIALS_STORE, CREDENTIALS_KEY);
  } catch {
    return;
  }
}
