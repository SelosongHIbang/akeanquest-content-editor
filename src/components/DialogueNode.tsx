import type { Choice, DialogueNode as DialogueNodeType } from "../types/content";

type DialogueNodeProps = {
  node: DialogueNodeType;
  index: number;
  onChange: (index: number, updatedNode: DialogueNodeType) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onAdd: (index: number) => void;
};

function DialogueNode({
  node,
  index,
  onChange,
  onDuplicate,
  onDelete,
  onAdd,
}: DialogueNodeProps) {
  function updateField<K extends keyof DialogueNodeType>(
    field: K,
    value: DialogueNodeType[K],
  ) {
    onChange(index, {
      ...node,
      [field]: value,
    });
  }

  function addChoice() {
    const choices = node.choices ?? [];
    updateField("choices", [...choices, { label: "", next: null }]);
  }

  function updateChoice(
    choiceIndex: number,
    field: keyof Choice,
    value: string | number | null,
  ) {
    const choices = [...(node.choices ?? [])];
    choices[choiceIndex] = {
      ...choices[choiceIndex],
      [field]: value,
    };
    updateField("choices", choices);
  }

  function deleteChoice(choiceIndex: number) {
    const choices = [...(node.choices ?? [])];
    choices.splice(choiceIndex, 1);
    updateField("choices", choices.length > 0 ? choices : undefined);
  }

  function moveChoice(choiceIndex: number, direction: -1 | 1) {
    const choices = [...(node.choices ?? [])];
    const targetIndex = choiceIndex + direction;

    if (targetIndex < 0 || targetIndex >= choices.length) {
      return;
    }

    [choices[choiceIndex], choices[targetIndex]] = [
      choices[targetIndex],
      choices[choiceIndex],
    ];

    updateField("choices", choices);
  }

  const hasChoices = (node.choices?.length ?? 0) > 0;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">
          {hasChoices ? "USER PROMPT NODE" : `Node #${index}`}
        </span>

        {hasChoices && (
          <span className="rounded-full border border-blue-900 bg-blue-950/40 px-2 py-1 text-xs text-blue-300">
            {node.choices?.length} choices
          </span>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => onAdd(index)}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Add Node
        </button>
        <button
          type="button"
          onClick={() => onDuplicate(index)}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => onDelete(index)}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Delete
        </button>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-400">Speaker</span>
          <input
            type="text"
            value={node.speaker}
            onChange={(event) => updateField("speaker", event.target.value)}
            placeholder="Leave blank for a user prompt"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-400">
            {hasChoices ? "User Prompt" : "Text"}
          </span>
          <textarea
            value={node.text}
            onChange={(event) => updateField("text", event.target.value)}
            placeholder={
              hasChoices
                ? "What should the player be asked?"
                : "Enter dialogue..."
            }
            rows={4}
            className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-blue-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-400">Translation</span>
          <textarea
            value={node.translation ?? ""}
            onChange={(event) =>
              updateField("translation", event.target.value || undefined)
            }
            rows={3}
            className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-blue-500"
          />
        </label>

        {hasChoices ? (
          <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Choices</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Each choice has its own destination node.
                </p>
              </div>

              <button
                type="button"
                onClick={addChoice}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-zinc-200"
              >
                + Add Choice
              </button>
            </div>

            <div className="space-y-3">
              {node.choices?.map((choice, choiceIndex) => (
                <div
                  key={choiceIndex}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-500">
                      Choice #{choiceIndex + 1}
                    </span>

                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={choiceIndex === 0}
                        onClick={() => moveChoice(choiceIndex, -1)}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Move choice up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={
                          choiceIndex === (node.choices?.length ?? 1) - 1
                        }
                        onClick={() => moveChoice(choiceIndex, 1)}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Move choice down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteChoice(choiceIndex)}
                        className="rounded border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                    <label className="block">
                      <span className="mb-1 block text-xs text-zinc-500">
                        Choice Text
                      </span>
                      <textarea
                        value={choice.label}
                        onChange={(event) =>
                          updateChoice(
                            choiceIndex,
                            "label",
                            event.target.value,
                          )
                        }
                        rows={2}
                        placeholder="What can the player choose?"
                        className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs text-zinc-500">
                        Next Node
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={choice.next ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          updateChoice(
                            choiceIndex,
                            "next",
                            value === "" ? null : Number(value),
                          );
                        }}
                        placeholder="End"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={addChoice}
            className="w-full rounded-lg border border-dashed border-zinc-700 px-3 py-3 text-sm text-zinc-400 hover:border-zinc-500 hover:bg-zinc-950 hover:text-zinc-200"
          >
            + Turn this node into a User Prompt with Choices
          </button>
        )}

        {!hasChoices && (
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-400">
              Next Node
            </span>
            <input
              type="number"
              min={0}
              value={node.next ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                updateField("next", value === "" ? null : Number(value));
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-blue-500"
            />
          </label>
        )}

        {hasChoices && (
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-400">
              Fallback Next Node
            </span>
            <input
              type="number"
              min={0}
              value={node.next ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                updateField("next", value === "" ? null : Number(value));
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-blue-500"
            />
            <span className="mt-1 block text-xs text-zinc-600">
              Usually leave this empty for a choice node.
            </span>
          </label>
        )}
      </div>
    </article>
  );
}

export default DialogueNode;
