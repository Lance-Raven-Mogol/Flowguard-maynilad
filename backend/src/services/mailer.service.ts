import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass,
  },
});

export async function sendOtpEmail(to: string, otpCode: string): Promise<void> {
  await transporter.sendMail({
    from: `"FlowGuard" <${env.smtp.user}>`,
    to,
    subject: 'Your FlowGuard Verification Code',
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>FlowGuard Verification</title>
      </head>
      <body style="margin:0;padding:0;background:#f0f4fa;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4fa;padding:40px 16px;">
          <tr>
            <td align="center">
              <!-- Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(10,27,61,0.08);">

                <!-- Header gradient band -->
                <tr>
                  <td style="padding:32px 40px 28px;background:linear-gradient(135deg,#0a1b3d 0%,#1a2f5a 50%,#081530 100%);text-align:center;">
                    <div style="display:inline-block;width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);line-height:48px;text-align:center;margin-bottom:16px;">
                      <span style="font-size:22px;">💧</span>
                    </div>
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">FlowGuard</h1>
                    <p style="margin:6px 0 0;font-size:13px;color:#8aa0c8;">Smart Water Utility Management</p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:36px 40px 16px;">
                    <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#14233f;">Verify your email</h2>
                    <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#7d8aa6;">
                      Use the code below to complete your registration. This code expires in <strong style="color:#14233f;">5 minutes</strong>.
                    </p>

                    <!-- OTP box -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px;">
                          <div style="background:linear-gradient(135deg,#f6f8fc 0%,#eef2fa 100%);border:1.5px solid #e6ecf5;border-radius:14px;padding:20px;text-align:center;">
                            <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#0a1b3d;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${otpCode}</span>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:0 40px;">
                    <div style="border-top:1px solid #e6ecf5;"></div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:20px 40px 32px;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#7d8aa6;text-align:center;">
                      If you did not request this code, you can safely ignore this email. Do not share this code with anyone.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Bottom branding -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
                <tr>
                  <td style="padding:24px 0 0;text-align:center;">
                    <p style="margin:0;font-size:11px;color:#9aa6c0;">
                      © ${new Date().getFullYear()} FlowGuard · Maynilad Water Utility
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });
}
