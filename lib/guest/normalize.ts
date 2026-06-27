import type { GuestEntry, GuestReply } from '@/lib/types/site-content';
import { newId } from '@/lib/types/site-content';

export function normalizeGuestEntry(entry: GuestEntry): GuestEntry {
  if (entry.replies?.length) {
    return { ...entry, replies: entry.replies };
  }
  if (entry.reply?.trim()) {
    const legacy: GuestReply = {
      id: newId(),
      authorName: 'lakehouse',
      isAdmin: true,
      message: entry.reply,
      date: entry.replyDate || '',
    };
    return {
      ...entry,
      replies: [legacy],
      reply: undefined,
      replyDate: undefined,
    };
  }
  return { ...entry, replies: [] };
}

export function normalizeGuestList(guests: GuestEntry[]): GuestEntry[] {
  return guests.map(normalizeGuestEntry);
}
