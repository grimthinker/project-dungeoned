export interface PreviewPartAttachment {
  modelId: string;
  rigNodeName: string;
}

export interface IModelPreview {
  /** Инициализация области предпросмотра внутри переданного контейнера */
  init(container: HTMLDivElement): void;

  /** Асинхронная загрузка рига существа и прикрепление дочерних частей по имени нод */
  loadRig(structureType: string, attachments?: PreviewPartAttachment[]): Promise<void>;

  /** Запуск анимации по ее строковому ключу */
  playAnimation(animName: string): void;

  /** Изменение скорости воспроизведения */
  setSpeed(speed: number): void;

  /** Обновление размеров (вызывается из ResizeObserver) */
  resize(width: number, height: number): void;

  /** Очистка ресурсов, слушателей и остановка цикла рендера */
  destroy(): void;
}
