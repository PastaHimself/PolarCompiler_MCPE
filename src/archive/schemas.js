export const manifestSchema = {
  type: "object",
  required: ["format_version", "header", "modules"],
  properties: {
    format_version: {
      anyOf: [{ type: "number" }, { type: "string" }]
    },
    header: {
      type: "object",
      required: ["name", "description", "uuid", "version"],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        uuid: { type: "string" },
        version: {
          type: "array",
          items: { type: "integer" },
          minItems: 3
        },
        min_engine_version: {
          type: "array",
          items: { type: "integer" },
          minItems: 3
        }
      }
    },
    modules: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["type", "uuid", "version"],
        properties: {
          type: { type: "string" },
          uuid: { type: "string" },
          version: {
            anyOf: [
              {
                type: "array",
                items: { type: "integer" },
                minItems: 3
              },
              { type: "string" }
            ]
          }
        }
      }
    },
    dependencies: {
      type: "array"
    }
  }
};

export const itemSchema = {
  type: "object",
  required: ["format_version", "minecraft:item"],
  properties: {
    format_version: {},
    "minecraft:item": {
      type: "object",
      required: ["description"],
      properties: {
        description: {
          type: "object",
          required: ["identifier"],
          properties: {
            identifier: { type: "string" }
          }
        },
        components: { type: "object" }
      }
    }
  }
};

export const blockSchema = {
  type: "object",
  required: ["format_version", "minecraft:block"],
  properties: {
    format_version: {},
    "minecraft:block": {
      type: "object",
      required: ["description"],
      properties: {
        description: {
          type: "object",
          required: ["identifier"],
          properties: {
            identifier: { type: "string" }
          }
        },
        components: { type: "object" }
      }
    }
  }
};

export const entitySchema = {
  type: "object",
  required: ["format_version"],
  properties: {
    format_version: {},
    "minecraft:entity": { type: "object" }
  }
};

export const clientEntitySchema = {
  type: "object",
  required: ["format_version"],
  properties: {
    format_version: {},
    "minecraft:client_entity": { type: "object" }
  }
};

export const recipeSchema = {
  type: "object",
  required: ["format_version"],
  properties: {
    format_version: {}
  }
};

export const spawnRuleSchema = {
  type: "object",
  required: ["format_version"],
  properties: {
    format_version: {}
  }
};

export const animationSchema = {
  type: "object",
  required: ["format_version"],
  properties: {
    format_version: {}
  }
};

export const animationControllerSchema = {
  type: "object",
  required: ["format_version"],
  properties: {
    format_version: {}
  }
};

export const itemTextureSchema = {
  type: "object",
  required: ["texture_name", "texture_data"],
  properties: {
    texture_name: { type: "string" },
    texture_data: { type: "object" }
  }
};

export const terrainTextureSchema = {
  type: "object",
  required: ["texture_name", "texture_data"],
  properties: {
    texture_name: { type: "string" },
    texture_data: { type: "object" }
  }
};
