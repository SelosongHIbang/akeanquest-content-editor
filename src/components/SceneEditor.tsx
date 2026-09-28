import { useMemo, useRef, useState } from "react";
import type {
  Scene,
  IdlePool,
  DialogueNode as DialogueNodeType,
  Choice,
  StartRouter,
} from "../types/content";

type SceneEditorProps = {
  name: string;
  data: Scene | IdlePool;
  onChange: (updatedData: Scene | IdlePool) => void;
};

type Point = { x: number; y: number };

type ChoiceVisual = {
  id: string;
  kind: "choice";
  sceneIndex: number;
  choiceIndex: number;
  label: string;
  next: number | null;
};

type SceneVisual = {
  id: string;
  kind: "scene";
  sceneIndex: number;
};

type VisualNode = ChoiceVisual | SceneVisual;

type Edge = {
  from: string;
  to: string;
  label?: string;
  choice?: boolean;
};

const NODE_WIDTH = 340;
const CHOICE_WIDTH = 300;
const NODE_GAP_X = 90;
const NODE_GAP_Y = 110;
const HEADER_HEIGHT = 68;
const DIALOGUE_BODY_HEIGHT = 150;
const CHOICE_HEIGHT = 74;
const CHOICE_NODE_HEIGHT = 82;
const TREE_PADDING_X = 80;
const TREE_PADDING_Y = 60;

function isScene(data: Scene | IdlePool): data is Scene {
  return Array.isArray(data);
}

function isStartRouter(node: Scene[number]): node is StartRouter {
  return typeof node === "object" && node !== null && "type" in node && node.type === "start_router";
}

function isDialogueNode(node: Scene[number]): node is DialogueNodeType {
  return typeof node === "object" && node !== null && "speaker" in node && "text" in node && "next" in node;
}

function nodeTitle(node: Scene[number], index: number) {
  if (isStartRouter(node)) return "Scene Start";
  if (!isDialogueNode(node)) return `Node ${index}`;
  if (node.choices?.length) return node.text || "User Prompt";
  return node.speaker || node.text || `Node ${index}`;
}

function nodeKind(node: Scene[number]) {
  if (isStartRouter(node)) return "router";
  if (isDialogueNode(node) && node.choices?.length) return "prompt";
  return "dialogue";
}

function nodeHeight(node: Scene[number], expanded: boolean) {
  if (!expanded) return 82;
  if (isStartRouter(node)) return 150;
  if (!isDialogueNode(node)) return 120;
  return node.choices?.length
    ? HEADER_HEIGHT + Math.max(1, node.choices.length) * CHOICE_HEIGHT + 130
    : HEADER_HEIGHT + DIALOGUE_BODY_HEIGHT;
}

function choiceVisualId(sceneIndex: number, choiceIndex: number) {
  return `choice-${sceneIndex}-${choiceIndex}`;
}

function sceneVisualId(sceneIndex: number) {
  return `scene-${sceneIndex}`;
}

function getVisualNodes(sceneData: Scene): VisualNode[] {
  const nodes: VisualNode[] = sceneData.map((_, sceneIndex) => ({
    id: sceneVisualId(sceneIndex),
    kind: "scene",
    sceneIndex,
  }));

  sceneData.forEach((node, sceneIndex) => {
    if (!isDialogueNode(node)) return;
    node.choices?.forEach((choice, choiceIndex) => {
      nodes.push({
        id: choiceVisualId(sceneIndex, choiceIndex),
        kind: "choice",
        sceneIndex,
        choiceIndex,
        label: choice.label,
        next: choice.next,
      });
    });
  });

  return nodes;
}

function getEdges(sceneData: Scene): Edge[] {
  const edges: Edge[] = [];

  sceneData.forEach((node, sceneIndex) => {
    if (isStartRouter(node)) {
      const target = node.start_index_if_flag.default;
      if (sceneData[target]) {
        edges.push({ from: sceneVisualId(sceneIndex), to: sceneVisualId(target) });
      }
      return;
    }

    if (!isDialogueNode(node)) return;

    if (node.choices?.length) {
      node.choices.forEach((choice, choiceIndex) => {
        const choiceId = choiceVisualId(sceneIndex, choiceIndex);
        edges.push({
          from: sceneVisualId(sceneIndex),
          to: choiceId,
          choice: true,
        });
        if (choice.next !== null && sceneData[choice.next]) {
          edges.push({
            from: choiceId,
            to: sceneVisualId(choice.next),
            label: choice.label,
            choice: true,
          });
        }
      });
    } else if (node.next !== null && sceneData[node.next]) {
      edges.push({ from: sceneVisualId(sceneIndex), to: sceneVisualId(node.next) });
    }
  });

  return edges;
}

function autoTreePositions(
  sceneData: Scene,
  expanded: Set<number>,
): Record<string, Point> {
  const visualNodes = getVisualNodes(sceneData);
  const edges = getEdges(sceneData);
  const byId = new Map(visualNodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();

  edges.forEach((edge) => {
    const list = children.get(edge.from) ?? [];
    list.push(edge.to);
    children.set(edge.from, list);
  });

  const rootId = isStartRouter(sceneData[0])
    ? sceneVisualId(0)
    : sceneData[0]
      ? sceneVisualId(0)
      : visualNodes[0]?.id;

  const level = new Map<string, number>();
  if (rootId) level.set(rootId, 0);

  const queue = rootId ? [rootId] : [];
  while (queue.length) {
    const current = queue.shift()!;
    const currentLevel = level.get(current) ?? 0;
    for (const child of children.get(current) ?? []) {
      if (!level.has(child)) {
        level.set(child, currentLevel + 1);
        queue.push(child);
      }
    }
  }

  // Put disconnected/cyclic nodes after the reachable tree instead of leaving them at 0,0.
  let fallbackLevel = Math.max(-1, ...level.values()) + 1;
  visualNodes.forEach((node) => {
    if (!level.has(node.id)) {
      level.set(node.id, fallbackLevel++);
    }
  });

  const levels = new Map<number, VisualNode[]>();
  visualNodes.forEach((node) => {
    const nodeLevel = level.get(node.id) ?? 0;
    const list = levels.get(nodeLevel) ?? [];
    list.push(node);
    levels.set(nodeLevel, list);
  });

  // Order each level around the average parent position so branches stay visually grouped.
  const indexById = new Map(visualNodes.map((node, index) => [node.id, index]));
  const parentIds = new Map<string, string[]>();
  edges.forEach((edge) => {
    const list = parentIds.get(edge.to) ?? [];
    list.push(edge.from);
    parentIds.set(edge.to, list);
  });

  const positions: Record<string, Point> = {};
  const occupied = new Map<number, number>();

  const levelsSorted = [...levels.keys()].sort((a, b) => a - b);
  levelsSorted.forEach((nodeLevel) => {
    const nodes = levels.get(nodeLevel) ?? [];
    nodes.sort((a, b) => {
      const aParents = parentIds.get(a.id) ?? [];
      const bParents = parentIds.get(b.id) ?? [];
      const aParentX = aParents.reduce((sum, parentId) => sum + (positions[parentId]?.x ?? 0), 0) / Math.max(1, aParents.length);
      const bParentX = bParents.reduce((sum, parentId) => sum + (positions[parentId]?.x ?? 0), 0) / Math.max(1, bParents.length);
      return aParentX - bParentX || (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
    });

    let cursor = TREE_PADDING_X;
    nodes.forEach((node) => {
      const width = node.kind === "choice" ? CHOICE_WIDTH : NODE_WIDTH;
      const parents = parentIds.get(node.id) ?? [];
      const preferred = parents.length
        ? parents.reduce((sum, parentId) => sum + (positions[parentId]?.x ?? cursor), 0) / parents.length
        : cursor;
      const x = Math.max(cursor, preferred - width / 2);
      positions[node.id] = { x, y: TREE_PADDING_Y + nodeLevel * (170 + NODE_GAP_Y) };
      cursor = x + width + NODE_GAP_X;
      occupied.set(nodeLevel, cursor);
    });
  });

  // Center the start node over its first branch when possible.
  if (rootId && positions[rootId]) {
    const rootChildren = children.get(rootId) ?? [];
    const childXs = rootChildren.map((id) => positions[id]?.x).filter((x): x is number => x !== undefined);
    if (childXs.length) {
      const rootWidth = byId.get(rootId)?.kind === "choice" ? CHOICE_WIDTH : NODE_WIDTH;
      const center = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      positions[rootId].x = Math.max(TREE_PADDING_X, center - rootWidth / 2);
    }
  }

  return positions;
}

type SceneMapProps = {
  sceneData: Scene;
  expanded: Set<number>;
  onToggle: (index: number) => void;
  onChangeNode: (index: number, node: DialogueNodeType | StartRouter) => void;
  onAdd: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
};

function SceneMap({
  sceneData,
  expanded,
  onToggle,
  onChangeNode,
  onAdd,
  onDuplicate,
  onDelete,
}: SceneMapProps) {
  const initialLayout = useMemo(() => autoTreePositions(sceneData, expanded), [sceneData, expanded]);
  const [positions, setPositions] = useState<Record<string, Point>>(initialLayout);
  const [scale, setScale] = useState(0.9);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ id: string; start: Point; origin: Point } | null>(null);
  const [panning, setPanning] = useState<{ start: Point; origin: Point } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const visualNodes = useMemo(() => getVisualNodes(sceneData), [sceneData]);
  const edges = useMemo(() => getEdges(sceneData), [sceneData]);
  const visualById = useMemo(() => new Map(visualNodes.map((node) => [node.id, node])), [visualNodes]);
  const displayPositions = useMemo(() => {
    const fallback = autoTreePositions(sceneData, expanded);
    return Object.fromEntries(
      visualNodes.map((node) => [node.id, positions[node.id] ?? fallback[node.id] ?? { x: TREE_PADDING_X, y: TREE_PADDING_Y }]),
    ) as Record<string, Point>;
  }, [sceneData, expanded, positions, visualNodes]);

  function canvasPoint(event: React.PointerEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startNodeDrag(event: React.PointerEvent, id: string) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, button, [data-no-drag]")) return;

    event.stopPropagation();
    const point = canvasPoint(event);
    setDragging({
      id,
      start: point,
      origin: displayPositions[id],
    });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function movePointer(event: React.PointerEvent) {
    const point = canvasPoint(event);

    if (dragging) {
      const dx = (point.x - dragging.start.x) / scale;
      const dy = (point.y - dragging.start.y) / scale;
      setPositions((current) => ({
        ...current,
        [dragging.id]: {
          x: dragging.origin.x + dx,
          y: dragging.origin.y + dy,
        },
      }));
    } else if (panning) {
      setOffset({
        x: panning.origin.x + point.x - panning.start.x,
        y: panning.origin.y + point.y - panning.start.y,
      });
    }
  }

  function stopPointer() {
    setDragging(null);
    setPanning(null);
  }

  function startPan(event: React.PointerEvent) {
    if ((event.target as HTMLElement).closest("[data-node]")) return;
    const point = canvasPoint(event);
    setPanning({ start: point, origin: offset });
  }

  function zoom(delta: number) {
    setScale((value) =>
      Math.min(1.5, Math.max(0.55, Number((value + delta).toFixed(2)))),
    );
  }

  function updateDialogueField<K extends keyof DialogueNodeType>(
    index: number,
    field: K,
    value: DialogueNodeType[K],
  ) {
    const node = sceneData[index];
    if (!isDialogueNode(node)) return;
    onChangeNode(index, { ...node, [field]: value });
  }

  function updateChoice(index: number, choiceIndex: number, patch: Partial<Choice>) {
    const node = sceneData[index];
    if (!isDialogueNode(node)) return;

    const choices = [...(node.choices ?? [])];
    choices[choiceIndex] = { ...choices[choiceIndex], ...patch };
    onChangeNode(index, { ...node, choices });
  }

  function addChoice(index: number) {
    const node = sceneData[index];
    if (!isDialogueNode(node)) return;

    onChangeNode(index, {
      ...node,
      choices: [...(node.choices ?? []), { label: "New choice", next: null }],
    });
  }

  function deleteChoice(index: number, choiceIndex: number) {
    const node = sceneData[index];
    if (!isDialogueNode(node)) return;

    const choices = (node.choices ?? []).filter((_, i) => i !== choiceIndex);
    onChangeNode(index, {
      ...node,
      choices: choices.length ? choices : undefined,
    });
  }

  function renderSceneNode(node: Scene[number], index: number) {
    const isExpanded = expanded.has(index);
    const kind = nodeKind(node);

    if (isStartRouter(node)) {
      return (
        <div className={`scene-map-node scene-map-node-router ${isExpanded ? "is-expanded" : ""}`} data-node>
          <div className="scene-map-node-head" data-no-drag>
            <div>
              <span className="scene-map-node-type">START</span>
              <strong>Scene Start</strong>
            </div>
            <button type="button" onClick={() => onToggle(index)} className="scene-map-expand">
              {isExpanded ? "⌃" : "⌄"}
            </button>
          </div>
          {isExpanded && (
            <div className="scene-map-node-editor">
              <p className="scene-map-help">Controls which node starts when a flag condition matches.</p>
              {Object.entries(node.start_index_if_flag).map(([flag, value]) => (
                <div key={flag} className="scene-map-field-row">
                  <span>{flag}</span>
                  <input
                    type="number"
                    value={value}
                    onChange={(event) =>
                      onChangeNode(index, {
                        ...node,
                        start_index_if_flag: {
                          ...node.start_index_if_flag,
                          [flag]: Number(event.target.value),
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (!isDialogueNode(node)) return null;
    const choices = node.choices ?? [];

    return (
      <div
        className={`scene-map-node scene-map-node-${kind} ${isExpanded ? "is-expanded" : ""}`}
        data-node
        onPointerDown={(event) => startNodeDrag(event, sceneVisualId(index))}
      >
        <div className="scene-map-node-head">
          <div className="scene-map-node-heading">
            <span className="scene-map-node-number">#{index}</span>
            <span className="scene-map-node-type">{choices.length ? "USER PROMPT" : "DIALOGUE"}</span>
            <strong>{nodeTitle(node, index)}</strong>
          </div>
          <button
            type="button"
            onClick={() => onToggle(index)}
            className="scene-map-expand"
            data-no-drag
            aria-label={isExpanded ? "Collapse node" : "Expand node"}
          >
            {isExpanded ? "⌃" : "⌄"}
          </button>
        </div>

        {!isExpanded && (
          <div className="scene-map-node-collapsed">
            <span>{node.text || "Empty dialogue"}</span>
            {choices.length > 0 && <em>{choices.length} branch{choices.length === 1 ? "" : "es"}</em>}
          </div>
        )}

        {isExpanded && (
          <div className="scene-map-node-editor" data-no-drag>
            <label>
              <span>Speaker</span>
              <input
                value={node.speaker}
                onChange={(event) => updateDialogueField(index, "speaker", event.target.value)}
                placeholder={choices.length ? "User prompt" : "Speaker"}
              />
            </label>
            <label>
              <span>{choices.length ? "User Prompt" : "Dialogue"}</span>
              <textarea
                value={node.text}
                onChange={(event) => updateDialogueField(index, "text", event.target.value)}
                rows={2}
                placeholder={choices.length ? "What should the player be asked?" : "Enter dialogue..."}
              />
            </label>
            <label>
              <span>Word IDs</span>
              <textarea
                value={(node.word_ids ?? []).join("\n")}
                onChange={(event) =>
                  updateDialogueField(
                    index,
                    "word_ids",
                    event.target.value
                      .split(/[,\n]/)
                      .map((id) => id.trim())
                      .filter(Boolean),
                  )
                }
                rows={2}
                placeholder={"w128\nw129"}
              />
              <small className="scene-map-help">One word ID per line or comma-separated.</small>
            </label>
            {choices.length > 0 ? (
              <div className="scene-choice-branches">
                <div className="scene-choice-title">
                  <span>BRANCH NODES</span>
                  <button type="button" onClick={() => addChoice(index)}>+ Choice</button>
                </div>
                <p className="scene-map-help">Choices are separate branch nodes below this prompt. Edit them on the branch itself.</p>
              </div>
            ) : (
              <div className="scene-map-actions-inline">
                <button type="button" onClick={() => addChoice(index)}>+ Turn into User Prompt</button>
                <label className="scene-inline-next">
                  <span>Next</span>
                  <select
                    value={node.next ?? ""}
                    onChange={(event) =>
                      updateDialogueField(index, "next", event.target.value === "" ? null : Number(event.target.value))
                    }
                  >
                    <option value="">End</option>
                    {sceneData.map((_, nodeIndex) => (
                      <option key={nodeIndex} value={nodeIndex}>Node #{nodeIndex} — {nodeTitle(sceneData[nodeIndex], nodeIndex)}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {choices.length > 0 && (
              <div className="scene-map-actions-inline">
                <label className="scene-inline-next">
                  <span>Fallback Next</span>
                  <select
                    value={node.next ?? ""}
                    onChange={(event) =>
                      updateDialogueField(index, "next", event.target.value === "" ? null : Number(event.target.value))
                    }
                  >
                    <option value="">None</option>
                    {sceneData.map((_, nodeIndex) => (
                      <option key={nodeIndex} value={nodeIndex}>Node #{nodeIndex} — {nodeTitle(sceneData[nodeIndex], nodeIndex)}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="scene-map-node-footer">
              <button type="button" onClick={() => onAdd(index)}>+ Add Node</button>
              <button type="button" onClick={() => onDuplicate(index)}>Duplicate</button>
              <button type="button" className="danger" onClick={() => onDelete(index)}>Delete</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderChoiceNode(choice: ChoiceVisual) {
    return (
      <div
        className="scene-map-choice-node"
        data-node
        onPointerDown={(event) => startNodeDrag(event, choice.id)}
      >
        <div className="scene-map-choice-head">
          <span className="scene-map-node-type">CHOICE</span>
          <span className="scene-map-choice-index">#{choice.choiceIndex + 1}</span>
        </div>
        <input
          data-no-drag
          value={choice.label}
          onChange={(event) => updateChoice(choice.sceneIndex, choice.choiceIndex, { label: event.target.value })}
          placeholder={`Choice ${choice.choiceIndex + 1}`}
        />
        <div className="scene-map-choice-destination">
          <span>GOES TO</span>
          <select
            data-no-drag
            value={choice.next ?? ""}
            onChange={(event) =>
              updateChoice(choice.sceneIndex, choice.choiceIndex, {
                next: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          >
            <option value="">No destination</option>
            {sceneData.map((_, nodeIndex) => (
              <option key={nodeIndex} value={nodeIndex}>Node #{nodeIndex} — {nodeTitle(sceneData[nodeIndex], nodeIndex)}</option>
            ))}
          </select>
          <button
            type="button"
            className="scene-choice-delete"
            data-no-drag
            onClick={() => deleteChoice(choice.sceneIndex, choice.choiceIndex)}
            aria-label={`Delete choice ${choice.choiceIndex + 1}`}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="scene-map-wrap">
      <div className="scene-map-toolbar">
        <span>Tree layout • Drag nodes • Expand to edit • Drag empty space to pan • Scroll to zoom</span>
        <div className="scene-map-actions">
          <button type="button" onClick={() => zoom(0.1)}>+</button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => zoom(-0.1)}>−</button>
          <button
            type="button"
            onClick={() => {
              setScale(0.9);
              setOffset({ x: 0, y: 0 });
              setPositions(autoTreePositions(sceneData, expanded));
            }}
          >
            Arrange Tree
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="scene-map"
        onPointerDown={startPan}
        onPointerMove={movePointer}
        onPointerUp={stopPointer}
        onPointerCancel={stopPointer}
        onWheel={(event) => {
          event.preventDefault();
          zoom(event.deltaY > 0 ? -0.05 : 0.05);
        }}
      >
        <div className="scene-map-world" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
          <svg className="scene-map-edges" width="3200" height="2200" aria-hidden="true">
            <defs>
              <marker id="scene-map-arrow-down" markerWidth="8" markerHeight="8" refX="4" refY="7" orient="auto">
                <path d="M0,0 L8,0 L4,7 z" fill="currentColor" />
              </marker>
            </defs>

            {edges.map((edge, edgeIndex) => {
              const fromNode = visualById.get(edge.from);
              const toNode = visualById.get(edge.to);
              if (!fromNode || !toNode) return null;

              const from = displayPositions[edge.from];
              const to = displayPositions[edge.to];
              if (!from || !to) return null;

              const fromHeight = fromNode.kind === "choice"
                ? CHOICE_NODE_HEIGHT
                : nodeHeight(sceneData[fromNode.sceneIndex], expanded.has(fromNode.sceneIndex));
              const toWidth = toNode.kind === "choice" ? CHOICE_WIDTH : NODE_WIDTH;

              // Every connection leaves the bottom-center of its source and enters the top-center of its target.
              const x1 = from.x + (fromNode.kind === "choice" ? CHOICE_WIDTH : NODE_WIDTH) / 2;
              const y1 = from.y + fromHeight + 8;
              const x2 = to.x + toWidth / 2;
              const y2 = to.y - 8;
              const bend = Math.max(45, Math.abs(y2 - y1) * 0.42);

              return (
                <g key={`${edge.from}-${edge.to}-${edgeIndex}`} className={`scene-map-edge ${edge.choice ? "is-choice" : ""}`}>
                  <path
                    d={`M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`}
                    markerEnd="url(#scene-map-arrow-down)"
                  />
                  {edge.label && (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6}>{edge.label}</text>
                  )}
                </g>
              );
            })}
          </svg>

          {visualNodes.map((visual) => {
            const position = displayPositions[visual.id];
            const width = visual.kind === "choice" ? CHOICE_WIDTH : NODE_WIDTH;
            return (
              <div
                key={visual.id}
                style={{
                  position: "absolute",
                  left: position.x,
                  top: position.y,
                  width,
                  minHeight: visual.kind === "choice"
                    ? CHOICE_NODE_HEIGHT
                    : nodeHeight(sceneData[visual.sceneIndex], expanded.has(visual.sceneIndex)),
                }}
              >
                {visual.kind === "choice"
                  ? renderChoiceNode(visual)
                  : renderSceneNode(sceneData[visual.sceneIndex], visual.sceneIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SceneEditor({ name, data, onChange }: SceneEditorProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (!isScene(data)) {
    return (
      <section>
        <h2 className="mb-4 text-lg font-bold">{name}</h2>
        <pre className="overflow-auto rounded-lg bg-zinc-900 p-4 text-sm">{JSON.stringify(data, null, 2)}</pre>
      </section>
    );
  }

  const sceneData = data;

  function updateNode(index: number, updatedNode: DialogueNodeType | StartRouter) {
    const updatedScene = [...sceneData];
    updatedScene[index] = updatedNode;
    onChange(updatedScene);
  }

  function handleAddNode(index: number) {
    const newNode: DialogueNodeType = { speaker: "", text: "", next: null };
    const insertIndex = index + 1;
    const shift = (value: number | null) => value !== null && value >= insertIndex ? value + 1 : value;

    const updatedScene: Scene = sceneData.map((node): Scene[number] => {
      if (!isDialogueNode(node)) return node;
      return {
        ...node,
        next: shift(node.next),
        choices: node.choices?.map((choice) => ({ ...choice, next: shift(choice.next) })),
      };
    });

    updatedScene.splice(insertIndex, 0, newNode);
    onChange(updatedScene);
    setExpanded((current) => {
      const next = new Set<number>();
      current.forEach((value) => next.add(value >= insertIndex ? value + 1 : value));
      next.add(insertIndex);
      return next;
    });
  }

  function handleDuplicateNode(index: number) {
    const node = sceneData[index];
    if (!isDialogueNode(node)) return;

    const insertIndex = index + 1;
    const shift = (value: number | null) => value !== null && value >= insertIndex ? value + 1 : value;
    const updatedScene: Scene = sceneData.map((item): Scene[number] =>
      isDialogueNode(item)
        ? { ...item, next: shift(item.next), choices: item.choices?.map((choice) => ({ ...choice, next: shift(choice.next) })) }
        : item,
    );

    updatedScene.splice(insertIndex, 0, {
      ...node,
      next: shift(node.next),
      choices: node.choices?.map((choice) => ({ ...choice, next: shift(choice.next) })),
    });

    onChange(updatedScene);
    setExpanded((current) => {
      const next = new Set<number>();
      current.forEach((value) => next.add(value >= insertIndex ? value + 1 : value));
      next.add(insertIndex);
      return next;
    });
  }

  function handleDeleteNode(index: number) {
    if (!isDialogueNode(sceneData[index])) return;

    const updatedScene = sceneData
      .filter((_, i) => i !== index)
      .map((node) => {
        if (!isDialogueNode(node)) return node;
        const fix = (value: number | null) => value === index ? null : value !== null && value > index ? value - 1 : value;
        return {
          ...node,
          next: fix(node.next),
          choices: node.choices?.map((choice) => ({ ...choice, next: fix(choice.next) })),
        };
      });

    onChange(updatedScene);
    setExpanded((current) => {
      const next = new Set<number>();
      current.forEach((value) => {
        if (value < index) next.add(value);
        else if (value > index) next.add(value - 1);
      });
      return next;
    });
  }

  function toggleNode(index: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-bold">{name}</h2>
          <p className="mt-1 text-sm text-zinc-500">{sceneData.length} nodes • tree layout with inline editing</p>
        </div>
      </div>
      <SceneMap
        sceneData={sceneData}
        expanded={expanded}
        onToggle={toggleNode}
        onChangeNode={updateNode}
        onAdd={handleAddNode}
        onDuplicate={handleDuplicateNode}
        onDelete={handleDeleteNode}
      />
    </section>
  );
}

export default SceneEditor;
