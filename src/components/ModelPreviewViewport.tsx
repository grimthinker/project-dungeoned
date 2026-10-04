import React, { useEffect, useRef } from 'react';
import { World } from '../ecs/World';
import { GameApp } from '../GameApp';
import { IModelPreview } from '../rendering/IModelPreview';
import { t } from '../locales';

export interface ModelPreviewViewportProps {
  app?: GameApp | null;
  world?: World | null;
  creatureId: string;
  structureType: string;
  animName: string;
  speed: number;
}

export const ModelPreviewViewport: React.FC<ModelPreviewViewportProps> = ({
  app,
  world,
  creatureId,
  structureType,
  animName,
  speed,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<IModelPreview | null>(null);

  // 1. Инициализация вьюпорта при монтировании DOM-контейнера
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !app?.renderer.createModelPreview) return;

    const preview = app.renderer.createModelPreview();
    preview.init(container);
    previewRef.current = preview;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          preview.resize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      preview.destroy();
      previewRef.current = null;
    };
  }, [app]);

  // 2. Загрузка рига модели при смене существа или структуры
  useEffect(() => {
    if (!previewRef.current || !world) return;
    const assembly = world.getComponent(creatureId, 'assemblyRoot');
    const attachments: { modelId: string; rigNodeName: string }[] = [];
    if (assembly?.partIds) {
      for (const partId of assembly.partIds) {
        const visual = world.getComponent(partId, 'visualModel');
        if (visual?.modelId && visual.rigNodeName) {
          attachments.push({ modelId: visual.modelId, rigNodeName: visual.rigNodeName });
        }
      }
    }
    previewRef.current
      .loadRig(structureType, attachments)
      .then(() => {
        previewRef.current?.setSpeed(speed);
        previewRef.current?.playAnimation(animName);
      })
      .catch((err) => console.error(err));
  }, [creatureId, structureType, world]);

  // 3. Реактивное обновление анимации
  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.playAnimation(animName);
    }
  }, [animName]);

  // 4. Реактивное обновление скорости
  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.setSpeed(speed);
    }
  }, [speed]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', cursor: 'grab' }}
      onMouseDown={(e) => (e.currentTarget.style.cursor = 'grabbing')}
      onMouseUp={(e) => (e.currentTarget.style.cursor = 'grab')}
    >
      <div
        style={{
          position: 'absolute',
          bottom: '6px',
          left: '8px',
          fontSize: '9px',
          color: '#666',
          pointerEvents: 'none',
          userSelect: 'none',
          backgroundColor: 'rgba(0,0,0,0.6)',
          padding: '2px 6px',
          borderRadius: '3px',
        }}
      >
        {t('dock.previewControlsHint')}
      </div>
    </div>
  );
};
