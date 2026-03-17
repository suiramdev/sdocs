import process from "node:process";

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

type RemoteMessage = Parameters<StreamableHTTPClientTransport["send"]>[0];
type LocalMessage = Parameters<StdioServerTransport["send"]>[0];

const DEFAULT_REMOTE_URL = "http://localhost:4000/api/mcp";

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
};

const remoteUrl = new URL(process.env.SDOCS_MCP_URL ?? DEFAULT_REMOTE_URL);
const localTransport = new StdioServerTransport();
const remoteTransport = new StreamableHTTPClientTransport(remoteUrl);
const keepProcessAlive = (): void => {
  process.stdin.resume();
};
const keepAliveTimer = setInterval(keepProcessAlive, 60_000);

let shuttingDown = false;

const shutdown = async (exitCode: number): Promise<void> => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  clearInterval(keepAliveTimer);

  await Promise.allSettled([localTransport.close(), remoteTransport.close()]);

  process.exit(exitCode);
};

const forwardToRemote = async (message: RemoteMessage): Promise<void> => {
  try {
    await remoteTransport.send(message);
  } catch (error) {
    console.error(
      `[sdocs-mcpb] Failed to forward to remote: ${formatError(error)}`
    );
    await shutdown(1);
  }
};

const forwardToLocal = async (message: LocalMessage): Promise<void> => {
  try {
    await localTransport.send(message);
  } catch (error) {
    console.error(
      `[sdocs-mcpb] Failed to forward to stdio: ${formatError(error)}`
    );
    await shutdown(1);
  }
};

const logStartup = (): void => {
  process.stdin.resume();
  console.error(
    `[sdocs-mcpb] Starting proxy with Node ${process.version} -> ${remoteUrl.toString()}`
  );
};

const registerProcessHandlers = (): void => {
  process.on("uncaughtException", async (error) => {
    console.error(`[sdocs-mcpb] Uncaught exception: ${formatError(error)}`);
    await shutdown(1);
  });
  process.on("unhandledRejection", async (error) => {
    console.error(`[sdocs-mcpb] Unhandled rejection: ${formatError(error)}`);
    await shutdown(1);
  });
  process.on("SIGINT", async () => {
    await shutdown(0);
  });
  process.on("SIGTERM", async () => {
    await shutdown(0);
  });
};

const wireRemoteTransport = (): void => {
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  remoteTransport.onmessage = async (message) => {
    await forwardToLocal(message);
  };
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  remoteTransport.onerror = (error) => {
    console.error(`[sdocs-mcpb] Remote transport error: ${formatError(error)}`);
  };
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  remoteTransport.onclose = async () => {
    await shutdown(0);
  };
};

const wireLocalTransport = (): void => {
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  localTransport.onmessage = async (message) => {
    await forwardToRemote(message);
  };
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  localTransport.onerror = async (error) => {
    console.error(`[sdocs-mcpb] Local transport error: ${formatError(error)}`);
    await shutdown(1);
  };
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  localTransport.onclose = async () => {
    await shutdown(0);
  };
};

const main = async (): Promise<void> => {
  logStartup();
  registerProcessHandlers();
  wireRemoteTransport();
  wireLocalTransport();
  await remoteTransport.start();
  await localTransport.start();
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    console.error(`[sdocs-mcpb] Startup failed: ${formatError(error)}`);
    await shutdown(1);
  }
};

run();
