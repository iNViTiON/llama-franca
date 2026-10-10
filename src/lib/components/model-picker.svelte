<script lang="ts">
  import { groupModels, joinModel, splitModel } from "../models";

  /** Fork: model select, plus a device select when the server lists `model@DEVICE` names (plain Ollama doesn't). */
  let {
    models,
    value,
    onchange,
    class: className = "",
  }: {
    models: string[];
    value: string;
    onchange: (value: string) => void;
    class?: string;
  } = $props();

  let groups = $derived(groupModels(models));
  let choice = $derived(splitModel(value));
  // A saved choice the server doesn't list (not installed, or that device isn't served) stays selectable.
  let names = $derived(
    groups.has(choice.model) ? [...groups.keys()] : [choice.model, ...groups.keys()],
  );
  let devices = $derived.by(() => {
    const listed = groups.get(choice.model) ?? [];
    return !choice.device || listed.includes(choice.device) ? listed : [choice.device, ...listed];
  });

  function pick(model: string, device: string) {
    onchange(
      joinModel({ model, device: (groups.get(model) ?? []).includes(device) ? device : "" }),
    );
  }
</script>

<select
  class="control {className}"
  aria-label="Model"
  value={choice.model}
  onchange={(e) => pick(e.currentTarget.value, choice.device)}
>
  {#each names as name (name)}
    <option value={name}>{name}</option>
  {/each}
</select>
{#if devices.length}
  <select
    class="control {className}"
    aria-label="Device"
    value={choice.device}
    onchange={(e) => pick(choice.model, e.currentTarget.value)}
  >
    <option value="">Any device</option>
    {#each devices as device (device)}
      <option value={device}>{device}</option>
    {/each}
  </select>
{/if}
