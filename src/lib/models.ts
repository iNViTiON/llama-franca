/**
 * Fork: model + device picking. A server that runs a model on several devices (local-llm-npu-translator) lists
 * one name per device besides the plain one, e.g. `eurollm-1.7b-it` and `eurollm-1.7b-it@NPU`. Plain Ollama lists
 * no such names, so it only gets a model choice.
 */
export const DEVICES = ["NPU", "GPU", "CPU"] as const;

export interface ModelChoice {
  model: string;
  /** Empty for the plain name: the server picks the device (its default). */
  device: string;
}

export function splitModel(name: string): ModelChoice {
  const at = name.lastIndexOf("@");
  const device = at > 0 ? name.slice(at + 1).toUpperCase() : "";
  return (DEVICES as readonly string[]).includes(device)
    ? { model: name.slice(0, at), device }
    : { model: name, device: "" };
}

export const joinModel = ({ model, device }: ModelChoice) =>
  device ? `${model}@${device}` : model;

/** Models without device variants, and the devices each one is listed with, in server order. */
export function groupModels(names: string[]) {
  const devices = new Map<string, string[]>();
  for (const name of names) {
    const { model, device } = splitModel(name);
    const list = devices.get(model) ?? [];
    if (device) list.push(device);
    devices.set(model, list);
  }
  return devices;
}
