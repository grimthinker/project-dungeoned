export class StoryFlagsManager {
  private static flags: Map<string, any> = new Map();

  public static setFlag(key: string, value: any): void {
    StoryFlagsManager.flags.set(key, value);
  }

  public static getFlag<T = any>(key: string): T | undefined {
    return StoryFlagsManager.flags.get(key);
  }

  public static hasFlag(key: string): boolean {
    return StoryFlagsManager.flags.has(key);
  }

  public static removeFlag(key: string): void {
    StoryFlagsManager.flags.delete(key);
  }

  public static clear(): void {
    StoryFlagsManager.flags.clear();
  }

  public static getAllFlags(): Record<string, any> {
    return Object.fromEntries(StoryFlagsManager.flags.entries());
  }

  public static loadFlags(flagsObj: Record<string, any> | undefined): void {
    StoryFlagsManager.flags.clear();
    if (flagsObj && typeof flagsObj === 'object') {
      for (const [k, v] of Object.entries(flagsObj)) {
        StoryFlagsManager.flags.set(k, v);
      }
    }
  }
}
