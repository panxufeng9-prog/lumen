import type { HoloEffect } from "@kongyo2/cards-css";
import type { CardArtwork } from "./card-image";

export type SavedCard = CardArtwork & {
  name: string;
  number: string;
  effect: HoloEffect;
  mode?: "depth" | "dual";
  variant?: string | null;
};

const DATABASE = "lumen-card-v1";
const STORE = "cards";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadCard(): Promise<SavedCard | undefined> {
  return transaction("readonly", (store) => store.get("latest"));
}

export async function saveCard(card: SavedCard): Promise<void> {
  await transaction("readwrite", (store) => store.put(card, "latest"));
}
