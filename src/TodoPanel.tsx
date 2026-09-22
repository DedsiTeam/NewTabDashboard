import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import type { TodoItem } from './types';

export function TodoPanel({
  todos,
  query,
  onQueryChange,
  onAdd,
  onEdit,
  onDelete,
  onView,
  onMove,
  collapsed,
  onToggleCollapsed,
}: {
  todos: TodoItem[];
  query: string;
  onQueryChange: (query: string) => void;
  onAdd: () => void;
  onEdit: (todo: TodoItem) => void;
  onDelete: (todo: TodoItem) => void;
  onView: (todo: TodoItem) => void;
  onMove: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    todoId: string;
    position: 'before' | 'after';
  } | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const visibleTodos = normalizedQuery
    ? todos.filter((todo) =>
        `${todo.title}\n${todo.content}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
      )
    : todos;
  return (
    <aside className={`todo-panel${collapsed ? ' is-collapsed' : ''}`} aria-label="待办列表">
      <header className="todo-panel-header">
        <div className="todo-panel-title">
          <ListChecks size={21} />
          <h2>待办事项</h2>
        </div>
        <button
          type="button"
          className="todo-add-button"
          onClick={onAdd}
          aria-label="添加待办"
          title="添加待办"
        >
          <Plus size={19} />
        </button>
      </header>

      <label className="todo-search" hidden={collapsed}>
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索待办…"
          aria-label="搜索待办"
        />
      </label>

      <div className="todo-list" hidden={collapsed}>
        {visibleTodos.length > 0 ? (
          visibleTodos.map((todo) => (
            <article
              className={`todo-item${draggedTodoId === todo.id ? ' is-dragging' : ''}${dropTarget?.todoId === todo.id ? ` drop-${dropTarget.position}` : ''}`}
              key={todo.id}
              style={
                {
                  borderLeftColor: todo.color,
                  viewTransitionName: `todo-${todo.id}`,
                } as CSSProperties
              }
              role="button"
              tabIndex={0}
              onClick={() => onView(todo)}
              onKeyDown={(event) => {
                if (event.currentTarget !== event.target) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onView(todo);
                }
              }}
              aria-label={`查看待办：${todo.title}`}
              onDragOver={(event) => {
                if (!draggedTodoId || draggedTodoId === todo.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const bounds = event.currentTarget.getBoundingClientRect();
                setDropTarget({
                  todoId: todo.id,
                  position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
                });
              }}
              onDrop={(event) => {
                if (!draggedTodoId || draggedTodoId === todo.id) return;
                event.preventDefault();
                event.stopPropagation();
                const bounds = event.currentTarget.getBoundingClientRect();
                onMove(
                  draggedTodoId,
                  todo.id,
                  event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
                );
                setDraggedTodoId(null);
                setDropTarget(null);
              }}
            >
              <button
                type="button"
                className="todo-drag-handle"
                draggable
                aria-label={`拖动调整${todo.title}的顺序`}
                title="拖动调整顺序"
                onClick={(event) => event.stopPropagation()}
                onDragStart={(event) => {
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', todo.id);
                  setDraggedTodoId(todo.id);
                }}
                onDragEnd={() => {
                  setDraggedTodoId(null);
                  setDropTarget(null);
                }}
              >
                <GripVertical size={16} />
              </button>
              <div className="todo-item-copy">
                <span className="todo-item-title">{todo.title}</span>
                {todo.content && <p className="todo-item-content">{todo.content}</p>}
              </div>
              <div className="todo-item-actions">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(todo);
                  }}
                  aria-label={`修改${todo.title}`}
                  title="修改待办"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="todo-delete-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(todo);
                  }}
                  aria-label={`删除${todo.title}`}
                  title="删除待办"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="todo-empty-state">
            <ListChecks size={28} />
            <p>{query.trim() ? '没有匹配的待办' : '暂无待办事项'}</p>
            {!query.trim() && (
              <button type="button" onClick={onAdd}>
                <Plus size={16} /> 添加第一条待办
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="todo-panel-footer">
        <button
          type="button"
          className="todo-collapse-button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? '展开待办列表' : '折叠待办列表'}
          title={collapsed ? '展开待办列表' : '折叠待办列表'}
        >
          {collapsed ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
        </button>
      </footer>
    </aside>
  );
}
