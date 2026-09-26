// Editing is now handled inline inside the scene map.
// This component is intentionally kept as a lightweight compatibility component
// for imports from older editor layouts.

import type { DialogueNode as DialogueNodeType } from "../types/content";

type DialogueNodeProps = {
  node: DialogueNodeType;
  index: number;
};

function DialogueNode({ node, index }: DialogueNodeProps) {
  return (
    <article>
      <span>Node #{index}</span>
      <strong>{node.text || "Empty dialogue"}</strong>
    </article>
  );
}

export default DialogueNode;
