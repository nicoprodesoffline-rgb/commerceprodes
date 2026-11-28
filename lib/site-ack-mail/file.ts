/** Expéditeur d'essai exclusivement local : MIME écrit sur disque, aucun transport réseau. */
import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { privateAckDirectory } from "./config";

export type AckFileInput = {
  directory: string; number: string; createdAt: Date; to: string;
  from: { name: string; address: string } | null; replyTo: string | null;
  subject: string; text: string; pdf: Uint8Array | null;
};
const crlf = (s: string): string => s.replace(/\r\n|\r|\n/g, "\r\n");
const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
// 42 octets UTF-8 au plus par encoded-word (RFC 2047 : 75 caractères maximum), sans couper un caractère.
function encodedHeader(s: string): string {
  const words: string[] = [];
  let part = "";
  for (const char of s) {
    if (Buffer.byteLength(part + char) > 42) { words.push(`=?UTF-8?B?${Buffer.from(part).toString("base64")}?=`); part = ""; }
    part += char;
  }
  words.push(`=?UTF-8?B?${Buffer.from(part).toString("base64")}?=`);
  return words.join("\r\n ");
}
function address(s: string): string {
  if (!/^[\x21-\x7e]+@[^@\s<>]+\.[^@\s<>]+$/.test(s) || /[<>(),;:"\\]/.test(s)) throw new Error("ACK_FILE_ADDRESS_INVALID");
  return s;
}

function eml(input: AckFileInput, stamp: string): string {
  const sender = input.from ?? { name: "", address: "accuse@exemple.invalid" };
  const from = sender.name ? `${encodedHeader(sender.name)} <${address(sender.address)}>` : address(sender.address);
  const headers = [
    `From: ${from}`, `To: ${address(input.to)}`,
    ...(input.replyTo ? [`Reply-To: ${address(input.replyTo)}`] : []),
    `Subject: ${encodedHeader(input.subject)}`, `Date: ${input.createdAt.toUTCString()}`,
    `Message-ID: <${input.number}.${stamp}@exemple.invalid>`, "MIME-Version: 1.0",
  ];
  const text = ["Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", base64(Buffer.from(crlf(input.text), "utf8"))].join("\r\n");
  if (input.pdf === null) return `${headers.join("\r\n")}\r\n${text}\r\n`;
  const boundary = `ack_${input.number}_${stamp}`;
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    `--${boundary}`, text, `--${boundary}`, "Content-Type: application/pdf",
    `Content-Disposition: attachment; filename="${input.number}.pdf"`, "Content-Transfer-Encoding: base64", "",
    base64(input.pdf), `--${boundary}--`, ""].join("\r\n");
}

/** Sous le verrou de la ligne de file. Un fichier déjà renommé survit au rejeu d'une transaction interrompue. */
export async function writeAcknowledgementFile(input: AckFileInput): Promise<string> {
  if (!/^(DEV|CMD|MSG)-[0-9]{4}-[0-9]{6}$/.test(input.number)) throw new Error("ACK_FILE_NUMBER_INVALID");
  const directory = privateAckDirectory(input.directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  privateAckDirectory(directory);
  const stamp = input.createdAt.toISOString().replace(/[-:.]/g, "");
  const filename = `${input.number}-${stamp}.eml`;
  const final = join(directory, filename);
  try {
    if (!(await lstat(final)).isFile()) throw new Error("ACK_FILE_TARGET_INVALID");
    return filename;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temporary = join(directory, `.${filename}.${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(eml(input, stamp), "utf8"); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, final);
    return filename;
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
}
