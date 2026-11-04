declare module "heic-convert" {
  const convert: (o: { buffer: Buffer | ArrayBuffer | Uint8Array; format: "JPEG" | "PNG"; quality?: number }) => Promise<ArrayBuffer>;
  export default convert;
}
