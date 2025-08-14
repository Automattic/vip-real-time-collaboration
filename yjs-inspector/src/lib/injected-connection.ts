interface InjectedConnection {
  createNewDoc?: boolean;
  provider?: string;
  room?: string;
  url?: string;
}

export function getInjectedConnection(): InjectedConnection {
  try {
    return (
      JSON.parse(
        new URLSearchParams(
          new URL(window.location.toString()).hash.replace(/^#\/?/, ""),
        )?.get("connection") || "{}",
      ) ?? {}
    );
  } catch (e) {
    return {};
  }
}
