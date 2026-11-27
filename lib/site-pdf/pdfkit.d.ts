// Surface utilisée de pdfkit ; pas de dépendance de types supplémentaire.
declare module "pdfkit" {
  import { Readable } from "node:stream";
  export default class PDFDocument extends Readable {
    constructor(options?: { size?: string; margin?: number; compress?: boolean; info?: { Title?: string; CreationDate?: Date; ModDate?: Date } });
    y: number;
    font(name: string): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    text(text: string, options?: { width?: number; paragraphGap?: number }): this;
    moveDown(lines?: number): this;
    addPage(): this;
    image(bytes: Buffer, x: number, y: number, options: { fit: [number, number]; align?: string }): this;
    end(): void;
  }
}
