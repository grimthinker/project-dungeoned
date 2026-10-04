import { AIEventType } from './core';
import type { IAIAgent, IAIWorld } from './ports';

export function createBTAISystem(world: IAIWorld) {
  function processEvents(agent: IAIAgent, queue: any[]) {
    const bb = agent.blackboard;
    if (!queue || !bb) return;

    while (queue.length > 0) {
      const event = queue.shift()!;

      switch (event.type) {
        case AIEventType.SET_TARGET:
          bb.set('targetId', event.payload.targetId ?? event.payload.target_id);
          bb.set('isEngaged', false);
          break;
        case AIEventType.SET_PATROL_POINTS:
          bb.set('patrolPoints', event.payload.points);
          bb.set('currentPatrolIndex', 0);
          break;
        case AIEventType.APPLY_EFFECT:
          break;
        case AIEventType.WEAPON_CHANGED:
          break;
      }
    }
  }

  function update(_dt: number) {
    const agents = world.getAllAgents();

    for (const agent of agents) {
      const bb = agent.blackboard;
      if (bb) {
        const currentLocalTime = (bb.get('localTime') as number) ?? 0;
        bb.set('localTime', currentLocalTime + agent.dt);
      }

      // Получаем нативные события (хранятся под капотом в ECS)
      const rawQueue = (agent as any).getEventQueue ? (agent as any).getEventQueue() : [];
      processEvents(agent, rawQueue);

      const brain = (agent as any).brain;
      if (brain) {
        brain.root_node.tick(agent);
      }
    }
  }

  return { update };
}
