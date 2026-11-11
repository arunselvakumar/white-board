import { PrivateDataCipher } from "@/src/shared-kernel/private-data";

let cipher: PrivateDataCipher | null = null;

/** Built on first use, so routes that never touch a bank account need no key. */
export function privateDataCipher(): PrivateDataCipher {
  cipher ??= PrivateDataCipher.fromEnv();
  return cipher;
}
