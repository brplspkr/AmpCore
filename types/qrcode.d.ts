// Minimal typing for the parts of `qrcode` used by the phone remote dialog.
declare module "qrcode" {
  interface QRCodeToStringOptions {
    type?: "svg" | "utf8" | "terminal";
    margin?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  }

  const QRCode: {
    toString(text: string, options?: QRCodeToStringOptions): Promise<string>;
  };

  export default QRCode;
}
