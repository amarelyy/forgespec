/** Outbound email channel of the Notification Service. */
export interface Mailer {
  send(to: string, subject: string, body: string): Promise<void>;
}

/** Development stand-in: logs instead of sending. Replace with an SMTP/provider implementation. */
export class ConsoleMailer implements Mailer {
  async send(to: string, subject: string) {
    console.log(`[mail] to=${to} subject="${subject}"`);
  }
}

export class NullMailer implements Mailer {
  sent: { to: string; subject: string; body: string }[] = [];
  async send(to: string, subject: string, body: string) {
    this.sent.push({ to, subject, body });
  }
}
