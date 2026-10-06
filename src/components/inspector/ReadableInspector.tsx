import React, { useState, useEffect } from 'react';
import { World } from '../../ecs/World';
import { GameApp } from '../../GameApp';

export interface ReadableInspectorProps {
  targetId: string;
  world: World;
  app?: GameApp | null;
  isReadOnly?: boolean;
  onCommit: (desc: string) => void;
}

export const ReadableInspector: React.FC<ReadableInspectorProps> = ({
  targetId,
  world,
  app,
  isReadOnly,
  onCommit,
}) => {
  const readable = world.getComponent(targetId, 'readable');

  const [title, setTitle] = useState(readable?.title ?? '');
  const [isMultiPage, setIsMultiPage] = useState(
    Boolean(readable?.pages && readable.pages.length > 0)
  );
  const [text, setText] = useState(readable?.text ?? '');
  const [pages, setPages] = useState<string[]>(readable?.pages ?? []);
  const [activePageIndex, setActivePageIndex] = useState(0);

  useEffect(() => {
    const comp = world.getComponent(targetId, 'readable');
    if (comp) {
      setTitle(comp.title ?? '');
      const multi = Boolean(comp.pages && comp.pages.length > 0);
      setIsMultiPage(multi);
      setText(comp.text ?? '');
      setPages(comp.pages ? [...comp.pages] : []);
      setActivePageIndex(0);
    }
  }, [targetId, world]);

  if (!readable) return null;

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (app) {
      app.mutations.updateEntityReadable(targetId, { title: val });
      onCommit('Изменение заголовка читаемого объекта');
    }
  };

  const handleTextChange = (val: string) => {
    setText(val);
    if (app) {
      app.mutations.updateEntityReadable(targetId, { text: val });
      onCommit('Изменение текста для чтения');
    }
  };

  const handlePageContentChange = (index: number, val: string) => {
    const newPages = [...pages];
    newPages[index] = val;
    setPages(newPages);
    if (app) {
      app.mutations.updateEntityReadable(targetId, { pages: newPages });
      onCommit('Изменение текста страницы книги');
    }
  };

  const handleAddPage = () => {
    const newPages = [...pages, ''];
    setPages(newPages);
    setActivePageIndex(newPages.length - 1);
    if (app) {
      app.mutations.updateEntityReadable(targetId, { pages: newPages });
      onCommit('Добавление страницы книги');
    }
  };

  const handleDeletePage = (index: number) => {
    const newPages = pages.filter((_, i) => i !== index);
    setPages(newPages);
    setActivePageIndex((prev) => Math.max(0, Math.min(newPages.length - 1, prev)));
    if (app) {
      app.mutations.updateEntityReadable(targetId, { pages: newPages });
      onCommit('Удаление страницы книги');
    }
  };

  const handleToggleMultiPage = (multi: boolean) => {
    setIsMultiPage(multi);
    if (multi) {
      const initPages = pages.length > 0 ? pages : [text || ''];
      setPages(initPages);
      if (app) {
        app.mutations.updateEntityReadable(targetId, { pages: initPages });
        onCommit('Включение режима страниц книги');
      }
    } else {
      const singleText = text || (pages.length > 0 ? pages.join('\n\n') : '');
      setText(singleText);
      if (app) {
        app.mutations.updateEntityReadable(targetId, { pages: [], text: singleText });
        onCommit('Переключение в режим одиночного текста');
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
        <span>Заголовок / Название текста:</span>
        <input
          disabled={isReadOnly}
          type="text"
          value={title}
          placeholder="Например: Записка путника, Дневник"
          onChange={(e) => handleTitleChange(e.target.value)}
          style={{ padding: '4px 6px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }}
        />
      </label>

      {/* Переключатель: Одностраничный текст / Книга с страницами */}
      <div style={{ display: 'flex', gap: '6px', margin: '4px 0' }}>
        <button
          type="button"
          disabled={isReadOnly}
          onClick={() => handleToggleMultiPage(false)}
          style={{
            flex: 1,
            padding: '4px 6px',
            fontSize: '11px',
            backgroundColor: !isMultiPage ? '#2980b9' : '#222',
            color: '#fff',
            border: !isMultiPage ? '1px solid #3498db' : '1px solid #444',
            borderRadius: '3px',
            cursor: isReadOnly ? 'default' : 'pointer',
          }}
        >
          📜 Одиночный текст
        </button>
        <button
          type="button"
          disabled={isReadOnly}
          onClick={() => handleToggleMultiPage(true)}
          style={{
            flex: 1,
            padding: '4px 6px',
            fontSize: '11px',
            backgroundColor: isMultiPage ? '#2980b9' : '#222',
            color: '#fff',
            border: isMultiPage ? '1px solid #3498db' : '1px solid #444',
            borderRadius: '3px',
            cursor: isReadOnly ? 'default' : 'pointer',
          }}
        >
          📖 Книга (Страницы)
        </button>
      </div>

      {!isMultiPage ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
          <span>Содержимое текста:</span>
          <textarea
            disabled={isReadOnly}
            rows={6}
            value={text}
            placeholder="Введите текст сообщения или знака..."
            onChange={(e) => handleTextChange(e.target.value)}
            style={{
              padding: '6px',
              fontSize: '11px',
              backgroundColor: '#111',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '4px',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </label>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#bdc3c7', fontWeight: 'bold' }}>
              Страницы ({pages.length}):
            </span>
            {!isReadOnly && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleAddPage}
                style={{
                  backgroundColor: '#27ae60',
                  color: '#fff',
                  padding: '2px 8px',
                  fontSize: '10px',
                }}
              >
                + Добавить страницу
              </button>
            )}
          </div>

          {pages.length > 0 ? (
            <>
              {/* Переключатель вкладок страниц */}
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  overflowX: 'auto',
                  paddingBottom: '2px',
                }}
              >
                {pages.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActivePageIndex(idx)}
                    style={{
                      padding: '3px 8px',
                      fontSize: '10px',
                      backgroundColor: activePageIndex === idx ? '#2ecc71' : '#222',
                      color: activePageIndex === idx ? '#000' : '#fff',
                      fontWeight: activePageIndex === idx ? 'bold' : 'normal',
                      border: '1px solid #444',
                      borderRadius: '3px',
                      cursor: 'pointer',
                    }}
                  >
                    Стр. {idx + 1}
                  </button>
                ))}
              </div>

              {/* Редактирование активной страницы */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#888' }}>
                    Текст страницы {activePageIndex + 1}:
                  </span>
                  {!isReadOnly && pages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeletePage(activePageIndex)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#e74c3c',
                        cursor: 'pointer',
                        fontSize: '11px',
                        padding: 0,
                      }}
                    >
                      Удалить страницу
                    </button>
                  )}
                </div>
                <textarea
                  disabled={isReadOnly}
                  rows={6}
                  value={pages[activePageIndex] || ''}
                  placeholder={`Введите текст страницы ${activePageIndex + 1}...`}
                  onChange={(e) => handlePageContentChange(activePageIndex, e.target.value)}
                  style={{
                    padding: '6px',
                    fontSize: '11px',
                    backgroundColor: '#111',
                    color: '#fff',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </div>
            </>
          ) : (
            <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
              Нет страниц. Нажмите "+ Добавить страницу"
            </div>
          )}
        </div>
      )}
    </div>
  );
};
