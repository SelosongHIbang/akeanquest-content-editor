import type { Chapter } from "../types/content";

type SelectedScene = { chapterId: string; sceneName: string } | null;

type SidebarProps = {
  chapters: Record<string, Chapter>;
  selectedScene: SelectedScene;
  onSelect: (scene: SelectedScene) => void;
};

function chapterLabel(id: string) {
  return id.replace("chapter", "Chapter ");
}

export default function Sidebar({ chapters, selectedScene, onSelect }: SidebarProps) {
  return (
    <aside className="file-explorer">
      <div className="file-explorer-header"><span>EXPLORER</span><strong>Chapters</strong></div>
      <div className="file-explorer-section"><span>SCENES</span></div>
      <nav className="file-explorer-list">
        {Object.entries(chapters).map(([chapterId, chapter]) => (
          <div key={chapterId} className="file-explorer-group">
            <div className="file-explorer-group-header">{chapterLabel(chapterId)}</div>
            {Object.keys(chapter).map((item) => (
              <button key={item} type="button" onClick={() => onSelect({ chapterId, sceneName: item })} className={selectedScene?.chapterId === chapterId && selectedScene.sceneName === item ? "selected" : ""}>
                <span className="file-icon">◆</span><span>{item}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
