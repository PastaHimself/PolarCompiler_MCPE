declare module "@minecraft/server-ui" {
  import { Player } from "@minecraft/server";

  export interface ActionFormResponse {
    canceled: boolean;
    selection?: number;
  }

  export class ActionFormData {
    title(text: string): this;
    body(text: string): this;
    button(text: string): this;
    show(player: Player): Promise<ActionFormResponse>;
  }
}
