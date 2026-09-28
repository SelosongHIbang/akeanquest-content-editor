import type { Chapter } from "../types/content";

type SelectedScene = { chapterId: string; sceneName: string } | null;

type SidebarProps = {
  chapters: Record<string, Chapter>;
  selectedChapterId: string;
  selectedScene: SelectedScene;
  onChapterChange: (chapterId: string) => void;
  onSelect: (scene: SelectedScene) => void;
};

function chapterLabel(id: string) {
  return id.replace("chapter", "Chapter ");
}

export default function Sidebar({ chapters, selectedChapterId, selectedScene, onChapterChange, onSelect }: SidebarProps) {
  const chapter = chapters[selectedChapterId];

  return (
    <aside className="file-explorer">
      <div className="file-explorer-section">
        <select
          className="chapter-select"
          aria-label="Select chapter"
          value={selectedChapterId}
          onChange={(event) => onChapterChange(event.target.value)}
        >
          {Object.keys(chapters).map((chapterId) => (
            <option key={chapterId} value={chapterId}>{chapterLabel(chapterId)}</option>
          ))}
        </select>
      </div>
      <div className="file-explorer-section"><span>SCENES</span></div>
      <nav className="file-explorer-list">
        {chapter && Object.keys(chapter).map((item) => (
          <button key={item} type="button" onClick={() => onSelect({ chapterId: selectedChapterId, sceneName: item })} className={selectedScene?.chapterId === selectedChapterId && selectedScene.sceneName === item ? "selected" : ""}>
            <span className="file-icon">◆</span><span>{item}</span>
          </button>
        ))}
      </nav>
    </aside>
  );

}
