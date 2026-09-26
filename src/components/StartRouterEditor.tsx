import type { StartRouter } from "../types/content";

type StartRouterEditorProps = {
  router: StartRouter;
  onChange: (updatedRouter: StartRouter) => void;
};

function StartRouterEditor({
  router,
  onChange,
}: StartRouterEditorProps) {
  function updateDefault(value: string) {
    onChange({
      ...router,
      start_index_if_flag: {
        ...router.start_index_if_flag,
        default: Number(value),
      },
    });
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-4">
        <span className="text-xs font-medium text-zinc-500">
          START ROUTER
        </span>

        <h2 className="mt-1 text-lg font-semibold text-white">
          Scene Start
        </h2>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm text-zinc-400">
          Default Start Node
        </span>

        <input
          type="number"
          value={router.start_index_if_flag.default}
          onChange={(event) => updateDefault(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
        />
      </label>
    </div>
  );
}

export default StartRouterEditor;