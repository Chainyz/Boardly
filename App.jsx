import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Type, ImagePlus, StickyNote, Share2, Trash2, Download, Link2, MousePointer2, Users, Check, Sparkles } from 'lucide-react'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = url && anon && !url.includes('YOUR_PROJECT') ? createClient(url, anon) : null
const colors = ['#fff0a8','#ffd9e8','#d8f4df','#dce9ff','#eadfff','#ffe1c4']
const makeId = () => crypto.randomUUID()
const getBoardId = () => {
  const params = new URLSearchParams(location.search)
  let id = params.get('board')
  if (!id) { id = makeId().slice(0, 8); params.set('board', id); history.replaceState({}, '', `${location.pathname}?${params}`) }
  return id
}

export default function App() {
  const boardId = useMemo(getBoardId, [])
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('Our ideas')
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState(supabase ? 'Connecting…' : 'Setup needed')
  const [shareOpen, setShareOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const boardRef = useRef(null)
  const drag = useRef(null)
  const saveTimers = useRef({})

  const persist = useCallback(async (item) => {
    if (!supabase) return
    const row = { ...item, board_id: boardId, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('board_items').upsert(row)
    if (error) setStatus('Sync issue')
  }, [boardId])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    ;(async () => {
      let { data: board } = await supabase.from('boards').select('*').eq('id', boardId).maybeSingle()
      if (!board) {
        const result = await supabase.from('boards').insert({ id: boardId, title: 'Our ideas' }).select().single()
        board = result.data
      }
      if (board && alive) setTitle(board.title)
      const { data, error } = await supabase.from('board_items').select('*').eq('board_id', boardId)
      if (!error && alive) { setItems(data || []); setStatus('Live sync on') }
      const channel = supabase.channel(`board-${boardId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'board_items', filter: `board_id=eq.${boardId}` }, payload => {
          if (!alive) return
          if (payload.eventType === 'DELETE') setItems(old => old.filter(i => i.id !== payload.old.id))
          else setItems(old => old.some(i => i.id === payload.new.id) ? old.map(i => i.id === payload.new.id ? payload.new : i) : [...old, payload.new])
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` }, payload => alive && setTitle(payload.new.title))
        .subscribe()
      return () => supabase.removeChannel(channel)
    })()
    return () => { alive = false }
  }, [boardId])

  const addItem = async (kind) => {
    const item = { id: makeId(), board_id: boardId, kind, x: 100 + Math.random()*80, y: 80 + Math.random()*70, w: kind === 'text' ? 250 : 250, h: kind === 'text' ? 120 : 180, content: kind === 'text' ? 'Double-click to edit this text' : kind === 'note' ? 'Write an idea…' : '', color: colors[Math.floor(Math.random()*colors.length)] }
    setItems(old => [...old, item]); setSelected(item.id)
    if (supabase) { const { error } = await supabase.from('board_items').upsert(item); if (error) setStatus('Could not save') }
  }

  const updateItem = (id, patch, immediate = false) => {
    setItems(old => old.map(item => item.id === id ? { ...item, ...patch } : item))
    const next = items.find(i => i.id === id)
    if (!next || !supabase) return
    clearTimeout(saveTimers.current[id])
    const updated = { ...next, ...patch, board_id: boardId }
    if (immediate) persist(updated)
    else saveTimers.current[id] = setTimeout(() => persist(updated), 350)
  }

  const uploadImage = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setBusy(true)
    let imageUrl
    if (supabase) {
      const path = `${boardId}/${makeId()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
      const { error } = await supabase.storage.from('boardly-images').upload(path, file, { contentType: file.type })
      if (error) { setStatus('Image upload failed'); setBusy(false); return }
      imageUrl = supabase.storage.from('boardly-images').getPublicUrl(path).data.publicUrl
    } else imageUrl = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file) })
    const item = { id: makeId(), board_id: boardId, kind: 'image', x: 130, y: 100, w: 300, h: 220, content: imageUrl, color: '#ffffff' }
    setItems(old => [...old, item]); setSelected(item.id)
    if (supabase) await persist(item)
    setBusy(false)
  }

  const changeTitle = async value => {
    setTitle(value)
    if (supabase) await supabase.from('boards').upsert({ id: boardId, title: value })
  }
  const removeItem = async id => {
    setItems(old => old.filter(i => i.id !== id)); setSelected(null)
    if (supabase) await supabase.from('board_items').delete().eq('id', id)
  }
  const copyLink = async () => {
    await navigator.clipboard.writeText(location.href)
    setShareOpen(false); setStatus('Board link copied!')
    setTimeout(() => setStatus(supabase ? 'Live sync on' : 'Local preview'), 2200)
  }

  const startDrag = (e, item, mode = 'move') => {
    if (e.button !== 0 || e.target.closest('textarea,input,button,.resize')) return
    setSelected(item.id)
    drag.current = { id: item.id, mode, startX: e.clientX, startY: e.clientY, x: item.x, y: item.y, w: item.w, h: item.h }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const moveDrag = e => {
    const d = drag.current; if (!d) return
    const dx = (e.clientX - d.startX) / (boardRef.current?.getBoundingClientRect().width / (boardRef.current?.clientWidth || 1) || 1)
    const dy = (e.clientY - d.startY) / (boardRef.current?.getBoundingClientRect().height / (boardRef.current?.clientHeight || 1) || 1)
    if (d.mode === 'resize') updateItem(d.id, { w: Math.max(120, d.w + dx), h: Math.max(90, d.h + dy) })
    else updateItem(d.id, { x: Math.max(0, d.x + dx), y: Math.max(0, d.y + dy) })
  }
  const endDrag = () => {
    const d = drag.current
    if (d) { const item = items.find(i => i.id === d.id); if (item) persist(item) }
    drag.current = null
  }

  return <div className="app">
    <header className="topbar">
      <a className="brand" href={location.pathname}><span className="brand-icon"><Sparkles size={19}/></span><span>Boardly</span></a>
      <div className="board-title"><input aria-label="Board title" value={title} onChange={e => changeTitle(e.target.value)} /></div>
      <div className="top-actions"><span className={`status ${status === 'Live sync on' ? 'online' : ''}`}><i />{status}</span><button className="share" onClick={() => setShareOpen(true)}><Share2 size={16}/> Share board</button></div>
    </header>
    <main className="workspace">
      <aside className="toolbar">
        <div className="tool-label">ADD TO BOARD</div>
        <button onClick={() => addItem('text')}><Type/><span>Text box</span><kbd>T</kbd></button>
        <button onClick={() => addItem('note')}><StickyNote/><span>Sticky note</span></button>
        <label className="tool-upload"><ImagePlus/><span>Add image</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { uploadImage(e.target.files?.[0]); e.target.value = '' }}/></label>
        <div className="toolbar-divider"/>
        <button onClick={() => setSelected(null)}><MousePointer2/><span>Select</span></button>
        {selected && <button className="delete-tool" onClick={() => removeItem(selected)}><Trash2/><span>Delete selected</span></button>}
        <div className="toolbar-bottom"><div className="avatar-stack"><span>Y</span><span>+</span></div><small>Made for making things together.</small></div>
      </aside>
      <section className="canvas-wrap">
        <div className="canvas-hint"><span className="hint-dot"/> Your shared space <span>·</span> Drag items to arrange your ideas</div>
        <div className="canvas" ref={boardRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerDown={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          {items.map(item => <div key={item.id} className={`board-item ${item.kind} ${selected === item.id ? 'selected' : ''}`} style={{ left: item.x, top: item.y, width: item.w, height: item.h, background: item.kind === 'image' ? 'white' : item.color, zIndex: selected === item.id ? 10 : 1 }} onPointerDown={e => startDrag(e, item)} onClick={() => setSelected(item.id)}>
            {item.kind === 'image' ? <img className="board-image" src={item.content} alt="Board upload" draggable="false"/> :
              <textarea value={item.content} aria-label={item.kind === 'note' ? 'Sticky note text' : 'Text box'} onChange={e => updateItem(item.id, { content: e.target.value })} onBlur={() => { const it = items.find(x=>x.id===item.id); if(it) persist(it) }} onPointerDown={e => e.stopPropagation()} placeholder="Type something…"/>}
            {selected === item.id && <><button className="item-delete" title="Delete item" onPointerDown={e=>e.stopPropagation()} onClick={()=>removeItem(item.id)}><Trash2 size={13}/></button><div className="resize" title="Resize" onPointerDown={e => { e.stopPropagation(); startDrag(e, item, 'resize') }} /></>}
          </div>)}
          {!items.length && <div className="empty-state"><div className="empty-emoji">💡</div><h2>Every great idea starts somewhere.</h2><p>Add a note, write some text, or drop in an image.</p><button onClick={() => addItem('note')}><Plus size={16}/> Add your first note</button></div>}
        </div>
        <footer className="canvas-footer"><span><MousePointer2 size={14}/> Select and drag</span><span><Users size={14}/> Invite others with Share board</span><span>{items.length} {items.length === 1 ? 'item' : 'items'}</span></footer>
      </section>
    </main>
    {shareOpen && <div className="modal-backdrop" onClick={() => setShareOpen(false)}><div className="share-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShareOpen(false)}>×</button><div className="modal-icon"><Link2/></div><h2>Share your board</h2><p>Anyone with this link can open and edit this board. Only share it with people you trust.</p><div className="link-box"><span>{location.href}</span><button onClick={copyLink}><Link2 size={15}/> Copy link</button></div><div className="share-note"><Users size={16}/> Changes sync for everyone when connected to your online database.</div></div></div>}
    {(!supabase) && <div className="setup-banner"><strong>Preview mode</strong> — connect Supabase to enable persistent boards, shared image uploads and live syncing. <a href="https://supabase.com" target="_blank" rel="noreferrer">Set up database ↗</a></div>}
    {busy && <div className="busy">Uploading image…</div>}
  </div>
}
