import "server-only";
import QRCode from "qrcode";

// Renderujemy QR jako SVG (ostry przy każdym rozmiarze, bez rastrów). Zwracamy
// surowy markup do osadzenia przez dangerouslySetInnerHTML. Kod celowo czarny
// na białym z marginesem - to daje najwyższy kontrast dla czytnika, niezależnie
// od motywu aplikacji (kod trzymamy w białej ramce).
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}
