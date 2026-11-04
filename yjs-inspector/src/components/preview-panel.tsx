import { JsonViewer } from "@textea/json-viewer";
import { Bug } from "lucide-react";
import { useEffect, useState } from "react";
import * as Y from "yjs";
import { yDataType } from "../data-types";
import {
  useConfig,
  useFilterMap,
  useIsFilterEnabled,
  useYDoc,
} from "../state/index";
import { defaultYDoc } from "../state/ydoc";
import { updateDataTypes } from "../update-data-types";
import { EmptyState } from "./empty-state";
import { JsonViewerPanel } from "./json-viewer-panel";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";

function useYDocUpdates(yDoc: Y.Doc) {
  // eslint-disable-next-line @eslint-react/use-state -- The value is intentionally unused; incrementing it rerenders the Y.Doc preview.
  const [, setCount] = useState(0);

  useEffect(() => {
    const callback = () => {
      // Force re-render
      setCount((count) => count + 1);
    };
    yDoc.on("update", callback);
    yDoc.on("subdocs", ({ added }) => {
      for (const subDoc of added) {
        subDoc.on("update", callback);
      }
    });
    return () => {
      yDoc.off("update", callback);
      yDoc.off("subdocs", callback);
      yDoc.subdocs.forEach((subDoc) => {
        subDoc.off("update", callback);
      });
    };
  }, [yDoc]);
}

export function PreviewPanel() {
  const [yDoc] = useYDoc();
  const [config] = useConfig();
  const { resolvedTheme } = useTheme();

  const filterMap = useFilterMap();
  const filterEnable = useIsFilterEnabled();
  const inspectDepth = filterEnable ? 1 : 3;
  const jsonViewerValue = filterEnable ? filterMap : yDoc;

  useYDocUpdates(yDoc);

  const isDefaultYDoc = yDoc === defaultYDoc;

  // Decode the full document state so the raw Y.Item structs can be inspected
  // alongside the parsed document.
  const decodedUpdate = isDefaultYDoc
    ? null
    : Y.decodeUpdate(Y.encodeStateAsUpdate(yDoc));
  const dataTypesForUpdates = config.parseUpdates
    ? [yDataType, ...updateDataTypes]
    : [yDataType];

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex content-center gap-4">
        <h2 className="mb-4 flex-1 text-xl">Inspect</h2>

        <Button variant="secondary" size="sm" asChild>
          <a
            href="https://github.com/yjs/yjs/issues/new/choose"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Bug className="mr-2 h-4 w-4" />
            Report issue
          </a>
        </Button>
      </div>

      <div className="flex-1 overflow-auto rounded-md">
        {isDefaultYDoc ? (
          <EmptyState />
        ) : (
          <>
            <h2 className="mb-4 flex-1 text-xl">Document</h2>
            <JsonViewerPanel
              value={jsonViewerValue}
              yDoc={yDoc}
              inspectDepth={inspectDepth}
            />
            <h2 className="mt-8 mb-4 flex-1 text-xl">Updates</h2>
            <JsonViewer
              className="p-2"
              value={decodedUpdate}
              displaySize={config.showSize}
              theme={resolvedTheme}
              defaultInspectDepth={10}
              valueTypes={dataTypesForUpdates}
            />
          </>
        )}
      </div>
    </div>
  );
}
