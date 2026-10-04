import { World } from '../World';
import { getRootOwner } from '../utils/hierarchy';

export class FetchGameplaySystem {
  public update(_dt: number, world: World): void {
    const stickEntities = world.getEntitiesWith('fetchStick');

    for (const [id, { fetchStick }] of stickEntities) {
      const ownership = world.getComponent(id, 'ownership');
      const thrownObject = world.getComponent(id, 'thrownObject');

      if (ownership) {
        const rootOwnerId = getRootOwner(world, ownership.ownerId);
        // Предмет удерживается кем-то в руках или пасти
        if (rootOwnerId === fetchStick.ownerMasterId) {
          fetchStick.state = 'held_by_master';
        } else {
          fetchStick.state = 'held_by_dog';
          fetchStick.lastCarrierDogId = rootOwnerId;
        }
      } else {
        // Предмет находится на земле или летит в воздухе
        if (thrownObject?.isAirborne) {
          fetchStick.state = 'thrown';
        } else if (fetchStick.state === 'held_by_dog') {
          // Собака выпустила/сбросила предмет на землю
          fetchStick.state = 'delivered';
        }
      }
    }
  }
}
