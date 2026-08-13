export type AuthMoment = {
  kicker: string
  title: string
  body: string
  line: string
}

export const HQ_AUTH_MOMENTS: AuthMoment[] = [
  {
    kicker: 'Partnership',
    title: 'The work holds when both sides stay in it.',
    body: 'HQ is where field visits, documents, and the client relationship stay one conversation instead of three inboxes.',
    line: 'Come back to the partnership, not a queue.',
  },
  {
    kicker: 'In the field together',
    title: 'Show up, leave a record, close the loop.',
    body: 'Partners do not disappear after the assignment lands. The visit, the photos, and the handoff are part of the same job.',
    line: 'Field and HQ, still in the same conversation.',
  },
  {
    kicker: 'Shared ownership',
    title: 'A name on the next step beats a status that sits.',
    body: 'Clients should never need an org chart to know who is moving their work. That is the point of this desk.',
    line: 'Put a name on the next step before you leave.',
  },
  {
    kicker: 'Trusted operators',
    title: 'You are the operating side of the relationship.',
    body: 'Not a ticket queue. A place where the firm and its partners keep promises with a paper trail.',
    line: 'This desk is how the firm keeps its promises.',
  },
  {
    kicker: 'Quiet coordination',
    title: 'The best partnership is the one the client barely has to manage.',
    body: 'Handoffs, visits, and follow-through should feel inevitable. Heroics usually mean the process slipped.',
    line: 'Make the handoff so clean the client never has to chase it.',
  },
  {
    kicker: 'One book of work',
    title: 'Field, files, and follow-through in the same room.',
    body: 'When the assignment, the document, and the client thread agree, nobody has to reconstruct the story at 4 p.m.',
    line: 'Keep the assignment, the file, and the thread in one room.',
  },
]

export const CLIENT_AUTH_MOMENTS: AuthMoment[] = [
  {
    kicker: 'Your workspace',
    title: 'Pick up where you and Pinnacle left off.',
    body: 'Requests, files, and next steps live here so nothing important gets buried in a text thread.',
    line: 'Pick up the work without re-explaining it.',
  },
  {
    kicker: 'Your team',
    title: 'People who already know the context.',
    body: 'Message them, send a file, or answer the one thing that unblocks the work. You should not have to re-explain the job.',
    line: 'Your team already has the context.',
  },
  {
    kicker: 'Your next step',
    title: 'When something needs you, it will be obvious.',
    body: 'When it does not, this is a quiet place to check in and go about your day.',
    line: 'See what needs you, then go about your day.',
  },
  {
    kicker: 'One relationship',
    title: 'Property, documents, and operations without a new inbox.',
    body: 'The same team, the same record, the same place to see what happens next.',
    line: 'One relationship. One place to see what happens next.',
  },
  {
    kicker: 'Follow-through',
    title: 'You should not have to chase an update.',
    body: 'Status, visits, and signatures stay attached to the work you asked Pinnacle to hold.',
    line: 'You should not have to chase an update.',
  },
  {
    kicker: 'At your pace',
    title: 'Come in for the one thing that matters today.',
    body: 'Pay a bill, sign a packet, confirm access, or leave a note. Then close the tab.',
    line: 'Come in for the one thing that matters today.',
  },
]

export const GENERAL_AUTH_MOMENTS: AuthMoment[] = [
  {
    kicker: 'Secure access',
    title: 'A calm door into the work.',
    body: 'Pinnacle keeps communication, documents, and next steps connected in one private place.',
    line: 'A calm door into the work.',
  },
]

export function authMomentsFor(surface: 'client' | 'staff' | 'general'): AuthMoment[] {
  if (surface === 'staff') return HQ_AUTH_MOMENTS
  if (surface === 'client') return CLIENT_AUTH_MOMENTS
  return GENERAL_AUTH_MOMENTS
}
