import { World } from '../World';
import { PhysicsSystem } from './PhysicsSystem';
import { EntityId } from '../types';

export class AttachmentSystem {
  public update(world: World, physics: PhysicsSystem): void {
    const entities = world.getEntitiesWith('transform', 'attachment');

    for (const [id, { transform, attachment }] of entities) {
      const parent = world.getEntity(attachment.parentId);
      const areaEffector = world.getComponent(id, 'areaEffector');

      // 1. Проверка удаления родителя из мира
      if (!parent || !parent.transform) {
        const destroyOnRemoval = areaEffector?.destroyOnParentRemoval ?? true;
        if (destroyOnRemoval) {
          this.removeEntitySafe(world, physics, id);
        } else {
          world.removeComponent(id, 'attachment');
        }
        continue;
      }

      // 2. Проверка гибели родителя (isAlive === false)
      if (parent.health && !parent.health.isAlive) {
        const destroyOnDeath = areaEffector?.destroyOnParentDeath ?? false;
        if (destroyOnDeath) {
          this.removeEntitySafe(world, physics, id);
          continue;
        }
      }

      // 3. Синхронизация координат с родителем
      const targetX = parent.transform.x + (attachment.offsetX ?? 0);
      const targetY = parent.transform.y + (attachment.offsetY ?? 0);
      const targetZ = parent.transform.z + (attachment.offsetZ ?? 0);

      transform.x = targetX;
      transform.y = targetY;
      transform.z = targetZ;

      // 4. Синхронизация физического тела-сенсора
      const phys = world.getComponent(id, 'physicsBody');
      if (phys && phys.bodyHandle !== undefined && physics.driver) {
        physics.driver.setBodyTranslation(
          phys.bodyHandle,
          { x: targetX, y: targetY, z: targetZ },
          true
        );
      }
    }
  }

  private removeEntitySafe(world: World, physics: PhysicsSystem, id: EntityId): void {
    const phys = world.getComponent(id, 'physicsBody');
    if (phys && phys.bodyHandle !== undefined) {
      physics.driver?.removeRigidBody(phys.bodyHandle);
    }
    world.removeEntity(id);
  }
}
