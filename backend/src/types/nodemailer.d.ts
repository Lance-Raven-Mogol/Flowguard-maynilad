declare module 'nodemailer' {
  interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: {
      user?: string;
      pass?: string;
    };
  }

  interface SendMailOptions {
    from?: string;
    to?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
  }

  interface SentMessageInfo {
    messageId: string;
    [key: string]: unknown;
  }

  interface Transporter {
    sendMail(mailOptions: SendMailOptions): Promise<SentMessageInfo>;
  }

  function createTransport(options: TransportOptions): Transporter;
}
