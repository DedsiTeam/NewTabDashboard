import { Check, CircleAlert, Copy, Palette, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmDialog } from './dialogs';
import type { TodoItem } from './types';

const formatTime = (value: string) => {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

function TodoColorPicker({ value, onChange, label, disabled = false }: {
  value: string; onChange: (color: string) => void; label: string; disabled?: boolean;
}) {
  return <label className="todo-color-control" title={label} style={{ color: value }}>
    <Palette size={16} aria-hidden="true" />
    <input type="color" aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

export function TodoPanel({ items, onChange, disabled }: {
  items: TodoItem[]; onChange: (items: TodoItem[]) => void; disabled: boolean;
}) {
  const [content, setContent] = useState('');
  const [color, setColor] = useState('#ffffff');
  const [draftColor, setDraftColor] = useState('#ffffff');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<TodoItem | null>(null);
  const [copyResult, setCopyResult] = useState<{ id: string; success: boolean } | null>(null);
  useEffect(() => {
    if (!copyResult) return;
    const timer = window.setTimeout(() => setCopyResult(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copyResult]);
  async function copyContent(item: TodoItem) {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopyResult({ id: item.id, success: true });
    } catch {
      setCopyResult({ id: item.id, success: false });
    }
  }
  const inputRef = useRef<HTMLTextAreaElement>(null);
  function add() {
    if (!content.trim() || disabled) return;
    onChange([{ id: crypto.randomUUID(), content: content.trim(), color, createdAt: new Date().toISOString() }, ...items]);
    setContent('');
    inputRef.current?.focus();
  }
  return <aside className="todo-panel" aria-label="待办事项">
    <form className="todo-create" onSubmit={(event) => { event.preventDefault(); add(); }}>
      <label className="todo-input-label" htmlFor="new-todo">添加待办内容</label>
      <textarea id="new-todo" ref={inputRef} value={content} style={{ color }} onChange={(event) => setContent(event.target.value)}
        placeholder="有什么想做的事？" rows={2} maxLength={2000} disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault(); add();
          }
        }} />
      <div className="todo-create-footer"><span>Enter 添加 · Shift + Enter 换行</span>
        <div className="todo-create-actions">
          <TodoColorPicker value={color} onChange={setColor} label="新待办文字颜色" disabled={disabled} />
        <button className="todo-add" type="submit" disabled={disabled || !content.trim()}><Plus size={16} />添加</button></div></div>
    </form>
    <div className="todo-list">
      {items.length > 0 &&
        <ul>{items.map((item) => <li className="todo-item" key={item.id}>
          {editingId === item.id ? <form className="todo-edit" onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            onChange(items.map((todo) => todo.id === item.id ? { ...todo, content: draft.trim(), color: draftColor } : todo));
            setEditingId(null);
          }}>
            <textarea aria-label="修改待办内容" autoFocus value={draft} style={{ color: draftColor }} maxLength={2000} rows={3}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setEditingId(null); }} />
            <div className="todo-edit-actions"><TodoColorPicker value={draftColor} onChange={setDraftColor} label="编辑待办文字颜色" /><button type="button" onClick={() => setEditingId(null)}><X size={14} />取消</button>
              <button type="submit" disabled={!draft.trim()}><Check size={14} />保存</button></div>
          </form> : <>
            <p className="todo-content" style={{ color: item.color ?? '#ffffff' }}>{item.content}</p>
            <div className="todo-item-footer"><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString('zh-CN')}>{formatTime(item.createdAt)}</time>
              <div className="todo-item-actions">
                <TodoColorPicker value={item.color ?? '#ffffff'} label={`修改待办颜色：${item.content}`}
                  onChange={(nextColor) => onChange(items.map((todo) => todo.id === item.id ? { ...todo, color: nextColor } : todo))} />
                <button type="button" aria-label={`复制待办：${item.content}`}
                  title={copyResult?.id === item.id ? (copyResult.success ? '已复制' : '复制失败，请重试') : '复制内容'}
                  onClick={() => void copyContent(item)}>
                  {copyResult?.id === item.id && copyResult.success ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button type="button" aria-label={`编辑待办：${item.content}`} title="编辑" onClick={() => { setEditingId(item.id); setDraft(item.content); setDraftColor(item.color ?? '#ffffff'); }}><Pencil size={14} /></button>
                <button type="button" aria-label={`删除待办：${item.content}`} title="删除" onClick={() => setDeleting(item)}><Trash2 size={14} /></button></div>
            </div>
          </>}
        </li>)}</ul>}
    </div>
    {copyResult && createPortal(
      <div className="todo-copy-toast" role="status" aria-live="polite">
        {copyResult.success ? <Check size={18} /> : <CircleAlert size={18} />}
        <span>{copyResult.success ? '内容已复制' : '复制失败，请重试'}</span>
      </div>, document.body,
    )}
    <ConfirmDialog open={deleting !== null} title="删除这条待办？" description={deleting?.content ?? ''} confirmText="删除"
      onClose={() => setDeleting(null)} onConfirm={() => { onChange(items.filter((item) => item.id !== deleting?.id)); setDeleting(null); }} />
  </aside>;
}
