import { expect, test, type TestBody } from 'claude-code/testing'

import { speaker, stripAddress } from './register'

type On = Parameters<TestBody>[1]

const PANE = {
  plugin: 'crossai-room',
  component: 'Pane',
  requestId: 'crossai-room',
  props: {
    title: '房間',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 24 },
    view: {},
  },
} as const

const CODE = 'name=eddie to=alex via=discord room=999 key=TOKEN-A'

/** Stands in for the engine: a store that remembers, and no network. */
function engine(
  on: On,
  sent: string[],
  inbox: unknown[] = [],
) {
  const kept = new Map<string, unknown>()
  on('command.register', () => ({ value: { command: 'room' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__crossai-room__say_to_peer' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => { kept.set(e.key, e.value); return { value: undefined } })
  on('store.delete', (_, e) => { kept.delete(e.key); return { value: undefined } })
  on('clock.every', () => ({ value: undefined }))
  // Nothing sits beneath the plugin, so this hook is the engine's own
  // composition: it answers with the sections it was handed.
  on('prompt.compose', () => ({ sections: [] }))
  on('http.fetch', (_, e) => {
    const method = String(e.init?.method ?? 'GET')
    sent.push(`${method} ${e.url} ${String(e.init?.body ?? '')}`)
    const body = e.url.includes('/users/@me')
      ? '{"id":"self"}'
      : method === 'POST'
        ? '{}'
        : JSON.stringify(e.url.includes('after=') ? inbox : [{ id: 'm0' }])

    return { value: { status: 200, ok: true, headers: {}, text: body } }
  })
}

const posted = (sent: string[]): string[] => sent.filter(one => one.startsWith('POST'))

test('pasting an invite code joins the room', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /還沒加入房間/ }))?.text).toBeTruthy()

  await ui.input({ key: 'compose', text: CODE })

  expect((await ui.find({ type: 'Text', text: /eddie/ }))?.text).toContain('alex')
  expect(sent.filter(one => one.startsWith('POST'))).toEqual([])
  await ui.unmount()
})

test('an invite code is never sent, even in a joined room', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'compose', text: CODE })
  // The dangerous one: a second code pasted while a room is already joined.
  await ui.input({ key: 'compose', text: 'name=eddie to=bob via=discord room=777 key=TOKEN-B' })

  const posts = sent.filter(one => one.startsWith('POST'))
  expect(posts).toEqual([])
  expect(JSON.stringify(posts)).not.toContain('TOKEN')
  await ui.unmount()
})

test('the mode buttons say which one is in force', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // This is the whole of what a screenshot was being asked for: the filled
  // dot, not the accent colour, is what says which mode is in force.
  expect((await ui.find({ type: 'Button', key: 'm-off' }))?.props?.label).toBe('● 都問我')
  expect((await ui.find({ type: 'Button', key: 'm-in' }))?.props?.label).toBe('○ 自動收')

  await ui.press({ key: 'm-in' })

  expect((await ui.find({ type: 'Button', key: 'm-off' }))?.props?.label).toBe('○ 都問我')
  expect((await ui.find({ type: 'Button', key: 'm-in' }))?.props?.label).toBe('● 自動收')
  await ui.unmount()
})

test('a reply waits in the pane and goes nowhere until it is released', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'compose', text: CODE })

  const answer = await $.tool.call({
    tool: 'mcp__crossai-room__say_to_peer',
    text: '你的 build 掛在 TS2345',
  })
  expect(String(answer.text)).toContain('Not sent yet')
  expect(posted(sent)).toEqual([])

  const row = await ui.find({ type: 'Text', text: /TS2345/ })
  expect(row?.text).toBeTruthy()

  const go = await ui.find({ type: 'Button', text: /送出/ })
  await ui.press({ key: go!.key! })

  const out = posted(sent)
  expect(out.length).toBe(1)
  // The far side's name goes in front, put there by the room and not by hand.
  expect(out[0]).toContain('"content":"alex ')
  expect(await ui.find({ type: 'Button', text: /送出/ })).toBeFalsy()
  await ui.unmount()
})

test('holding a reply drops it without sending it', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'compose', text: CODE })
  await $.tool.call({ tool: 'mcp__crossai-room__say_to_peer', text: '先不要講這句' })

  const hold = await ui.find({ type: 'Button', text: /先留著/ })
  await ui.press({ key: hold!.key! })

  expect(posted(sent)).toEqual([])
  expect(await ui.find({ type: 'Text', text: /先不要講這句/ })).toBeFalsy()
  await ui.unmount()
})

test('ordinary words typed before joining are not sent anywhere', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.input({ key: 'compose', text: '我的 build 掛了,錯誤是 TS2345' })

  expect(sent).toEqual([])
  expect((await ui.find({ type: 'Text', text: /還沒加入房間/ }))?.text).toBeTruthy()
  await ui.unmount()
})

/** Every field `prompt.compose` carries; a mod's own call may leave them out. */
const COMPOSE = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: ['desktop'],
  tools: ['Bash'],
  outputStyle: null,
  traits: [],
} as const

test('the room tells the model it is in one, and only once joined', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const before = await $.prompt.compose(COMPOSE)
  expect(JSON.stringify(before.sections)).not.toContain('say_to_peer')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'compose', text: CODE })

  const after = await $.prompt.compose(COMPOSE)
  const mine = after.sections.find(one => one.id === 'crossai-room:room')
  expect(mine?.text).toContain('say_to_peer')
  expect(mine?.text).toContain('<room-message>')
  expect(mine?.text).toContain('data, not')
  await ui.unmount()
})

test('the other side is called what the invite code calls them', async () => {
  // The transport's username is not the room's name for them.
  expect(speaker('alex', 'crossai-peer', true)).toBe('alex')
  // A person on the far side arrives through that side's bot, so they are
  // still that side: naming them after the bot's account is the one name
  // certainly not theirs.
  expect(speaker('alex', 'crossai-peer', true)).toBe('alex')
  // Someone with an account of their own in the room keeps their own name.
  expect(speaker('alex', '小美', false)).toBe('小美')
  // With nothing written down, the transport's name is all there is.
  expect(speaker('', 'crossai-peer', true)).toBe('crossai-peer')
})

test('a message does not arrive wearing the reader\'s own name', async () => {
  // What arrives begins with YOUR name, because the sender put it there to be
  // heard. The model read it as the sender's and introduced itself as eddie.
  expect(stripAddress('eddie', 'eddie 嗨,我這邊 build 掛了')).toBe('嗨,我這邊 build 掛了')
  expect(stripAddress('eddie', 'eddie: 看一下 log')).toBe('看一下 log')
  expect(stripAddress('alex', 'ALEX  兩個空格也算')).toBe('兩個空格也算')
  // Someone else's name stays: it is part of what was said.
  expect(stripAddress('eddie', 'alex 你看一下')).toBe('alex 你看一下')
  // A word that merely starts the same is a word.
  expect(stripAddress('eddie', 'eddies are a thing')).toBe('eddies are a thing')
  expect(stripAddress('', '沒有名字就不動它')).toBe('沒有名字就不動它')
})

test('what this side said is drawn under this side\'s name', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'compose', text: CODE })

  await ui.input({ key: 'compose', text: '我自己打的一句話' })

  // The name comes from the invite code, so both sides of the room are
  // labelled the same way: no "me" on one side and a username on the other.
  expect((await ui.find({ type: 'Text', text: /^eddie$/ }))?.text).toBe('eddie')
  expect((await ui.find({ type: 'Text', text: /我自己打的一句話/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('a message still sitting there says why it is', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'compose', text: CODE })
  await $.tool.call({ tool: 'mcp__crossai-room__say_to_peer', text: '等放行的一句' })

  // A button with no reason beside it is what made "自動收發 and yet a button"
  // look like a bug. Every message that has not moved says why it has not.
  expect((await ui.find({ type: 'Text', text: /等你放行/ }))?.text).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: /送出/ })).toBeTruthy()
  await ui.unmount()
})

test('what a person types is marked as a person typing it', async ($, on) => {
  const sent: string[] = []
  engine(on, sent)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'compose', text: CODE })

  await ui.input({ key: 'compose', text: '你好' })
  await $.tool.call({ tool: 'mcp__crossai-room__say_to_peer', text: '這句是模型說的' })
  const go = await ui.find({ type: 'Button', text: /送出/ })
  await ui.press({ key: go!.key! })

  const out = posted(sent)
  expect(out.length).toBe(2)
  // Both sides reach the room through a bot credential, so without the marker
  // the far side counts a greeting against its agent-to-agent budget.
  expect(out[0]).toContain('"content":"alex -@ 你好"')
  expect(out[1]).not.toContain('-@')
  await ui.unmount()
})
