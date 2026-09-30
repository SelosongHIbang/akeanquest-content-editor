import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Scene, IdlePool, DialogueNode as DialogueNodeType, PhraseBuilderNode, Choice, StartRouter } from "../types/content";
import { resolveWordReferences, syncWordIdsFromText, type WordBankReferenceEntry } from "../utils/wordReferences";

type SceneEditorProps = {
  name: string;
  data: Scene | IdlePool | null;
  onChange: (updatedData: Scene | IdlePool) => void;
  onSave?: () => void;
  onArchive?: () => void;
  wordBank: WordBankReferenceEntry[];
};

type Point = { x: number; y: number };
type SelectedNode = { kind: "scene"; sceneIndex: number } | { kind: "choice"; sceneIndex: number; choiceIndex: number } | { kind: "idle"; tier: keyof IdlePool; index: number };

const NODE_WIDTH = 250;
const CHOICE_WIDTH = 220;
const NODE_GAP_X = 56;
const NODE_GAP_Y = 48;
const TREE_PADDING = 60;

function isScene(data: Scene | IdlePool): data is Scene { return Array.isArray(data); }
function isStartRouter(node: Scene[number]): node is StartRouter {
  return typeof node === "object" && node !== null && "type" in node && node.type === "start_router";
}
function isPhraseBuilderNode(node: Scene[number]): node is PhraseBuilderNode { return typeof node === "object" && node !== null && "type" in node && node.type === "phrase_builder"; }
function isDialogueNode(node: Scene[number]): node is DialogueNodeType {
  return typeof node === "object" && node !== null && "speaker" in node && "text" in node && "next" in node;
}
function title(node: Scene[number], index: number) {
  if (isStartRouter(node)) return "Scene Start";
  if (isPhraseBuilderNode(node)) return node.prompt || "Phrase Builder";
  if (!isDialogueNode(node)) return `Node ${index}`;
  return node.choices?.length ? node.text || "User Prompt" : node.speaker || node.text || `Node ${index}`;
}
function choiceId(sceneIndex: number, choiceIndex: number) { return `choice-${sceneIndex}-${choiceIndex}`; }
function sceneId(sceneIndex: number) { return `scene-${sceneIndex}`; }
function nodeId(selected: SelectedNode) {
  if (selected.kind === "scene") return sceneId(selected.sceneIndex);
  if (selected.kind === "choice") return choiceId(selected.sceneIndex, selected.choiceIndex);
  return `idle-${selected.tier}-${selected.index}`;
}
function nodeHeight(node: Scene[number]) {
  if (isStartRouter(node)) return 70;
  if (isPhraseBuilderNode(node)) return 110;
  if (!isDialogueNode(node)) return 80;
  const text = node.text || "";
  return Math.min(150, 82 + Math.max(0, Math.ceil(text.length / 42) - 1) * 14);
}
function choiceHeight(choice: Choice) {
  return Math.min(120, 72 + Math.max(0, Math.ceil(choice.label.length / 32) - 2) * 14);
}

type Visual = { id: string; kind: "scene" | "choice"; sceneIndex: number; choiceIndex?: number };

function visuals(scene: Scene): Visual[] {
  const result: Visual[] = scene.map((_, i) => ({ id: sceneId(i), kind: "scene", sceneIndex: i }));
  scene.forEach((node, i) => {
    if (!isDialogueNode(node)) return;
    (node.choices ?? []).forEach((_, j) => result.push({ id: choiceId(i, j), kind: "choice", sceneIndex: i, choiceIndex: j }));
  });
  return result;
}

type Edge = { from: string; to: string; choice?: boolean };

function edges(scene: Scene): Edge[] {
  const result: Edge[] = [];
  scene.forEach((node, i) => {
    if (isStartRouter(node)) {
      [...new Set(Object.values(node.start_index_if_flag))]
        .filter((next): next is number => typeof next === "number" && scene[next] !== undefined)
        .forEach((next) => result.push({ from: sceneId(i), to: sceneId(next) }));
      return;
    }
    if (isPhraseBuilderNode(node)) {
      if (node.success !== null && scene[node.success]) result.push({ from: sceneId(i), to: sceneId(node.success) });
      if (node.failure !== null && scene[node.failure]) result.push({ from: sceneId(i), to: sceneId(node.failure) });
      return;
    }
    if (!isDialogueNode(node)) return;
    if (node.choices?.length) {
      node.choices.forEach((choice, j) => {
        const id = choiceId(i, j);
        result.push({ from: sceneId(i), to: id, choice: true });
        if (choice.next !== null && scene[choice.next]) result.push({ from: id, to: sceneId(choice.next), choice: true });
      });
    } else if (node.next !== null && scene[node.next]) {
      result.push({ from: sceneId(i), to: sceneId(node.next) });
    }
  });
  return result;
}

function autoLayout(scene: Scene): Record<string, Point> {
  const positions: Record<string, Point> = {};
  const COLUMN_GAP = 56;
  const ROW_PITCH = 150;
  const STEP_X = NODE_WIDTH + COLUMN_GAP;
  const START_X = TREE_PADDING;
  const START_Y = TREE_PADDING;

  if (!scene.length) return positions;

  // The only layout rule for now:
  //
  //   1. Every outgoing node is placed in the next column.
  //   2. Outgoing nodes are placed on separate rows.
  //   3. The first outgoing node starts on the same row as its parent.
  //   4. Each following outgoing node occupies the next row.
  //
  // Choices are visual nodes, so a prompt's choices are simply its outgoing
  // nodes. A choice's destination is then its own outgoing node.

  const column = new Map<string, number>();
  const row = new Map<string, number>();
  const queue: string[] = [];

  const outgoing = (id: string): string[] => {
    if (id.startsWith("choice-")) {
      const [, sceneIndexText, choiceIndexText] = id.split("-");
      const sceneIndex = Number(sceneIndexText);
      const choiceIndex = Number(choiceIndexText);
      const node = scene[sceneIndex];

      if (!isDialogueNode(node)) return [];
      const next = node.choices?.[choiceIndex]?.next;
      return next !== null && next !== undefined && scene[next]
        ? [sceneId(next)]
        : [];
    }

    const sceneIndex = Number(id.slice("scene-".length));
    const node = scene[sceneIndex];

    if (isStartRouter(node)) {
      return [...new Set(Object.values(node.start_index_if_flag))]
        .filter((next): next is number => typeof next === "number" && scene[next] !== undefined)
        .map(sceneId);
    }

    if (isPhraseBuilderNode(node)) {
      return [node.success, node.failure]
        .filter((next): next is number => next !== null && scene[next])
        .map(sceneId);
    }

    if (!isDialogueNode(node)) return [];

    if (node.choices?.length) {
      return node.choices.map((_, choiceIndex) => choiceId(sceneIndex, choiceIndex));
    }

    return node.next !== null && scene[node.next]
      ? [sceneId(node.next)]
      : [];
  };

  const allVisuals = visuals(scene);
  const visualIds = new Set(allVisuals.map((visual) => visual.id));
  const outgoingById = new Map<string, string[]>();

  allVisuals.forEach((visual) => {
    outgoingById.set(
      visual.id,
      outgoing(visual.id).filter((child) => visualIds.has(child)),
    );
  });

  // Build incoming-edge counts for the reachable graph. A node is only
  // assigned its final column after all of its incoming nodes have been
  // processed, so a later/rightmost precursor cannot be overwritten.
  const root = sceneId(0);
  const reachable = new Set<string>();
  const discoverQueue = [root];

  while (discoverQueue.length) {
    const id = discoverQueue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);

    (outgoingById.get(id) ?? []).forEach((child) => {
      if (!reachable.has(child)) discoverQueue.push(child);
    });
  }

  const incomingCount = new Map<string, number>();
  allVisuals.forEach((visual) => {
    if (reachable.has(visual.id)) incomingCount.set(visual.id, 0);
  });

  reachable.forEach((parent) => {
    (outgoingById.get(parent) ?? []).forEach((child) => {
      if (reachable.has(child)) {
        incomingCount.set(child, (incomingCount.get(child) ?? 0) + 1);
      }
    });
  });

  column.set(root, 0);
  row.set(root, 0);

  // The start node is the fixed root. Any back-edge into it must not prevent
  // the rest of the reachable graph from being laid out.
  incomingCount.set(root, 0);

  const layoutQueue: string[] = [root];

  while (layoutQueue.length) {
    const parent = layoutQueue.shift()!;
    const parentColumn = column.get(parent) ?? 0;
    const parentRow = row.get(parent) ?? 0;
    const children = outgoingById.get(parent) ?? [];

    children.forEach((child, childIndex) => {
      const candidateColumn = parentColumn + 1;

      // Rule 1: every outgoing node is in the next column.
      // Rule 2: when there are multiple precursors, this naturally becomes
      // one column after the rightmost precursor.
      column.set(
        child,
        Math.max(column.get(child) ?? 0, candidateColumn),
      );

      // Keep the first precursor's row assignment; Rule 2 affects only
      // the column for now.
      if (!row.has(child)) {
        row.set(child, parentRow + childIndex);
      }

      const remaining = (incomingCount.get(child) ?? 0) - 1;
      incomingCount.set(child, remaining);

      if (remaining === 0) {
        layoutQueue.push(child);
      }
    });
  }

  // If a connected graph contains a cycle, the cyclic portion cannot be
  // topologically ordered. Give any still-unplaced reachable nodes a
  // deterministic fallback without changing the rules for normal DAGs.
  const cycleQueue = [root];
  const cycleSeen = new Set<string>();

  while (cycleQueue.length) {
    const parent = cycleQueue.shift()!;
    if (cycleSeen.has(parent)) continue;
    cycleSeen.add(parent);

    const parentColumn = column.get(parent) ?? 0;
    const parentRow = row.get(parent) ?? 0;

    (outgoingById.get(parent) ?? []).forEach((child, childIndex) => {
      if (!column.has(child)) {
        column.set(child, parentColumn + 1);
        row.set(child, parentRow + childIndex);
      }
      cycleQueue.push(child);
    });
  }

  // Keep disconnected nodes visible without introducing another positioning
  // rule for connected nodes.
  let fallbackColumn = Math.max(...column.values(), 0) + 1;
  let fallbackRow = 0;

  visuals(scene).forEach((visual) => {
    if (column.has(visual.id)) return;
    column.set(visual.id, fallbackColumn);
    row.set(visual.id, fallbackRow++);
  });

  visuals(scene).forEach((visual) => {
    positions[visual.id] = {
      x: START_X + (column.get(visual.id) ?? 0) * STEP_X,
      y: START_Y + (row.get(visual.id) ?? 0) * ROW_PITCH,
    };
  });

  return positions;
}

type WordBankEntry = WordBankReferenceEntry & {
  gloss: string;
  area: string;
};

function WordIdPicker({
  value,
  onChange,
  wordBank,
}: {
  value: string[];
  onChange: (wordIds: string[]) => void;
  wordBank: WordBankEntry[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = value ?? [];
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const matches = useMemo(() => {
    if (!normalizedQuery) return wordBank.slice(0, 12);
    return wordBank.filter((word) =>
      [word.id, word.akeanon, word.gloss, word.area]
        .some((field) => field.toLocaleLowerCase().includes(normalizedQuery))
    ).slice(0, 20);
  }, [normalizedQuery, wordBank]);

  const selectedEntries = useMemo(
    () => selected.map((id) => wordBank.find((word) => word.id === id)).filter(Boolean) as WordBankEntry[],
    [selected, wordBank],
  );

  function addWord(id: string) {
    if (!selected.includes(id)) onChange([...selected, id]);
    setQuery("");
    setOpen(true);
  }

  function removeWord(id: string) {
    onChange(selected.filter((wordId) => wordId !== id));
  }

  return (
    <div className="word-id-picker">
      <div className="word-id-picker-input-wrap">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && matches.length) {
              e.preventDefault();
              addWord(matches[0].id);
            }
          }}
          placeholder="Search Akeanon word, ID, or gloss…"
          aria-label="Search word bank"
        />
        {open && (
          <div className="word-id-picker-menu">
            {matches.length ? (
              matches.map((word) => (
                <button
                  type="button"
                  key={word.id}
                  className={`word-id-picker-option ${selected.includes(word.id) ? "is-selected" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addWord(word.id)}
                >
                  <span className="word-id-picker-word">{word.akeanon}</span>
                  <span className="word-id-picker-meta">{word.id} · {word.gloss}</span>
                </button>
              ))
            ) : (
              <div className="word-id-picker-empty">No matching word IDs.</div>
            )}
          </div>
        )}
      </div>

      {selectedEntries.length > 0 && (
        <div className="word-id-picker-selected">
          {selectedEntries.map((word) => (
            <span className="word-id-chip" key={word.id}>
              <span>{word.akeanon}</span>
              <code>{word.id}</code>
              <button type="button" aria-label={`Remove ${word.id}`} onClick={() => removeWord(word.id)}>×</button>
            </span>
          ))}
        </div>
      )}

      {selected.some((id) => !wordBank.some((word) => word.id === id)) && (
        <small className="word-id-picker-warning">Some saved IDs are not in the current word bank.</small>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="scene-inspector-field"><span>{label}</span>{children}</label>;
}

function SceneInspector({
  scene,
  selected,
  onChange,
  onAdd,
  onDuplicate,
  onDelete,
  onSelectChoice,
  wordBank,
}: {
  scene: Scene;
  selected: SelectedNode | null;
  onChange: (index: number, node: DialogueNodeType | PhraseBuilderNode | StartRouter) => void;
  onAdd: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onSelectChoice: (choiceIndex: number) => void;
  onAddPhraseBuilder: (index: number) => void;
  wordBank: WordBankEntry[];
}) {
  if (!selected) return <aside className="scene-inspector"><div className="scene-inspector-empty"><strong>No node selected</strong><span>Select a node in the graph to edit its data.</span></div></aside>;

  if (selected.kind === "choice") {
    const parent = scene[selected.sceneIndex];
    if (!isDialogueNode(parent)) return null;
    const choice = parent.choices?.[selected.choiceIndex];
    if (!choice) return null;
    const update = (patch: Partial<Choice>) => {
      const choices = [...(parent.choices ?? [])];
      choices[selected.choiceIndex] = { ...choices[selected.choiceIndex], ...patch };
      onChange(selected.sceneIndex, { ...parent, choices });
    };
    return (
      <aside className="scene-inspector">
        <div className="scene-inspector-header"><span>BRANCH</span><strong>Choice #{selected.choiceIndex + 1}</strong><small>Node #{selected.sceneIndex}</small></div>
        <div className="scene-inspector-body">
          <Field label="Label"><textarea value={choice.label} onChange={(e) => update({ label: e.target.value })} rows={5} /></Field>
          <Field label="Goes to"><select value={choice.next ?? ""} onChange={(e) => update({ next: e.target.value === "" ? null : Number(e.target.value) })}><option value="">No destination</option>{scene.map((_, i) => <option key={i} value={i}>Node #{i} — {title(scene[i], i)}</option>)}</select></Field>
          <div className="scene-inspector-actions"><button type="button" className="danger" onClick={() => {
            const choices = (parent.choices ?? []).filter((_, i) => i !== selected.choiceIndex);
            onChange(selected.sceneIndex, { ...parent, choices: choices.length ? choices : undefined });
          }}>Delete Choice</button></div>
        </div>
      </aside>
    );
  }

  const node = scene[selected.sceneIndex];

  const changeNodeType = (type: "dialogue" | "phrase_builder" | "start_router") => {
    if (node.type === type) return;

    if (type === "dialogue") {
      if (isPhraseBuilderNode(node)) {
        const wordIds = node.answer
          .map((word) => wordBank.find((entry) => entry.akeanon.toLocaleLowerCase() === word.toLocaleLowerCase())?.id)
          .filter((id): id is string => Boolean(id));
        onChange(selected.sceneIndex, {
          type: "dialogue",
          speaker: "",
          text: node.answer.join(" "),
          next: node.success,
          translation: node.translation,
          word_ids: wordIds,
        });
      } else if (isStartRouter(node)) {
        onChange(selected.sceneIndex, {
          type: "dialogue",
          speaker: "",
          text: "",
          next: node.start_index_if_flag.default ?? null,
          word_ids: [],
        });
      }
      return;
    }

    if (type === "phrase_builder") {
      if (isDialogueNode(node)) {
        const answer = (node.word_ids ?? [])
          .map((id) => wordBank.find((entry) => entry.id === id)?.akeanon)
          .filter((word): word is string => Boolean(word));
        const referenced = [...new Set(scene.flatMap((item) => isDialogueNode(item) ? (item.word_ids ?? []) : []))]
          .map((id) => wordBank.find((entry) => entry.id === id)?.akeanon)
          .filter((word): word is string => Boolean(word));
        const choices = [...new Set([...answer, ...referenced.filter((word) => !answer.includes(word)).slice(0, 2)])];
        onChange(selected.sceneIndex, {
          type: "phrase_builder",
          prompt: node.text,
          choices,
          answer,
          success: node.next,
          failure: null,
          translation: node.translation,
        });
      } else if (isStartRouter(node)) {
        onChange(selected.sceneIndex, {
          type: "phrase_builder",
          prompt: "",
          choices: [],
          answer: [],
          success: node.start_index_if_flag.default ?? null,
          failure: null,
        });
      }
      return;
    }

    if (type === "start_router") {
      onChange(selected.sceneIndex, {
        type: "start_router",
        start_index_if_flag: {
          default: isStartRouter(node) ? node.start_index_if_flag.default : isDialogueNode(node) ? node.next : isPhraseBuilderNode(node) ? node.success : null,
        },
      });
    }
  };

  if (isPhraseBuilderNode(node)) {
    const update = <K extends keyof PhraseBuilderNode>(field: K, value: PhraseBuilderNode[K]) => onChange(selected.sceneIndex, { ...node, [field]: value });
    const referencedIds = [...new Set(scene.flatMap((item) => isDialogueNode(item) ? (item.word_ids ?? []) : []))];
    const referencedWords = referencedIds.map((id) => wordBank.find((word) => word.id === id)).filter(Boolean) as WordBankEntry[];
    const regenerateChoices = (answer: string[]) => {
      const correct = [...new Set(answer.filter(Boolean))];
      const pool = referencedWords.filter((word) => !correct.includes(word.akeanon));
      const distractors = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(2, pool.length)).map((word) => word.akeanon);
      return [...correct, ...distractors].sort(() => Math.random() - 0.5);
    };
    const setAnswer = (answer: string[]) => onChange(selected.sceneIndex, { ...node, answer, choices: regenerateChoices(answer) });
    return (<aside className="scene-inspector">
      <div className="scene-inspector-header"><span>PHRASE BUILDER</span><strong>Node #{selected.sceneIndex}</strong><small>Construct a sentence from word choices</small></div>
      <div className="scene-inspector-body">
        <Field label="Type"><select value={node.type} onChange={(e) => changeNodeType(e.target.value as "dialogue" | "phrase_builder" | "start_router")}><option value="dialogue">Dialogue</option><option value="phrase_builder">Phrase Builder</option><option value="start_router">Start Router</option></select></Field>
        <Field label="Prompt"><textarea value={node.prompt} onChange={(e) => update("prompt", e.target.value)} rows={5} placeholder="What should the player construct?" /></Field>
        <Field label="Correct Answer"><div className="phrase-answer-list">
          {node.answer.map((word, index) => <div className="phrase-answer-row" key={index}><span>{index + 1}</span><select value={word} onChange={(e) => { const answer=[...node.answer]; answer[index]=e.target.value; setAnswer(answer); }}><option value="">Select a word…</option>{wordBank.map((entry)=><option key={entry.id} value={entry.akeanon}>{entry.akeanon} · {entry.id}</option>)}</select><button type="button" onClick={()=>setAnswer(node.answer.filter((_,i)=>i!==index))}>×</button></div>)}
          <button type="button" onClick={()=>setAnswer([...node.answer,""])}>+ Add answer word</button>
        </div></Field>
        <Field label="Choices"><div className="phrase-choice-list">{node.choices.map((word,i)=><span className="word-id-chip" key={word+i}><span>{word}</span></span>)}</div><small>Correct answer words + 1–2 random words already referenced in this scene.</small><button type="button" onClick={()=>update("choices",regenerateChoices(node.answer))}>↻ Regenerate distractors</button></Field>
        <Field label="Translation"><textarea value={node.translation ?? ""} onChange={(e)=>update("translation",e.target.value||undefined)} rows={4}/></Field>
        <Field label="Success"><select value={node.success ?? ""} onChange={(e)=>update("success", e.target.value === "" ? null : Number(e.target.value))}><option value="">End</option>{scene.map((_, i) => <option key={i} value={i}>Node #{i} — {title(scene[i], i)}</option>)}</select></Field>
        <Field label="Failure"><select value={node.failure ?? ""} onChange={(e)=>update("failure", e.target.value === "" ? null : Number(e.target.value))}><option value="">End</option>{scene.map((_, i) => <option key={i} value={i}>Node #{i} — {title(scene[i], i)}</option>)}</select></Field>
        <div className="scene-inspector-actions"><button type="button" onClick={()=>onAdd(selected.sceneIndex)}>+ Dialogue Node</button><button type="button" onClick={()=>onAddPhraseBuilder(selected.sceneIndex)}>+ Phrase Builder</button><button type="button" className="danger" onClick={()=>onDelete(selected.sceneIndex)}>Delete</button></div>
      </div></aside>);
  }

  if (isStartRouter(node)) {
    return (
      <aside className="scene-inspector">
        <div className="scene-inspector-header"><span>SCENE NODE</span><strong>Scene Start</strong><small>Node #0</small></div>
        <div className="scene-inspector-body">
          <Field label="Type"><select value={node.type} onChange={(e) => changeNodeType(e.target.value as "dialogue" | "phrase_builder" | "start_router")}><option value="dialogue">Dialogue</option><option value="phrase_builder">Phrase Builder</option><option value="start_router">Start Router</option></select></Field>
          <p className="scene-inspector-help">Controls which node starts when a flag condition matches.</p>
          {Object.entries(node.start_index_if_flag).map(([flag, value]) => (
            <Field key={flag} label={flag}><input type="number" value={value} onChange={(e) => onChange(selected.sceneIndex, { ...node, start_index_if_flag: { ...node.start_index_if_flag, [flag]: Number(e.target.value) } })} /></Field>
          ))}
        </div>
      </aside>
    );
  }

  if (!isDialogueNode(node)) return null;
  const update = <K extends keyof DialogueNodeType>(field: K, value: DialogueNodeType[K]) => onChange(selected.sceneIndex, { ...node, [field]: value });
  const updateText = (text: string) => onChange(selected.sceneIndex, {
    ...node,
    text,
    word_ids: syncWordIdsFromText(text, node.word_ids, wordBank),
  });
  const wordResolution = resolveWordReferences(node.text, wordBank);
  return (
    <aside className="scene-inspector">
      <div className="scene-inspector-header"><span>{node.choices?.length ? "USER PROMPT" : "DIALOGUE"}</span><strong>Node #{selected.sceneIndex}</strong><small>{node.speaker || "No speaker"}</small></div>
      <div className="scene-inspector-body">
        <Field label="Type"><select value={node.type} onChange={(e) => changeNodeType(e.target.value as "dialogue" | "phrase_builder" | "start_router")}><option value="dialogue">Dialogue</option><option value="phrase_builder">Phrase Builder</option><option value="start_router">Start Router</option></select></Field>
        <Field label="Speaker"><input value={node.speaker} onChange={(e) => update("speaker", e.target.value)} placeholder="Speaker" /></Field>
        <Field label={node.choices?.length ? "User Prompt" : "Dialogue"}><textarea value={node.text} onChange={(e) => updateText(e.target.value)} rows={8} /></Field>
        <Field label="Translation"><textarea value={node.translation ?? ""} onChange={(e) => update("translation", e.target.value || undefined)} rows={5} /></Field>
        <Field label="Word IDs"><WordIdPicker value={node.word_ids ?? []} onChange={(wordIds) => update("word_ids", wordIds)} wordBank={wordBank} />
          {wordResolution.unresolved.length ? <small className="word-id-picker-warning">Unresolved \\ references: {wordResolution.unresolved.map((word) => `\\${word}`).join(", ")}</small> : null}
          <small>{wordResolution.wordIds.length ? "Generated from \\word references in the text. They update when the word bank IDs change." : "Search the word bank by Akeanon word, ID, or English gloss. Type \\word in the text to link it automatically."}</small></Field>
        <Field label="Next"><select value={node.next ?? ""} onChange={(e) => update("next", e.target.value === "" ? null : Number(e.target.value))}><option value="">End</option>{scene.map((_, i) => <option key={i} value={i}>Node #{i} — {title(scene[i], i)}</option>)}</select></Field>
        <Field label="Set Flag on Enter"><input value={node.set_flag_on_enter ?? ""} onChange={(e) => update("set_flag_on_enter", e.target.value || undefined)} placeholder="optional flag" /></Field>
        <div className="scene-inspector-section"><div className="scene-inspector-section-title">Choices</div>{node.choices?.map((choice, i) => <button key={i} type="button" className="scene-inspector-choice" onClick={() => onSelectChoice(i)}><span>#{i + 1}</span>{choice.label || "Empty choice"}</button>)}<button type="button" onClick={() => onChange(selected.sceneIndex, { ...node, choices: [...(node.choices ?? []), { label: "New choice", next: null }] })}>+ Add Choice</button></div>
        <div className="scene-inspector-actions"><button type="button" onClick={() => onAdd(selected.sceneIndex)}>+ Add Node</button><button type="button" onClick={() => onDuplicate(selected.sceneIndex)}>Duplicate</button><button type="button" className="danger" onClick={() => onDelete(selected.sceneIndex)}>Delete</button></div>
      </div>
    </aside>
  );
}

function IdlePoolInspector({
  pool,
  selected,
  onChange,
  wordBank,
}: {
  pool: IdlePool;
  selected: Extract<SelectedNode, { kind: "idle" }> | null;
  onChange: (tier: keyof IdlePool, index: number, entry: IdlePool[keyof IdlePool][number]) => void;
  wordBank: WordBankEntry[];
}) {
  if (!selected) return <aside className="scene-inspector"><div className="scene-inspector-empty"><strong>No idle node selected</strong><span>Select an idle node from the pool to edit it.</span></div></aside>;

  const entries = pool[selected.tier];
  const entry = entries[selected.index];
  if (!entry) return null;

  const update = <K extends keyof typeof entry>(field: K, value: (typeof entry)[K]) =>
    onChange(selected.tier, selected.index, { ...entry, [field]: value });
  const updateText = (text: string) => onChange(selected.tier, selected.index, {
    ...entry,
    text,
    word_ids: syncWordIdsFromText(text, entry.word_ids, wordBank),
  });
  const wordResolution = resolveWordReferences(entry.text, wordBank);

  return (
    <aside className="scene-inspector">
      <div className="scene-inspector-header">
        <span>IDLE POOL · {selected.tier.toUpperCase()}</span>
        <strong>Idle #{selected.index}</strong>
        <small>{entry.speaker || "No speaker"}</small>
      </div>
      <div className="scene-inspector-body">
        <Field label="Speaker"><input value={entry.speaker} onChange={(e) => update("speaker", e.target.value)} placeholder="Speaker" /></Field>
        <Field label="Dialogue"><textarea value={entry.text} onChange={(e) => updateText(e.target.value)} rows={8} /></Field>
        <Field label="Word IDs">
          <WordIdPicker value={entry.word_ids ?? []} onChange={(wordIds) => update("word_ids", wordIds)} wordBank={wordBank} />
          {wordResolution.unresolved.length ? <small className="word-id-picker-warning">Unresolved \\ references: {wordResolution.unresolved.map((word) => `\\${word}`).join(", ")}</small> : null}
          <small>{wordResolution.wordIds.length ? "Generated from \\word references in the text. They update when the word bank IDs change." : "Search the word bank by Akeanon word, ID, or English gloss. Type \\word in the text to link it automatically."}</small>
        </Field>
      </div>
    </aside>
  );
}

function IdlePoolMap({
  pool,
  selected,
  onSelect,
}: {
  pool: IdlePool;
  selected: Extract<SelectedNode, { kind: "idle" }> | null;
  onSelect: (node: Extract<SelectedNode, { kind: "idle" }>) => void;
}) {
  const tiers: (keyof IdlePool)[] = ["low", "med", "high"];

  return (
    <div className="scene-graph-panel">
      <div className="scene-graph-toolbar">
        <span>Idle Pool · select a node to edit it</span>
        <span>{tiers.reduce((total, tier) => total + pool[tier].length, 0)} idle nodes</span>
      </div>
      <div className="idle-pool-grid-wrap">
        <div className="idle-pool-grid">
          {tiers.map((tier) => (
            <section className="idle-pool-column" key={tier}>
              <div className="idle-pool-column-header"><strong>{tier.toUpperCase()}</strong><span>{pool[tier].length}</span></div>
              <div className="idle-pool-column-grid">
                {pool[tier].map((entry, index) => {
                  const isSelected = selected?.tier === tier && selected.index === index;
                  return (
                    <button type="button" key={`${tier}-${index}`} className={`idle-pool-node ${isSelected ? "selected" : ""}`} onClick={() => onSelect({ kind: "idle", tier, index })}>
                      <span className="idle-pool-node-type">IDLE #{index}</span>
                      <strong>{entry.text || "Empty idle line"}</strong>
                      <small>{entry.speaker || "No speaker"}</small>
                    </button>
                  );
                })}
                {!pool[tier].length && <div className="idle-pool-empty">No idle nodes</div>}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneMap({ scene, selected, onSelect }: { scene: Scene; selected: SelectedNode | null; onSelect: (node: SelectedNode) => void }) {
  const [positions, setPositions] = useState<Record<string, Point>>(() => autoLayout(scene));
  const [scale, setScale] = useState(0.9);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [panning, setPanning] = useState<{ start: Point; origin: Point } | null>(null);
  const didPanRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => autoLayout(scene), [scene]);

  const display = useMemo(() => Object.fromEntries(visuals(scene).map((node) => [node.id, layout[node.id]])) as Record<string, Point>, [scene, layout]);

  function point(e: React.PointerEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
  }
  function panStart(e: React.PointerEvent) {
    didPanRef.current = false;
    setPanning({ start: point(e), origin: offset });
  }
  function panMove(e: React.PointerEvent) {
    if (!panning) return;
    const p = point(e);
    const dx = p.x - panning.start.x;
    const dy = p.y - panning.start.y;
    if (!didPanRef.current && Math.abs(dx) <= 8 && Math.abs(dy) <= 8) return;
    if (!didPanRef.current) {
      didPanRef.current = true;
      (canvasRef.current ?? e.currentTarget).setPointerCapture(e.pointerId);
    }
    setOffset({ x: panning.origin.x + dx, y: panning.origin.y + dy });
  }
  function zoom(delta: number) { setScale((v) => Math.min(1.5, Math.max(0.5, Number((v + delta).toFixed(2))))); }

  function arrange() { setPositions(autoLayout(scene)); setScale(0.9); setOffset({ x: 0, y: 0 }); }

  const linkData = edges(scene);
  const nodeVisuals = visuals(scene);

  return (
    <div className="scene-graph-panel">
      <div className="scene-graph-toolbar">
        <span>Node graph · select a node to edit it</span>
        <div><button type="button" onClick={() => zoom(0.1)}>+</button><span>{Math.round(scale * 100)}%</span><button type="button" onClick={() => zoom(-0.1)}>−</button><button type="button" onClick={arrange}>Arrange</button></div>
      </div>
      <div ref={canvasRef} className="scene-graph-canvas" onPointerDown={panStart} onPointerMove={panMove} onPointerUp={() => setPanning(null)} onPointerCancel={() => setPanning(null)} onWheel={(e) => { e.preventDefault(); zoom(e.deltaY > 0 ? -0.05 : 0.05); }}>
        <div className="scene-graph-world" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
          <svg className="scene-graph-edges" width="6000" height="5000">
            {linkData.map((edge, i) => {
              const from = display[edge.from], to = display[edge.to];
              if (!from || !to) return null;
              const fromVisual = nodeVisuals.find((n) => n.id === edge.from)!;
              const toVisual = nodeVisuals.find((n) => n.id === edge.to)!;
              const fromWidth = fromVisual.kind === "choice" ? CHOICE_WIDTH : NODE_WIDTH;
              const toWidth = toVisual.kind === "choice" ? CHOICE_WIDTH : NODE_WIDTH;
              const fromHeight = fromVisual.kind === "choice" ? choiceHeight(scene[fromVisual.sceneIndex].choices![fromVisual.choiceIndex!]) : nodeHeight(scene[fromVisual.sceneIndex]);
              const x1 = from.x + fromWidth;
              const y1 = from.y + fromHeight / 2;
              const x2 = to.x;
              const y2 = to.y + (toVisual.kind === "choice" ? choiceHeight(scene[toVisual.sceneIndex].choices![toVisual.choiceIndex!]) : nodeHeight(scene[toVisual.sceneIndex])) / 2;
              const bend = Math.max(24, Math.abs(x2 - x1) * 0.35);
              return <path key={i} className={`scene-graph-edge ${edge.choice ? "choice" : ""}`} d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} />;
            })}
          </svg>
          {nodeVisuals.map((visual) => {
            const p = display[visual.id];
            const isSelected = selected && nodeId(selected) === visual.id;
            const width = visual.kind === "choice" ? CHOICE_WIDTH : NODE_WIDTH;
            const source = scene[visual.sceneIndex];
            const label = visual.kind === "choice" && isDialogueNode(source) ? source.choices![visual.choiceIndex!].label : title(source, visual.sceneIndex);
            return (
              <button key={visual.id} type="button" data-node className={`scene-graph-node ${visual.kind} ${isSelected ? "selected" : ""}`} style={{ left: p.x, top: p.y, width }} onClick={(e) => {
                e.stopPropagation();
                if (didPanRef.current) {
                  didPanRef.current = false;
                  return;
                }
                onSelect(visual.kind === "choice" ? { kind: "choice", sceneIndex: visual.sceneIndex, choiceIndex: visual.choiceIndex! } : { kind: "scene", sceneIndex: visual.sceneIndex });
              }}>
                <span className="scene-graph-node-type">{visual.kind === "choice" ? "CHOICE" : isStartRouter(source) ? "START" : isPhraseBuilderNode(source) ? "PHRASE BUILDER" : isDialogueNode(source) && source.choices?.length ? "PROMPT" : "DIALOGUE"}</span>
                <strong>{visual.kind === "choice" ? label || "Empty choice" : label}</strong>
                <small>{visual.kind === "choice" ? `→ ${source && isDialogueNode(source) && source.choices?.[visual.choiceIndex!]?.next !== null ? `Node #${source.choices![visual.choiceIndex!].next}` : "End"}` : isPhraseBuilderNode(source) ? `✓ ${source.success ?? "End"} · ✕ ${source.failure ?? "End"}` : `#${visual.sceneIndex}`}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SceneEditor({ name, data, onChange, onSave, onArchive, wordBank }: SceneEditorProps) {
  const sceneData = data && isScene(data) ? data : null;
  const idlePoolData = data && !isScene(data) ? data : null;
  const [selected, setSelected] = useState<SelectedNode | null>(
    sceneData?.length ? { kind: "scene", sceneIndex: 0 } : idlePoolData?.low.length ? { kind: "idle", tier: "low", index: 0 } : null
  );
  const hasSelection = data !== null;

  function updateNode(index: number, node: DialogueNodeType | PhraseBuilderNode | StartRouter) {
    if (!sceneData) return;
    const next = [...sceneData];
    next[index] = node;
    onChange(next);
  }

  function updateIdle(tier: keyof IdlePool, index: number, entry: IdlePool[keyof IdlePool][number]) {
    if (!idlePoolData) return;
    const next: IdlePool = { ...idlePoolData, [tier]: idlePoolData[tier].map((item, itemIndex) => itemIndex === index ? entry : item) };
    onChange(next);
  }

  function addPhraseBuilder(index: number) { if (!sceneData) return; const insert=index+1; const shift=(v:number|null)=>v!==null&&v>=insert?v+1:v; const next=sceneData.map((node):Scene[number]=>isDialogueNode(node)?{...node,next:shift(node.next),choices:node.choices?.map(c=>({...c,next:shift(c.next)}))}:isPhraseBuilderNode(node)?{...node,success:shift(node.success),failure:shift(node.failure)}:node); next.splice(insert,0,{type:"phrase_builder",prompt:"",choices:[],answer:[],success:null,failure:null}); onChange(next); setSelected({kind:"scene",sceneIndex:insert}); }

  function addNode(index: number) {
    if (!sceneData) return;
    const insert = index + 1;
    const shift = (v: number | null) => v !== null && v >= insert ? v + 1 : v;
    const next = sceneData.map((node): Scene[number] => isDialogueNode(node) ? { ...node, next: shift(node.next), choices: node.choices?.map((c) => ({ ...c, next: shift(c.next) })) } : isPhraseBuilderNode(node) ? { ...node, success: shift(node.success), failure: shift(node.failure) } : node);
    next.splice(insert, 0, { speaker: "", text: "", next: null, word_ids: [] });
    onChange(next);
    setSelected({ kind: "scene", sceneIndex: insert });
  }

  function duplicateNode(index: number) {
    if (!sceneData) return;
    const node = sceneData[index];
    if (!isDialogueNode(node)) return;
    const insert = index + 1;
    const shift = (v: number | null) => v !== null && v >= insert ? v + 1 : v;
    const next = sceneData.map((item): Scene[number] => isDialogueNode(item) ? { ...item, next: shift(item.next), choices: item.choices?.map((c) => ({ ...c, next: shift(c.next) })) } : isPhraseBuilderNode(item) ? { ...item, success: shift(item.success), failure: shift(item.failure) } : item);
    next.splice(insert, 0, { ...node, next: shift(node.next), choices: node.choices?.map((c) => ({ ...c, next: shift(c.next) })) });
    onChange(next);
    setSelected({ kind: "scene", sceneIndex: insert });
  }

  function deleteNode(index: number) {
    if (!sceneData || (!isDialogueNode(sceneData[index]) && !isPhraseBuilderNode(sceneData[index]))) return;
    const next = sceneData.filter((_, i) => i !== index).map((node): Scene[number] => {
      const fix = (v: number | null) => v === index ? null : v !== null && v > index ? v - 1 : v;
      if (isPhraseBuilderNode(node)) return { ...node, success: fix(node.success), failure: fix(node.failure) };
      if (!isDialogueNode(node)) return node;
      return { ...node, next: fix(node.next), choices: node.choices?.map((c) => ({ ...c, next: fix(c.next) })) };
    });
    onChange(next);
    setSelected(index > 0 ? { kind: "scene", sceneIndex: index - 1 } : next.length ? { kind: "scene", sceneIndex: 0 } : null);
  }

  return (
    <div className="scene-editor-shell">
      <div className="scene-editor-titlebar">
        <div>
          <strong>{name}</strong>
          {sceneData ? <span>{sceneData.length} nodes</span> : data ? <span>Idle pool</span> : <span>No scene selected</span>}
          {hasSelection && <span className="save-status">● Draft saved locally</span>}
        </div>
        <div className="scene-editor-actions">
          <button type="button" onClick={onSave} disabled={!hasSelection}>Save JSON</button>
          <button type="button" className="archive-button" onClick={onArchive} disabled={!sceneData}>Archive Scene</button>
        </div>
      </div>
      {!data ? (
        <div className="editor-empty"><strong>Select a scene</strong><span>Choose a scene from the explorer to open its node tree.</span></div>
      ) : idlePoolData ? (
        <div className="scene-editor-body">
          <IdlePoolMap pool={idlePoolData} selected={selected?.kind === "idle" ? selected : null} onSelect={setSelected} />
          <IdlePoolInspector pool={idlePoolData} selected={selected?.kind === "idle" ? selected : null} onChange={updateIdle} wordBank={wordBank} />
        </div>
      ) : (
        <div className="scene-editor-body">
          <SceneMap scene={sceneData!} selected={selected} onSelect={setSelected} />
          <SceneInspector scene={sceneData!} selected={selected} onChange={updateNode} onAdd={addNode} onDuplicate={duplicateNode} onDelete={deleteNode} onSelectChoice={(choiceIndex) => setSelected({ kind: "choice", sceneIndex: selected?.kind === "scene" ? selected.sceneIndex : 0, choiceIndex })} onAddPhraseBuilder={addPhraseBuilder} wordBank={wordBank} />
        </div>
      )}
    </div>
  );
}
