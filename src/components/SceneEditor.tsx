import { useMemo, useRef, useState } from "react";
import type {
  Scene,
  IdlePool,
  DialogueNode as DialogueNodeType,
  Choice,
  StartRouter,
} from "../types/content";

import DialogueNode from "./DialogueNode";
import StartRouterEditor from "./StartRouterEditor";

type SceneEditorProps = {
  name: string;
  data: Scene | IdlePool;
  onChange: (updatedData: Scene | IdlePool) => void;
};

type Point = { x: number; y: number };

const NODE_WIDTH = 300;
const NODE_HEIGHT = 230;
const H_GAP = 90;
const V_GAP = 70;

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

function initialPositions(length: number): Point[] {
  return Array.from({ length }, (_, index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    return { x: 80 + column * (NODE_WIDTH + H_GAP), y: 70 + row * (NODE_HEIGHT + V_GAP) };
  });
}

function SceneMap({ sceneData, onSelect }: { sceneData: Scene; onSelect: (index: number) => void }) {
  const [positions, setPositions] = useState<Point[]>(() => initialPositions(sceneData.length));
  const [scale, setScale] = useState(0.9);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ index: number; start: Point; origin: Point } | null>(null);
  const [panning, setPanning] = useState<{ start: Point; origin: Point } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  if (positions.length !== sceneData.length) {
    const next = initialPositions(sceneData.length);
    setPositions((current) => sceneData.map((_, i) => current[i] ?? next[i]));
  }

  const edges = useMemo(() => {
    const result: Array<{ from: number; to: number; label?: string }> = [];
    sceneData.forEach((node, index) => {
      if (!isDialogueNode(node)) return;
      if (node.choices?.length) {
        node.choices.forEach((choice) => {
          if (choice.next !== null && sceneData[choice.next]) result.push({ from: index, to: choice.next, label: choice.label });
        });
      } else if (node.next !== null && sceneData[node.next]) {
        result.push({ from: index, to: node.next });
      }
    });
    return result;
  }, [sceneData]);

  function canvasPoint(event: React.PointerEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startNodeDrag(event: React.PointerEvent, index: number) {
    event.stopPropagation();
    const point = canvasPoint(event);
    setDragging({ index, start: point, origin: positions[index] ?? { x: 80, y: 70 } });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function movePointer(event: React.PointerEvent) {
    const point = canvasPoint(event);
    if (dragging) {
      const dx = (point.x - dragging.start.x) / scale;
      const dy = (point.y - dragging.start.y) / scale;
      setPositions((current) => current.map((position, index) => index === dragging.index ? { x: dragging.origin.x + dx, y: dragging.origin.y + dy } : position));
    } else if (panning) {
      setOffset({ x: panning.origin.x + point.x - panning.start.x, y: panning.origin.y + point.y - panning.start.y });
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
    setScale((value) => Math.min(1.5, Math.max(0.55, Number((value + delta).toFixed(2)))));
  }

  return (
    <div className="scene-map-wrap">
      <div className="scene-map-toolbar">
        <span>Drag nodes to arrange • Drag empty space to pan • Scroll or use +/- to zoom</span>
        <div className="scene-map-actions">
          <button type="button" onClick={() => zoom(0.1)}>+</button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => zoom(-0.1)}>−</button>
          <button type="button" onClick={() => { setScale(0.9); setOffset({ x: 0, y: 0 }); setPositions(initialPositions(sceneData.length)); }}>Reset</button>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="scene-map"
        onPointerDown={startPan}
        onPointerMove={movePointer}
        onPointerUp={stopPointer}
        onPointerCancel={stopPointer}
        onWheel={(event) => { event.preventDefault(); zoom(event.deltaY > 0 ? -0.05 : 0.05); }}
      >
        <div className="scene-map-world" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
          <svg className="scene-map-edges" width="1800" height="1200" aria-hidden="true">
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="currentColor" /></marker>
            </defs>
            {edges.map((edge, edgeIndex) => {
              const from = positions[edge.from] ?? { x: 0, y: 0 };
              const to = positions[edge.to] ?? { x: 0, y: 0 };
              const x1 = from.x + NODE_WIDTH;
              const y1 = from.y + NODE_HEIGHT / 2;
              const x2 = to.x;
              const y2 = to.y + NODE_HEIGHT / 2;
              const bend = Math.max(70, Math.abs(x2 - x1) * 0.45);
              return <g key={`${edge.from}-${edge.to}-${edgeIndex}`} className="scene-map-edge">
                <path d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} markerEnd="url(#arrow)" />
                {edge.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8}>{edge.label}</text>}
              </g>;
            })}
          </svg>

          {sceneData.map((node, index) => {
            const position = positions[index] ?? { x: 80, y: 70 };
            const kind = nodeKind(node);
            return (
              <button
                key={index}
                type="button"
                data-node
                className={`scene-map-node scene-map-node-${kind}`}
                style={{ left: position.x, top: position.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
                onPointerDown={(event) => startNodeDrag(event, index)}
                onDoubleClick={() => onSelect(index)}
              >
                <span className="scene-map-node-number">#{index}</span>
                <span className="scene-map-node-type">{kind === "prompt" ? "USER PROMPT" : kind === "router" ? "START" : "DIALOGUE"}</span>
                <strong>{nodeTitle(node, index)}</strong>
                {isDialogueNode(node) && <span className="scene-map-node-preview">{node.text || "Empty dialogue"}</span>}
                {isDialogueNode(node) && node.choices?.length ? (
                  <span className="scene-map-node-choices">{node.choices.length} choice{node.choices.length === 1 ? "" : "s"}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SceneEditor({ name, data, onChange }: SceneEditorProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!isScene(data)) {
    return <section><h2 className="mb-4 text-lg font-bold">{name}</h2><pre className="overflow-auto rounded-lg bg-zinc-900 p-4 text-sm">{JSON.stringify(data, null, 2)}</pre></section>;
  }

  const sceneData = data;
  const selectedNode = selectedIndex === null ? null : sceneData[selectedIndex];

  function updateNode(index: number, updatedNode: DialogueNodeType | StartRouter) {
    const updatedScene = [...sceneData];
    updatedScene[index] = updatedNode;
    onChange(updatedScene);
  }

  function handleAddNode(index: number) {
    const newNode: DialogueNodeType = { speaker: "", text: "", next: null };
    const insertIndex = index + 1;
    const updatedScene: Scene = sceneData.map((node): Scene[number] => {
      if (isDialogueNode(node)) {
        return { ...node, next: node.next !== null && node.next >= insertIndex ? node.next + 1 : node.next, choices: node.choices?.map((choice) => ({ ...choice, next: choice.next !== null && choice.next >= insertIndex ? choice.next + 1 : choice.next })) };
      }
      return node;
    });
    updatedScene.splice(insertIndex, 0, newNode);
    onChange(updatedScene);
    setSelectedIndex(insertIndex);
  }

  function handleDuplicateNode(index: number) {
    const node = sceneData[index];
    if (!isDialogueNode(node)) return;
    const insertIndex = index + 1;
    const shift = (value: number | null) => value !== null && value >= insertIndex ? value + 1 : value;
    const updatedScene: Scene = sceneData.map((item): Scene[number] => isDialogueNode(item) ? { ...item, next: shift(item.next), choices: item.choices?.map((choice) => ({ ...choice, next: shift(choice.next) })) } : item);
    updatedScene.splice(insertIndex, 0, { ...node, next: shift(node.next), choices: node.choices?.map((choice) => ({ ...choice, next: shift(choice.next) })) });
    onChange(updatedScene);
    setSelectedIndex(insertIndex);
  }

  function handleDeleteNode(index: number) {
    if (!isDialogueNode(sceneData[index])) return;
    const updatedScene = sceneData.filter((_, i) => i !== index).map((node) => {
      if (!isDialogueNode(node)) return node;
      const fix = (value: number | null) => value === index ? null : value !== null && value > index ? value - 1 : value;
      return { ...node, next: fix(node.next), choices: node.choices?.map((choice) => ({ ...choice, next: fix(choice.next) })) };
    });
    onChange(updatedScene);
    setSelectedIndex(null);
  }

  function updateChoice(index: number, choices: Choice[]) {
    const node = sceneData[index];
    if (!isDialogueNode(node)) return;
    updateNode(index, { ...node, choices: choices.length ? choices : undefined });
  }

  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-bold">{name}</h2>
          <p className="mt-1 text-sm text-zinc-500">{sceneData.length} nodes • double-click a node to edit</p>
        </div>
      </div>

      <SceneMap sceneData={sceneData} onSelect={setSelectedIndex} />

      {selectedNode !== null && selectedIndex !== null && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Edit node #{selectedIndex}</h3>
              <p className="text-xs text-zinc-500">Changes are reflected immediately on the map.</p>
            </div>
            <button type="button" onClick={() => setSelectedIndex(null)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300">Close</button>
          </div>

          {isStartRouter(selectedNode) ? (
            <StartRouterEditor router={selectedNode} onChange={(router) => updateNode(selectedIndex, router)} />
          ) : (
            <DialogueNode
              node={selectedNode}
              index={selectedIndex}
              onChange={(index, updatedNode) => updateNode(index, updatedNode)}
              onDuplicate={handleDuplicateNode}
              onDelete={handleDeleteNode}
              onAdd={handleAddNode}
            />
          )}

          {isDialogueNode(selectedNode) && (
            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div><h4 className="font-semibold">User prompt choices</h4><p className="text-xs text-zinc-500">Each choice creates a branch to another node in this scene.</p></div>
                <button type="button" onClick={() => updateChoice(selectedIndex, [...(selectedNode.choices ?? []), { label: "New choice", next: null }])} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">+ Add Choice</button>
              </div>
              {(selectedNode.choices ?? []).map((choice, choiceIndex) => (
                <div key={choiceIndex} className="mb-3 grid gap-2 md:grid-cols-[1fr_150px_auto]">
                  <input value={choice.label} onChange={(event) => { const choices = [...(selectedNode.choices ?? [])]; choices[choiceIndex] = { ...choices[choiceIndex], label: event.target.value }; updateChoice(selectedIndex, choices); }} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="Choice text" />
                  <select value={choice.next ?? ""} onChange={(event) => { const choices = [...(selectedNode.choices ?? [])]; choices[choiceIndex] = { ...choices[choiceIndex], next: event.target.value === "" ? null : Number(event.target.value) }; updateChoice(selectedIndex, choices); }} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                    <option value="">No destination</option>
                    {sceneData.map((_, nodeIndex) => <option key={nodeIndex} value={nodeIndex}>Node #{nodeIndex} — {nodeTitle(sceneData[nodeIndex], nodeIndex)}</option>)}
                  </select>
                  <button type="button" onClick={() => updateChoice(selectedIndex, (selectedNode.choices ?? []).filter((_, i) => i !== choiceIndex))} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Delete</button>
                </div>
              ))}
              {!selectedNode.choices?.length && <p className="text-sm text-zinc-500">No choices yet. Add one to turn this dialogue node into a branching user prompt.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default SceneEditor;
