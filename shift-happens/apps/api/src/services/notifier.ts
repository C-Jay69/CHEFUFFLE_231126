import { prisma } from '@shift-happens/db';
import { env } from '../env.js';

export interface OutboundMessage {
  restaurantId?: string;
  channel: 'sms' | 'email' | 'push';
  recipients: string[];
  message: string;
}

async function sendViaTwilio(to: string, body: string): Promise<boolean> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    return false;
  }
  const credentials = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
  ).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: to,
        From: env.TWILIO_PHONE_NUMBER,
        Body: body,
      }),
    },
  );
  if (!response.ok) {
    console.warn('Twilio send failed', response.status, await response.text());
    return false;
  }
  return true;
}

async function sendViaSendGrid(to: string, body: string): Promise<boolean> {
  if (!env.SENDGRID_API_KEY) return false;
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: env.SENDGRID_FROM_EMAIL, name: 'SHIFT HAPPENS!' },
      subject: 'SHIFT HAPPENS! operations notice',
      content: [{ type: 'text/plain', value: body }],
    }),
  });
  if (!response.ok) {
    console.warn('SendGrid send failed', response.status, await response.text());
    return false;
  }
  return true;
}

/**
 * Delivers an outbound message using Twilio/SendGrid when credentials are
 * present, and always writes an auditable notification row. In local dev the
 * row is the delivery surface (the UI reads it) so nothing leaves the machine.
 */
export async function sendMessage(input: OutboundMessage) {
  const restaurantId = input.restaurantId ?? env.RESTAURANT_ID;
  let delivered = false;

  if (input.channel === 'sms') {
    const numericRecipients = input.recipients.filter((r) => /^\+?\d[\d\s-]{5,}$/.test(r));
    for (const recipient of numericRecipients) {
      delivered = (await sendViaTwilio(recipient, input.message)) || delivered;
    }
  }
  if (input.channel === 'email') {
    const emails = input.recipients.filter((r) => r.includes('@'));
    for (const recipient of emails) {
      delivered = (await sendViaSendGrid(recipient, input.message)) || delivered;
    }
  }

  const notification = await prisma.notification.create({
    data: {
      restaurantId,
      channel: input.channel,
      recipients: input.recipients,
      message: input.message,
      status: delivered ? 'sent' : 'simulated',
    },
  });
  return { notification, delivered, simulated: !delivered };
}
