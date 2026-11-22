import { createHash } from 'node:crypto';
import { prisma } from '@shift-happens/db';
import { env } from '../env.js';
import { notFound } from '../errors.js';
import { emitRestaurant } from '../realtime.js';
import { checkAvailability, createReservation, serializeReservation } from './reservation-engine.js';

const dims = 128;

/** Deterministic local embedding — matches packages/db seed. */
export function embedText(text: string): number[] {
  const vector = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  for (const token of tokens) {
    const hash = createHash('sha256').update(token).digest();
    for (let i = 0; i < 4; i++) {
      const idx = hash.readUInt32BE(i * 4) % dims;
      vector[idx] += 1;
    }
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => Number((v / norm).toFixed(6)));
}

function cosine(a: number[], b: number[]) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export interface KnowledgeMatch {
  id: string;
  title: string;
  category: string;
  content: string;
  score: number;
}

export async function searchKnowledge(
  query: string,
  restaurantId = env.RESTAURANT_ID,
  limit = 3,
): Promise<KnowledgeMatch[]> {
  const rows = await prisma.knowledgeBase.findMany({ where: { restaurantId } });
  const queryVector = embedText(query);
  const keywords = new Set(
    (query.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((t) => t.length > 3),
  );
  return rows
    .map((row) => {
      const text = `${row.title} ${row.content}`.toLowerCase();
      const keywordHits = [...keywords].filter((k) => text.includes(k)).length;
      const semantic = cosine(queryVector, (row.embedding as number[]) ?? []);
      return {
        id: row.id,
        title: row.title,
        category: row.category,
        content: row.content,
        score: Number((semantic * 0.6 + keywordHits * 0.2).toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function getLive86(restaurantId = env.RESTAURANT_ID) {
  return prisma.menuItem.findMany({
    where: { restaurantId, is86ed: true },
    select: { id: true, name: true, eightySixReason: true, category: { select: { name: true } } },
  });
}

type Intent =
  | 'reservation'
  | 'allergen'
  | 'hours'
  | 'parking'
  | 'dress_code'
  | 'availability'
  | 'menu'
  | 'general';

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  // Availability questions ("do you have a table for four?") must not auto-book.
  if (/(do you have|is there|are there|any).{0,24}(table|tables|availability|opening)/.test(t)) {
    return 'availability';
  }
  if (/(book|reserve|reservation|seat us|get us in|hold a table|i'?d like a table|i need a table|can i get a table|party of)/.test(t)) {
    return 'reservation';
  }
  if (/(allerg|gluten|celiac|nut|shellfish|dairy|vegan|vegetarian)/.test(t)) return 'allergen';
  if (/(open|close|hours|tonight|monday|sunday)/.test(t) && /(when|what time|are you|open|close)/.test(t)) return 'hours';
  if (/(park|valet|garage)/.test(t)) return 'parking';
  if (/(dress|jacket|attire)/.test(t)) return 'dress_code';
  if (/(available|availability|walk.?in|got a table|any tables)/.test(t)) return 'availability';
  if (/(86|sold out|menu|truffle|special|signature|wagyu|ribeye)/.test(t)) return 'menu';
  return 'general';
}

function parsePartySize(text: string): number | undefined {
  const match = text.match(/(?:party of|for|table for)\s+(\d{1,2})/i);
  return match ? Number(match[1]) : undefined;
}

function parseTime(text: string): Date | undefined {
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const period = match[3].toLowerCase();
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() < Date.now()) date.setDate(date.getDate() + 1);
  return date;
}

function parseName(text: string): string | undefined {
  const patterns = [
    /under\s+([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?)/,
    /name is\s+([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?)/i,
    /this is\s+([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?)/i,
    /i'?m\s+([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

async function callGemini(
  systemInstruction: string,
  userText: string,
): Promise<string | null> {
  if (!env.GEMINI_API_KEY) return null;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 220 },
        }),
      },
    );
    if (!response.ok) {
      console.warn('Gemini call failed', response.status, await response.text());
      return null;
    }
    const data = (await response.json()) as any;
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (error) {
    console.warn('Gemini call error', error);
    return null;
  }
}

export interface VoiceAnswer {
  reply: string;
  intent: Intent;
  sources: KnowledgeMatch[];
  eightySix: string[];
  usedGemini: boolean;
  availability?: { availableCount: number; tableNumbers: string[] };
}

export async function answerUtterance(
  utterance: string,
  restaurantId = env.RESTAURANT_ID,
  options: { partySize?: number; reservationTime?: string } = {},
): Promise<VoiceAnswer> {
  const intent = detectIntent(utterance);
  const [matches, eightySix] = await Promise.all([
    searchKnowledge(utterance, restaurantId, 3),
    getLive86(restaurantId),
  ]);
  const partySize = options.partySize ?? parsePartySize(utterance) ?? 2;
  const time = options.reservationTime ? new Date(options.reservationTime) : parseTime(utterance) ?? new Date(Date.now() + 2 * 3_600_000);
  let availability: VoiceAnswer['availability'] | undefined;
  if (intent === 'reservation' || intent === 'availability') {
    const result = await checkAvailability(restaurantId, {
      time: time.toISOString(),
      partySize,
    });
    availability = {
      availableCount: result.availableCount,
      tableNumbers: result.tableNumbers,
    };
  }

  const knowledgeContext = matches
    .map((match) => `[${match.category}] ${match.title}: ${match.content}`)
    .join('\n');
  const live86 = eightySix.map((item) => item.name);

  const systemInstruction = [
    'You are the Chefuffle voice concierge for a high-end restaurant.',
    'Be concise, warm, and operationally precise. Answer in 2-3 sentences.',
    'Never promise an item that is on the live 86 list.',
    `Live 86 list: ${live86.length ? live86.join(', ') : 'none'}.`,
    `Live availability for ${partySize} around ${time.toISOString()}: ${availability ? `${availability.availableCount} tables (${availability.tableNumbers.join(', ') || 'none'})` : 'not checked'}.`,
    `Knowledge base:\n${knowledgeContext}`,
  ].join('\n');

  let reply = await callGemini(systemInstruction, utterance);
  const usedGemini = Boolean(reply);

  if (!reply) {
    reply = buildFallbackReply({
      utterance,
      intent,
      matches,
      eightySix: live86,
      availability,
      partySize,
      time,
    });
  }

  return { reply, intent, sources: matches, eightySix: live86, usedGemini, availability };
}

function buildFallbackReply(input: {
  utterance: string;
  intent: Intent;
  matches: KnowledgeMatch[];
  eightySix: string[];
  availability?: { availableCount: number; tableNumbers: string[] };
  partySize: number;
  time: Date;
}) {
  const timeLabel = input.time.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const top = input.matches[0];
  const availabilityLine = input.availability
    ? input.availability.availableCount > 0
      ? `I have ${input.availability.availableCount} tables that can take ${input.partySize} around ${timeLabel} — ${input.availability.tableNumbers.slice(0, 4).join(', ')}.`
      : `I'm not seeing an open table for ${input.partySize} around ${timeLabel}; I can put you on the waitlist or check the bar.`
    : '';
  const allergy86 = input.eightySix.length
    ? `Just so you know, ${input.eightySix.join(' and ')} are 86ed tonight.`
    : '';

  switch (input.intent) {
    case 'reservation':
      return `I'd be delighted to help with a table for ${input.partySize}. ${availabilityLine} ${allergy86} Shall I hold it under your name?`.trim();
    case 'allergen':
      return `${top?.content ?? 'Our kitchen can accommodate most allergies with advance notice.'} ${allergy86}`.trim();
    case 'hours':
      return `${top?.content ?? 'We serve dinner Tuesday through Sunday from 5:00 PM to 11:00 PM, with the bar opening at 4:30 PM.'} ${allergy86}`.trim();
    case 'parking':
      return top?.content ?? 'Valet is available from 5 PM on Nocturne Ave, and the Arts District garage is two blocks east with validated parking.';
    case 'dress_code':
      return top?.content ?? 'Smart casual — jackets welcome but not required.';
    case 'availability':
      return `${availabilityLine} ${allergy86} I can book it now if you like.`.trim();
    case 'menu':
      return `${top?.content ?? 'Tonight’s signatures are the A5 wagyu striploin and the 28-day dry-aged ribeye.'} ${allergy86}`.trim();
    default:
      return `${top?.content ?? 'I can help with reservations, allergens, hours, parking, or tonight’s menu.'} ${allergy86}`.trim();
  }
}

function parseBooking(utterance: string, callerPhone: string, options: { partySize?: number; reservationTime?: string }) {
  const partySize = options.partySize ?? parsePartySize(utterance) ?? 2;
  const time = options.reservationTime
    ? new Date(options.reservationTime)
    : parseTime(utterance) ?? new Date(Date.now() + 2 * 3_600_000);
  const name = parseName(utterance) ?? 'Voice Guest';
  return { partySize, time, name, callerPhone };
}

export async function simulateCall(
  input: {
    callerPhone: string;
    utterance: string;
    partySize?: number;
    reservationTime?: string;
  },
  restaurantId = env.RESTAURANT_ID,
) {
  const started = Date.now();
  const answer = await answerUtterance(input.utterance, restaurantId, {
    partySize: input.partySize,
    reservationTime: input.reservationTime,
  });

  let reservation = null;
  let outcome: 'reservation_booked' | 'faq_answered' = 'faq_answered';
  if (answer.intent === 'reservation') {
    const booking = parseBooking(input.utterance, input.callerPhone, input);
    reservation = await createReservation(
      {
        guestName: booking.name,
        phone: booking.callerPhone,
        partySize: booking.partySize,
        reservationTime: booking.time.toISOString(),
        status: 'confirmed',
        source: 'voice_ai',
        vip: false,
        notes: `Booked by Voice AI. Caller said: "${input.utterance}"`,
      },
      restaurantId,
    );
    outcome = 'reservation_booked';
  }

  const durationSeconds = Math.max(18, Math.round((Date.now() - started) / 1000) + 45);
  const call = await prisma.callLog.create({
    data: {
      restaurantId,
      callerPhone: input.callerPhone,
      durationSeconds,
      summary: reservation
        ? `Voice AI booked ${reservation.partySize} guests at ${new Date(reservation.reservationTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${reservation.tableNumber ? ` at ${reservation.tableNumber}` : ''}. ${answer.reply}`
        : answer.reply,
      transcript: `Caller: ${input.utterance}\nAgent: ${answer.reply}`,
      outcome,
      reservationId: reservation?.id ?? null,
      sentimentScore: outcome === 'reservation_booked' ? 0.9 : 0.8,
    },
  });

  emitRestaurant('VOICE_CALL_COMPLETED', {
    event: 'VOICE_CALL_COMPLETED',
    callId: call.id,
    intent: answer.intent,
    reply: answer.reply,
    outcome,
    reservation,
    usedGemini: answer.usedGemini,
    timestamp: new Date().toISOString(),
  }, restaurantId);

  if (reservation) {
    emitRestaurant('RESERVATION_CREATED', {
      event: 'RESERVATION_CREATED',
      reservation,
      source: 'voice_ai',
      timestamp: new Date().toISOString(),
    }, restaurantId);
  }

  return {
    callId: call.id,
    transcript: call.transcript,
    reply: answer.reply,
    intent: answer.intent,
    outcome,
    reservation,
    sources: answer.sources,
    eightySix: answer.eightySix,
    availability: answer.availability,
    usedGemini: answer.usedGemini,
    durationSeconds,
  };
}

export async function listCallLogs(restaurantId = env.RESTAURANT_ID, limit = 30) {
  const [calls, total, booked] = await Promise.all([
    prisma.callLog.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.callLog.count({ where: { restaurantId } }),
    prisma.callLog.count({ where: { restaurantId, outcome: 'reservation_booked' } }),
  ]);
  const avg = await prisma.callLog.aggregate({
    where: { restaurantId },
    _avg: { durationSeconds: true, sentimentScore: true },
  });
  return {
    calls: calls.map((c) => ({
      id: c.id,
      callerPhone: c.callerPhone,
      callerName: c.callerName,
      durationSeconds: c.durationSeconds,
      summary: c.summary,
      transcript: c.transcript,
      outcome: c.outcome,
      reservationId: c.reservationId,
      sentimentScore: c.sentimentScore ? Number(c.sentimentScore) : null,
      createdAt: c.createdAt.toISOString(),
    })),
    stats: {
      totalCalls: total,
      booked,
      bookingRate: total > 0 ? Math.round((booked / total) * 100) : 0,
      avgDurationSeconds: Math.round(avg._avg.durationSeconds ?? 0),
      avgSentiment: Number((avg._avg.sentimentScore ?? 0).toFixed(2)),
      live86: (await getLive86(restaurantId)).length,
    },
  };
}

function serializeKnowledge(row: {
  id: string;
  category: string;
  title: string;
  content: string;
  embedding: unknown;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    hasEmbedding: Boolean(row.embedding),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function knowledgeEmbedding(title: string, content: string) {
  return embedText(`${title}\n${content}`);
}

export async function listKnowledgeBase(restaurantId = env.RESTAURANT_ID) {
  const rows = await prisma.knowledgeBase.findMany({
    where: { restaurantId },
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
  });
  return rows.map(serializeKnowledge);
}

export async function createKnowledgeEntry(
  input: { category: string; title: string; content: string },
  restaurantId = env.RESTAURANT_ID,
) {
  const title = input.title.trim();
  const content = input.content.trim();
  const entry = await prisma.knowledgeBase.create({
    data: {
      restaurantId,
      category: input.category.trim(),
      title,
      content,
      embedding: knowledgeEmbedding(title, content),
    },
  });
  return serializeKnowledge(entry);
}

export async function updateKnowledgeEntry(
  id: string,
  input: { category?: string; title?: string; content?: string },
  restaurantId = env.RESTAURANT_ID,
) {
  const existing = await prisma.knowledgeBase.findFirst({
    where: { id, restaurantId },
  });
  if (!existing) throw notFound('Knowledge entry not found');

  const title = input.title?.trim() ?? existing.title;
  const content = input.content?.trim() ?? existing.content;
  const entry = await prisma.knowledgeBase.update({
    where: { id },
    data: {
      ...(input.category !== undefined ? { category: input.category.trim() } : {}),
      title,
      content,
      embedding: knowledgeEmbedding(title, content),
      updatedAt: new Date(),
    },
  });
  return serializeKnowledge(entry);
}

export async function deleteKnowledgeEntry(
  id: string,
  restaurantId = env.RESTAURANT_ID,
) {
  const existing = await prisma.knowledgeBase.findFirst({
    where: { id, restaurantId },
  });
  if (!existing) throw notFound('Knowledge entry not found');
  await prisma.knowledgeBase.delete({ where: { id } });
  return { id, deleted: true };
}

export function inboundTwiml(webOrigin = env.WEB_ORIGIN) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling Chefuffle. I can help with reservations, allergens, hours, parking, or tonight's menu.</Say>
  <Gather input="speech" action="${webOrigin.replace(/\/$/, '')}/api/voice/gather" speechTimeout="auto" language="en-US">
    <Say voice="Polly.Joanna">How can I help you tonight?</Say>
  </Gather>
  <Redirect>${webOrigin.replace(/\/$/, '')}/api/voice/gather</Redirect>
</Response>`;
}

export async function gatherTwiml(speech: string, callerPhone: string, restaurantId = env.RESTAURANT_ID) {
  const result = await simulateCall({ callerPhone, utterance: speech }, restaurantId);
  const reservationLine = result.reservation
    ? ` I've booked ${result.reservation.tableNumber ?? 'your table'} for ${result.reservation.partySize}. A text confirmation is on its way.`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(result.reply + reservationLine)}</Say>
  <Gather input="speech" action="${env.WEB_ORIGIN.replace(/\/$/, '')}/api/voice/gather" speechTimeout="auto" language="en-US">
    <Say voice="Polly.Joanna">Is there anything else I can help with?</Say>
  </Gather>
  <Hangup/>
</Response>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
