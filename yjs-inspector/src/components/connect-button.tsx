import { Cable, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { ConnectProvider } from "../providers/types";
import { useYDoc } from "../state/index";
import { ConnectDialog } from "./connect-dialog";
import { StatusIndicator } from "./status-indicator";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { getInjectedConnection } from "@/lib/injected-connection";
import { WebSocketConnectProvider } from "@/providers/websocket";

export function ConnectButton() {
  const [yDoc, setYDoc] = useYDoc();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ConnectProvider>();
  const [connectState, setConnectState] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");

  const disconnect = useCallback(() => {
    if (connectState === "disconnected") return;
    provider?.disconnect();
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- shameful ignore for now
    setProvider(undefined);
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- shameful ignore for now
    setConnectState("disconnected");
  }, [connectState, provider]);

  // This effect is for convenience, it is evil. We should add the connect logic to global state and handle it there.
  useEffect(() => {
    // Disconnect when the yDoc changes
    if (connectState === "disconnected") return;
    if (!provider) {
      console.error(
        "Provider should be defined when connectState is not disconnected",
        provider,
        connectState,
      );
      return;
    }
    if (yDoc !== provider.doc) {
      disconnect();
    }
  }, [yDoc, disconnect, provider, connectState]);

  const onConnect = useCallback(
    (provider: ConnectProvider) => {
      if (connectState !== "disconnected") {
        throw new Error("Should not be able to connect when already connected");
      }
      provider.connect();
      setConnectState("connecting");
      provider.waitForSynced().then(() => {
        setConnectState("connected");
      });
      setProvider(provider);
      setOpen(false);
    },
    [connectState],
  );

  const handleClick = () => {
    if (connectState === "disconnected") {
      setOpen(true);
      return;
    }
    disconnect();
    return;
  };

  const {
    createNewDoc: initialCreateNewDoc,
    provider: initialProvider,
    room: initialRoom,
    url: initialUrl,
  } = getInjectedConnection();
  const autoConnectTriedRef = useRef(false);

  // Auto-connect once when the page is opened with injected connection details
  // (see websocket-client.ts in the plugin, which logs such a URL).
  useEffect(() => {
    if (
      connectState !== "disconnected" ||
      autoConnectTriedRef.current ||
      initialCreateNewDoc === undefined ||
      initialProvider !== "y-websocket" ||
      !initialRoom ||
      !initialUrl
    ) {
      return;
    }
    // Defer out of the effect so the connect-state updates happen in their own
    // render pass instead of synchronously inside this effect. The guard is set
    // when the timer fires: StrictMode runs this effect twice on mount, and the
    // first run's timer is cleared by its cleanup.
    const timer = setTimeout(() => {
      autoConnectTriedRef.current = true;
      console.log("Autoconnecting from URL parameters:", {
        initialCreateNewDoc,
        initialProvider,
        initialRoom,
        initialUrl,
      });

      // Auto-connect runs on first render, so the current doc is always the
      // untouched default doc. Connect a fresh doc instead: the preview panel
      // shows an empty-state placeholder while the default doc is selected.
      const doc = new Y.Doc();
      setYDoc(doc);
      onConnect(new WebSocketConnectProvider(initialUrl, initialRoom, doc));
    }, 0);
    return () => clearTimeout(timer);
  }, [
    initialCreateNewDoc,
    initialProvider,
    initialRoom,
    initialUrl,
    setYDoc,
    connectState,
    onConnect,
  ]);

  if (connectState === "connecting") {
    return (
      <Dialog open={open} onOpenChange={(open) => setOpen(open)}>
        <Button variant="secondary" onClick={handleClick}>
          <RotateCw className="mr-2 h-4 w-4 animate-spin" />
          Connecting
        </Button>
        <ConnectDialog onConnect={onConnect} />
      </Dialog>
    );
  }

  if (connectState === "connected") {
    return (
      <Dialog open={open} onOpenChange={(open) => setOpen(open)}>
        <Button variant="secondary" onClick={handleClick}>
          <StatusIndicator className="mr-2 h-4 w-4" />
          Disconnect
        </Button>
        <ConnectDialog onConnect={onConnect} />
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(open) => setOpen(open)}>
      <Button variant="secondary" onClick={handleClick}>
        <Cable className="mr-2 h-4 w-4" />
        Connect
      </Button>
      <ConnectDialog onConnect={onConnect} />
    </Dialog>
  );
}
