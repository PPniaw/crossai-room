export type Incoming = {
  id: string
  from: string
  role: 'peer-human' | 'peer-ai'
  text: string
}

export type Outgoing = {
  id: string
  text: string
}

/** off: everything waits for a press. in: messages come in by themselves. on: replies go out too. */
export type AutoMode = 'off' | 'in' | 'on'

/**
 * Where the room is and who this side is in it -- everything except the
 * credential.
 *
 * The credential lives in `$.store` alone and is never mirrored here, because
 * this value is what the pane reads to draw itself. A token in a rendered
 * value is a token on someone's screen.
 */
export type RoomConfig = {
  /** What this side is called in the room. Set by the address, not by hand. */
  name: string
  /**
   * The far side's name, put in front of everything sent.
   *
   * The bot on the other side only answers when it is addressed, so this is
   * the difference between a message arriving and a message being read and
   * dropped. Doing it here means the person never has to remember it.
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
      incoming: Incoming[]
      outgoing: Outgoing[]
      note: string
      mode: AutoMode
      hops: number
      me: string
      log: string[]
      draft: string
      room: RoomConfig | null
      /** The id of this side's own account on the transport, so its own messages are not read back as the peer's. */
      selfId: string
      /** The last message id taken from the transport. */
      cursor: string
    }
  }
}
