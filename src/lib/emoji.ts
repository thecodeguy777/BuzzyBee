// Curated, searchable emoji set for the Comms picker — no dependency, just a
// hand-picked spread of the common ones with keywords for search. Extend freely.
export interface Emoji {
  c: string // character
  k: string // space-separated search keywords
}
export interface EmojiGroup {
  name: string
  emojis: Emoji[]
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    name: 'Smileys',
    emojis: [
      { c: '😀', k: 'grin happy smile' },
      { c: '😁', k: 'grin beaming happy' },
      { c: '😂', k: 'joy laugh tears lol' },
      { c: '🤣', k: 'rofl rolling laugh lol' },
      { c: '😊', k: 'blush smile happy' },
      { c: '😇', k: 'innocent halo angel' },
      { c: '🙂', k: 'slight smile' },
      { c: '😉', k: 'wink' },
      { c: '😍', k: 'heart eyes love' },
      { c: '🥰', k: 'love hearts adore' },
      { c: '😘', k: 'kiss blow love' },
      { c: '😎', k: 'cool sunglasses' },
      { c: '🤩', k: 'star struck wow amazing' },
      { c: '🤔', k: 'thinking hmm consider' },
      { c: '🤨', k: 'raised eyebrow skeptical' },
      { c: '😏', k: 'smirk' },
      { c: '😅', k: 'sweat smile relief nervous' },
      { c: '😬', k: 'grimace awkward' },
      { c: '🙃', k: 'upside down silly' },
      { c: '😴', k: 'sleep tired zzz' },
      { c: '😢', k: 'cry sad tear' },
      { c: '😭', k: 'sob cry bawl' },
      { c: '😤', k: 'huff steam frustrated' },
      { c: '😡', k: 'angry mad rage' },
      { c: '🤯', k: 'mind blown exploding' },
      { c: '😱', k: 'scream shock fear' },
      { c: '😳', k: 'flushed embarrassed' },
      { c: '🥳', k: 'party celebrate hat' },
      { c: '😋', k: 'yum tasty tongue' },
      { c: '🤤', k: 'drool' },
      { c: '🤗', k: 'hug hands' },
      { c: '🤫', k: 'shh quiet secret' },
      { c: '🫠', k: 'melt melting' },
      { c: '😩', k: 'weary tired frustrated' },
      { c: '🥺', k: 'pleading puppy eyes please' },
      { c: '😈', k: 'devil mischief' },
    ],
  },
  {
    name: 'Gestures',
    emojis: [
      { c: '👍', k: 'thumbs up yes good like approve' },
      { c: '👎', k: 'thumbs down no bad dislike' },
      { c: '👏', k: 'clap applause bravo' },
      { c: '🙌', k: 'raise hands celebrate praise' },
      { c: '🙏', k: 'pray please thanks thank you' },
      { c: '👌', k: 'ok perfect' },
      { c: '🤌', k: 'pinched fingers' },
      { c: '🤝', k: 'handshake deal agree' },
      { c: '✌️', k: 'peace victory' },
      { c: '🤞', k: 'fingers crossed luck hope' },
      { c: '🤙', k: 'call me shaka' },
      { c: '💪', k: 'muscle strong flex' },
      { c: '👋', k: 'wave hi hello bye' },
      { c: '🫡', k: 'salute respect yes sir' },
      { c: '✋', k: 'hand stop high five' },
      { c: '👇', k: 'point down' },
      { c: '👉', k: 'point right' },
      { c: '🫶', k: 'heart hands love' },
    ],
  },
  {
    name: 'Hearts & symbols',
    emojis: [
      { c: '❤️', k: 'heart love red' },
      { c: '🧡', k: 'orange heart' },
      { c: '💛', k: 'yellow heart' },
      { c: '💚', k: 'green heart' },
      { c: '💙', k: 'blue heart' },
      { c: '💜', k: 'purple heart' },
      { c: '🖤', k: 'black heart' },
      { c: '🤍', k: 'white heart' },
      { c: '💯', k: 'hundred perfect score 100' },
      { c: '🔥', k: 'fire lit hot flame' },
      { c: '✨', k: 'sparkles shiny magic' },
      { c: '⭐', k: 'star' },
      { c: '🎉', k: 'tada party celebrate confetti' },
      { c: '🎊', k: 'confetti celebrate' },
      { c: '✅', k: 'check done complete yes' },
      { c: '❌', k: 'cross no wrong' },
      { c: '❗', k: 'exclamation important' },
      { c: '❓', k: 'question' },
      { c: '⚠️', k: 'warning caution' },
      { c: '💡', k: 'idea bulb light' },
    ],
  },
  {
    name: 'Work',
    emojis: [
      { c: '🐝', k: 'bee buzzy hive' },
      { c: '🚀', k: 'rocket launch ship fast' },
      { c: '📈', k: 'chart up growth' },
      { c: '📉', k: 'chart down decline' },
      { c: '📌', k: 'pin' },
      { c: '📍', k: 'pin location' },
      { c: '🗓️', k: 'calendar date schedule' },
      { c: '⏰', k: 'alarm clock time' },
      { c: '✏️', k: 'pencil edit write' },
      { c: '📝', k: 'memo note write' },
      { c: '📎', k: 'paperclip attach' },
      { c: '💼', k: 'briefcase work business' },
      { c: '💻', k: 'laptop computer' },
      { c: '📞', k: 'phone call' },
      { c: '📣', k: 'megaphone announce' },
      { c: '🎯', k: 'target goal bullseye' },
      { c: '🏆', k: 'trophy win award' },
      { c: '🤑', k: 'money cash rich' },
      { c: '💰', k: 'money bag cash' },
      { c: '☕', k: 'coffee' },
    ],
  },
  {
    name: 'Animals & food',
    emojis: [
      { c: '🐶', k: 'dog puppy' },
      { c: '🐱', k: 'cat' },
      { c: '🦄', k: 'unicorn' },
      { c: '🐢', k: 'turtle slow' },
      { c: '🦅', k: 'eagle bird' },
      { c: '🐍', k: 'snake' },
      { c: '🍕', k: 'pizza' },
      { c: '🍔', k: 'burger' },
      { c: '🍻', k: 'beers cheers drink' },
      { c: '🍷', k: 'wine drink' },
      { c: '🎂', k: 'cake birthday' },
      { c: '🍩', k: 'donut' },
    ],
  },
]

const ALL = EMOJI_GROUPS.flatMap((g) => g.emojis)

export function searchEmoji(q: string): Emoji[] {
  const s = q.trim().toLowerCase()
  if (!s) return ALL
  return ALL.filter((e) => e.k.includes(s))
}
