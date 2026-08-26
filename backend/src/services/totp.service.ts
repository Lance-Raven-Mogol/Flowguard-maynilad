/**
 * TOTP service — wraps speakeasy for Google Authenticator-style 2FA.
 * No emails. No network calls. Works 100% offline / locally on the device
 * running the backend server.
 */
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

const APP_NAME = 'FlowGuard';

export interface TotpSetup {
  /** Base-32 secret to store in the database (encrypted at rest ideally) */
  secret: string;
  /** Full otpauth:// URI for the QR code */
  otpauthUrl: string;
  /** Data-URL PNG (base64) of the QR code — send straight to <img src> */
  qrCodeDataUrl: string;
  /** Human-readable base32 key — for users who can't scan the QR */
  manualKey: string;
}

/**
 * Generate a brand-new TOTP secret + QR for a user.
 * Call this when:
 *  - User signs up (registration TOTP setup)
 *  - User enables TOTP in Account Settings
 */
export async function generateTotpSetup(email: string): Promise<TotpSetup> {
  const generated = speakeasy.generateSecret({
    name: `${APP_NAME} (${email})`,
    issuer: APP_NAME,
    length: 20,
  });

  const secret = generated.base32;
  const otpauthUrl = generated.otpauth_url!;

  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
    color: {
      dark: '#0a1b3d',  // FlowGuard navy
      light: '#ffffff',
    },
  });

  // Format manual key in groups of 4 for readability: XXXX XXXX XXXX …
  const manualKey = secret.match(/.{1,4}/g)?.join(' ') ?? secret;

  return { secret, otpauthUrl, qrCodeDataUrl, manualKey };
}

/**
 * Verify a 6-digit TOTP token against a stored base-32 secret.
 * Allows a ±1 window (30 s drift tolerance) so clock skew doesn't bite users.
 */
export function verifyTotpToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: token.replace(/\s/g, ''),
    window: 1, // ±30 s tolerance
  });
}
