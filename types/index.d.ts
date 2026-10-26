/**
 * Who said something, as far as the room can tell.
 *
 * `peer-human` is the only one the transport proves: that message came from
 * an account of its own, not from a side's bot. Everything a side's bot
 * carries is `peer` -- their person and their Claude share one credential, so
 * which of them typed it cannot be known, only claimed.
 *
 * The hand-typed marker still lifts the brake that waits for a person, which
 * is a convention between two copies of this mod and forgeable by anyone who
 * can post to the room. It buys a resumed conversation and nothing else:
 * every one of these carries `authority="none"`.
 */
export type Speaker = 'peer-human' | 'peer'

export type Incoming = {
  id: string
  from: string
  role: Speaker
  text: string
  /** The sender marked this as typed by hand. A claim, never a proof. */
  byHand: boolean
}

/** off: everything waits for a press. in: messages come in by themselves. on: replies go out too. */
export type AutoMode = 'off' | 'in' | 'on'

/**
 * What became of one message, and therefore which buttons it carries.
 *
 * `held` is the state the pane used to draw with no explanation: a message
 * the automatic mode would have let in, stopped by the hop limit. Someone
 * reading "自動收發" above a button asking them to press it is right to be
 * confused, so the reason now travels with the message.
 */
export type TurnState = 'in' | 'held' | 'pending' | 'sent' | 'failed'

/** One line of the room, from either side. */
export type Turn = {
  id: string
  /** Which side of the pane it is drawn on. */
  side: 'them' | 'me'
  /** Who said it, as the room names them. */
  name: string
  text: string
  state: TurnState
  /** Why it is sitting there rather than gone, in the person's words. */
  why?: string
}

/**
 * Where the room is and who this side is in it -- everything except the
 * credential.
 *
 * The credential lives in `$.store` alone and is never mirrored here, because
 * this value is what the pane reads to draw itself. A token in a rendered
 * value is a token on someone's screen.
 */
export type RoomConfig = {
  /** What this side is called in the room. Set by the invite code, not by hand. */
  name: string
  /**
   * The far side's name, put in front of everything sent.
   *
   * It is also what the far side is called in the pane, since the transport's
   * own username is not the room's name for anyone.
   */
  to: string
  /** Which transport carries the room. */
  via: 'discord'
  /** The room's address on that transport. */
  room: string
}

declare module 'claude-code' {
  interface PluginState {
    'crossai-room': {
      history: Turn[]
      mode: AutoMode
      hops: number
      me: string
      /** Bumped on each send; the field's key, so sending replaces it empty. */
      round: number
      room: RoomConfig | null
      /** Why the room cannot be reached, when it cannot; empty otherwise. */
      trouble: string
      /** The id of this side's own account on the transport, so its own messages are not read back as the peer's. */
      selfId: string
      /** The last message id taken from the transport. */
      cursor: string
    }
  }
}
