declare module "@minecraft/server" {
  export interface Vector3 {
    x: number;
    y: number;
    z: number;
  }

  export class Entity {
    addTag(tag: string): boolean;
    removeTag(tag: string): boolean;
    triggerEvent(eventName: string): void;
  }

  export class Player extends Entity {
    sendMessage(message: string): void;
    getTags(): string[];
    name: string;
  }

  export interface Block {
    typeId: string;
  }

  export interface Dimension {
    getBlock(location: Vector3): Block | undefined;
    spawnEntity(identifier: string, location: Vector3): Entity;
    runCommand(command: string): {
      successCount: number;
      statusMessage: string;
    };
  }

  export interface EventSignal<T> {
    subscribe(callback: (event: T) => void): void;
  }

  export interface PlayerSpawnAfterEvent {
    player: Player;
    initialSpawn: boolean;
  }

  export interface ItemUseBeforeEvent {
    source: Player;
  }

  export interface EntityHitEntityAfterEvent {
    damagingEntity?: Entity;
    hitEntity?: Entity;
  }

  export const world: {
    afterEvents: {
      playerSpawn: EventSignal<PlayerSpawnAfterEvent>;
      entityHitEntity: EventSignal<EntityHitEntityAfterEvent>;
    };
    beforeEvents: {
      itemUse: EventSignal<ItemUseBeforeEvent>;
    };
    getDimension(id: string): Dimension;
    sendMessage(message: string): void;
    getPlayers(): Player[];
  };

  export const system: {
    run(callback: () => void): number;
    runInterval(callback: () => void, tickInterval?: number): number;
    clearRun(handle: number): void;
  };

  export class ItemStack {
    constructor(typeId: string, amount?: number);
  }
}
